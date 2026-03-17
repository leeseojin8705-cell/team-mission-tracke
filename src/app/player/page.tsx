"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Player, Schedule, Task, Team, TaskProgress } from "@/lib/types";

export default function PlayerHome() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPlayerId, setCurrentPlayerId] = useState<string>("");

  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes, schedulesRes, tasksRes] = await Promise.all(
          [
            fetch("/api/teams"),
            fetch("/api/players"),
            fetch("/api/schedules"),
            fetch("/api/tasks"),
          ],
        );

        if (
          !teamsRes.ok ||
          !playersRes.ok ||
          !schedulesRes.ok ||
          !tasksRes.ok
        ) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, playersData, schedulesData, tasksData]: [
          Team[],
          Player[],
          Schedule[],
          Task[],
        ] = await Promise.all([
          teamsRes.json(),
          playersRes.json(),
          schedulesRes.json(),
          tasksRes.json(),
        ]);

        if (!cancelled) {
          setTeams(teamsData);
          setPlayers(playersData);
          setSchedules(
            schedulesData.map((s) => ({
              ...s,
              date:
                typeof s.date === "string"
                  ? s.date
                  : new Date(s.date as unknown as string).toISOString(),
            })),
          );
          setTasks(
            tasksData.map((t) => ({
              ...t,
              dueDate:
                t.dueDate && typeof t.dueDate !== "string"
                  ? new Date(t.dueDate as unknown as string).toISOString()
                  : t.dueDate,
            })),
          );

          if (!currentPlayerId && playersData[0]) {
            let initialId: string | null = null;
            try {
              initialId =
                window.localStorage.getItem("tmt:lastPlayerId") ?? null;
            } catch {
              initialId = null;
            }
            const exists =
              initialId && playersData.some((p) => p.id === initialId);
            setCurrentPlayerId(
              exists ? (initialId as string) : playersData[0].id,
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBase();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!currentPlayerId) return;

      try {
        const res = await fetch(
          `/api/task-progress?playerId=${encodeURIComponent(currentPlayerId)}`,
        );
        if (!res.ok) {
          throw new Error("과제 진행 상황을 불러오지 못했습니다.");
        }
        const data: TaskProgress[] = await res.json();
        if (!cancelled) {
          const completed: Record<string, boolean> = {};
          const notes: Record<string, string> = {};
          for (const p of data) {
            completed[p.taskId] = p.completed;
            if (p.note) {
              notes[p.taskId] = p.note;
            }
          }
          setCompletedMap(completed);
          setNoteMap(notes);
        }
      } catch {
        // 진행 상황 로딩 실패는 치명적이지 않으므로 오류는 무시
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  const me = players.find((p) => p.id === currentPlayerId);
  const myTeam = me ? teams.find((t) => t.id === me.teamId) : undefined;

  const mySchedule = useMemo(
    () =>
      me
        ? schedules.filter((s) => s.teamId === me.teamId)
        : ([] as Schedule[]),
    [me, schedules],
  );

  const myTasks = useMemo(
    () =>
      me
        ? tasks.filter(
            (t) => t.teamId === me.teamId || t.playerId === currentPlayerId,
          )
        : ([] as Task[]),
    [me, tasks, currentPlayerId],
  );

  const [taskFilter, setTaskFilter] = useState<"all" | "team" | "personal">(
    "all",
  );
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    return myTasks.filter((t) => {
      if (taskFilter === "team" && !t.teamId) return false;
      if (taskFilter === "personal" && !t.playerId) return false;

      if (overdueOnly && t.dueDate) {
        const due = new Date(t.dueDate);
        if (due >= now) return false;
      }

      return true;
    });
  }, [myTasks, taskFilter, overdueOnly]);

  const completedCount = useMemo(
    () => myTasks.filter((t) => completedMap[t.id]).length,
    [myTasks, completedMap],
  );
  const totalCount = myTasks.length;
  const progressRate =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  async function toggleCompleted(id: string) {
    if (!currentPlayerId) return;
    const next = !completedMap[id];
    setCompletedMap((prev) => ({ ...prev, [id]: next }));

    try {
      await fetch("/api/task-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: id,
          playerId: currentPlayerId,
          completed: next,
          note: noteMap[id] ?? "",
        }),
      });
    } catch {
      // 실패해도 UI는 그대로 두고, 다음 변경 때 다시 시도될 수 있도록 함
    }
  }

  async function updateNote(id: string, value: string) {
    if (!currentPlayerId) return;
    setNoteMap((prev) => ({ ...prev, [id]: value }));

    try {
      await fetch("/api/task-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: id,
          playerId: currentPlayerId,
          completed: completedMap[id] ?? false,
          note: value,
        }),
      });
    } catch {
      // 실패해도 메모는 로컬에 남아 있고, 다음 변경 시 다시 시도
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <aside className="w-full max-w-xs space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h1 className="text-xl font-semibold mb-2">선수 대시보드</h1>

          {error && (
            <p className="text-sm text-rose-300">
              {error}
            </p>
          )}

          <div className="space-y-1 text-sm">
            <p className="text-slate-300">어떤 선수의 화면인지 선택해 보세요.</p>
            <select
              value={currentPlayerId}
              onChange={(e) => {
                const nextId = e.target.value;
                setCurrentPlayerId(nextId);
                try {
                  window.localStorage.setItem("tmt:lastRole", "player");
                  window.localStorage.setItem("tmt:lastPlayerId", nextId);
                } catch {
                  // localStorage 실패는 무시
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              disabled={players.length === 0}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {me && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm space-y-1">
              <p className="font-semibold">{me.name}</p>
              <p className="text-slate-300">
                팀: <span className="text-slate-100">{myTeam?.name}</span>
              </p>
              {me.position && (
                <p className="text-slate-300">
                  포지션: <span className="text-slate-100">{me.position}</span>
                </p>
              )}
            </div>
          )}
          <nav className="pt-2 border-t border-slate-800 space-y-1">
            <Link
              href={currentPlayerId ? `/player/stats?playerId=${encodeURIComponent(currentPlayerId)}` : "/player"}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              내 스탯
            </Link>
            <Link
              href={currentPlayerId ? `/player/self-evaluate?playerId=${encodeURIComponent(currentPlayerId)}` : "/player"}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              자기평가
            </Link>
            <Link
              href="/player/analysis"
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              개인 전술 데이터
            </Link>
            <Link
              href="/player/archive"
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              기록관
            </Link>
          </nav>
        </aside>

        <section className="flex-1 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">데이터를 불러오는 중입니다...</p>
          ) : !me ? (
            <p className="text-sm text-slate-400">
              선택할 수 있는 선수가 없습니다. 코치 화면에서 선수를 먼저 등록해
              주세요.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-xs text-slate-400 mb-1">다가오는 일정</p>
                  <p className="text-2xl font-semibold">{mySchedule.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-xs text-slate-400 mb-1">할당된 과제</p>
                  <p className="text-2xl font-semibold">{myTasks.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-xs text-slate-400 mb-1">과제 진행률</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-lg font-semibold">{progressRate}%</p>
                    <p className="text-[11px] text-slate-400">
                      {completedCount}/{totalCount} 완료
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${progressRate}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <h2 className="mb-2 text-lg font-semibold">내 일정</h2>
                  {mySchedule.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      등록된 일정이 없습니다.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {mySchedule.map((s) => (
                        <li
                          key={s.id}
                          className="rounded-lg bg-slate-900 px-3 py-2"
                        >
                          <p className="font-medium">{s.title}</p>
                          <p className="text-xs text-slate-300">{s.date}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">내 과제</h2>
                    <div className="flex items-center gap-2 text-[11px] text-slate-300">
                      <select
                        value={taskFilter}
                        onChange={(e) =>
                          setTaskFilter(
                            e.target.value as "all" | "team" | "personal",
                          )
                        }
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 outline-none focus:border-emerald-400"
                      >
                        <option value="all">전체</option>
                        <option value="team">팀 과제</option>
                        <option value="personal">개인 과제</option>
                      </select>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                          checked={overdueOnly}
                          onChange={(e) => setOverdueOnly(e.target.checked)}
                        />
                        지각만
                      </label>
                    </div>
                  </div>
                  {myTasks.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      등록된 과제가 없습니다.
                    </p>
                  ) : filteredTasks.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      선택한 필터에 해당하는 과제가 없습니다.
                    </p>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {filteredTasks.map((t) => (
                        <li
                          key={t.id}
                          className="rounded-lg bg-slate-900 px-3 py-2 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{t.title}</p>
                              <p className="text-xs text-slate-300">
                                카테고리: {t.category}
                                {t.dueDate && ` · 마감일: ${t.dueDate}`}
                              </p>
                            </div>
                            <label className="flex items-center gap-1 text-xs text-emerald-300">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                                checked={!!completedMap[t.id]}
                                onChange={() => toggleCompleted(t.id)}
                              />
                              완료
                            </label>
                          </div>
                          <div>
                            <textarea
                              value={noteMap[t.id] ?? ""}
                              onChange={(e) => updateNote(t.id, e.target.value)}
                              placeholder="오늘 과제를 하면서 느낀 점이나 기록을 간단히 적어보세요."
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-emerald-400"
                              rows={2}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

