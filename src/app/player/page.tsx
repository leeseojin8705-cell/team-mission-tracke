"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type {
  Player,
  Schedule,
  Task,
  TaskDetails,
  Team,
  TaskProgress,
  StatCategory,
  StatDefinition,
} from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, isMeasurementCategory } from "@/lib/statDefinition";

function getPlayerIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("playerId");
  } catch {
    return trimmed;
  }
}

function parseTaskDetails(t: Task): TaskDetails | null {
  const raw = t.details;
  if (raw == null) return null;
  if (typeof raw === "object" && raw !== null) return raw as TaskDetails;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TaskDetails;
    } catch {
      return null;
    }
  }
  return null;
}

const RADAR_SIZE = 180;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.8;

function MiniPlayerRadar({
  categories,
  values,
}: {
  categories: StatCategory[];
  values: Record<string, number>;
}) {
  const n = categories.length;
  if (n === 0) return null;
  const angleStep = (2 * Math.PI) / n;
  const getPoint = (value: number, index: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, Math.min(5, value)) / 5) * RADAR_R;
    return {
      x: RADAR_CX + r * Math.cos(angle),
      y: RADAR_CY + r * Math.sin(angle),
    };
  };
  const polygonPoints = categories
    .map((c, i) => getPoint(values[c.id] ?? 0, i))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="flex justify-center">
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
        {[1, 3, 5].map((level) => {
          const r = (level / 5) * RADAR_R;
          const pts = categories
            .map((_, i) => {
              const angle = angleStep * i - Math.PI / 2;
              return `${RADAR_CX + r * Math.cos(angle)},${RADAR_CY + r * Math.sin(angle)}`;
            })
            .join(" ");
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="rgba(148,163,184,0.25)"
              strokeWidth="1"
            />
          );
        })}
        <polygon
          points={polygonPoints}
          fill="rgba(56,189,248,0.25)"
          stroke="rgba(56,189,248,0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function PlayerHomeInner() {
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcementCount, setAnnouncementCount] = useState<number | null>(null);

  const [currentPlayerId, setCurrentPlayerId] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessCodeInput, setAccessCodeInput] = useState("");

  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const [absenceModalSchedule, setAbsenceModalSchedule] = useState<Schedule | null>(null);
  const [absenceReasons, setAbsenceReasons] = useState<Set<string>>(new Set());
  const [absenceReasonText, setAbsenceReasonText] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceSubmittedIds, setAbsenceSubmittedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.ok ? r.json() : { session: null })
      .then((data: { session?: { role: string; playerId: string } | null }) => {
        if (cancelled) return;
        if (data.session?.role === "player" && data.session.playerId) {
          setCurrentPlayerId(data.session.playerId);
          setIsLoggedIn(true);
          return;
        }
        setIsLoggedIn(false);
        const fromUrl = searchParams.get("playerId");
        if (fromUrl) {
          setCurrentPlayerId(fromUrl);
          try {
            window.localStorage.setItem("tmt:lastRole", "player");
            window.localStorage.setItem("tmt:lastPlayerId", fromUrl);
          } catch {
            // ignore
          }
        } else {
          try {
            const stored = window.localStorage.getItem("tmt:lastPlayerId");
            if (stored) setCurrentPlayerId(stored);
          } catch {
            // ignore
          }
        }
      });
    return () => { cancelled = true; };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadBase() {
      if (!currentPlayerId) {
        if (!cancelled) {
          setTeams([]);
          setPlayers([]);
          setSchedules([]);
          setTasks([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const meRes = await fetch(
          `/api/players/${encodeURIComponent(currentPlayerId)}`,
        );
        if (!meRes.ok) {
          throw new Error("선수 정보를 불러오지 못했습니다.");
        }
        const me = (await meRes.json()) as Player | null;
        if (!me?.teamId) {
          throw new Error("팀에 소속된 선수만 이용할 수 있습니다.");
        }
        const tid = me.teamId;

        const [teamsRes, playersRes, schedulesRes, tasksRes] = await Promise.all(
          [
            fetch(`/api/teams?teamId=${encodeURIComponent(tid)}`),
            fetch(`/api/players?teamId=${encodeURIComponent(tid)}`),
            fetch(`/api/schedules?teamId=${encodeURIComponent(tid)}`),
            fetch(`/api/tasks?playerId=${encodeURIComponent(currentPlayerId)}`),
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

  useEffect(() => {
    if (!currentPlayerId) return;
    let cancelled = false;
    const player = players.find((p) => p.id === currentPlayerId);
    if (player?.teamId) {
      fetch(`/api/announcements?teamId=${encodeURIComponent(player.teamId)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((arr: unknown[]) => {
          if (!cancelled && Array.isArray(arr)) setAnnouncementCount(arr.length);
        })
        .catch(() => {
          if (!cancelled) setAnnouncementCount(0);
        });
    } else {
      setAnnouncementCount(0);
    }
    return () => { cancelled = true; };
  }, [currentPlayerId, players]);

  useEffect(() => {
    if (!currentPlayerId) return;
    let cancelled = false;
    fetch(`/api/schedule-absence?playerId=${encodeURIComponent(currentPlayerId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { scheduleId?: string }[]) => {
        if (!cancelled && Array.isArray(arr))
          setAbsenceSubmittedIds(new Set(arr.map((a) => a.scheduleId).filter(Boolean) as string[]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentPlayerId]);

  useEffect(() => {
    if (!absenceModalSchedule || !currentPlayerId) return;
    let cancelled = false;
    fetch(
      `/api/schedule-absence?scheduleId=${encodeURIComponent(absenceModalSchedule.id)}&playerId=${encodeURIComponent(currentPlayerId)}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { reasons?: string[]; reasonText?: string | null }[]) => {
        if (!cancelled && Array.isArray(arr) && arr.length > 0) {
          setAbsenceReasons(new Set(arr[0].reasons ?? []));
          setAbsenceReasonText(arr[0].reasonText ?? "");
        } else {
          setAbsenceReasons(new Set());
          setAbsenceReasonText("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAbsenceReasons(new Set());
          setAbsenceReasonText("");
        }
      });
    return () => { cancelled = true; };
  }, [absenceModalSchedule?.id, currentPlayerId]);

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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [statDef, setStatDef] = useState<StatDefinition | null>(null);
  const [statValues, setStatValues] = useState<Record<string, number> | null>(null);

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

  // 내 스탯 레이더: 최근 30일 평가 기준
  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      if (!currentPlayerId) return;
      try {
        const res = await fetch(
          `/api/players/${encodeURIComponent(currentPlayerId)}/evaluations`,
        );
        if (!res.ok) return;
        const evals = (await res.json()) as {
          teamId?: string;
          scores: Record<string, number[]>;
          createdAt?: string | null;
        }[];
        if (cancelled || !Array.isArray(evals) || evals.length === 0) {
          setStatDef(null);
          setStatValues(null);
          return;
        }
        const teamId = evals[0]?.teamId;
        let def: StatDefinition = DEFAULT_STAT_DEFINITION;
        if (teamId) {
          const teamRes = await fetch(`/api/teams/${encodeURIComponent(teamId)}`);
          if (teamRes.ok) {
            const teamData = (await teamRes.json()) as Team & {
              statDefinition?: StatDefinition | null;
            };
            if (teamData.statDefinition) def = teamData.statDefinition;
          }
        }
        const now = new Date();
        const to = new Date(now);
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        const filtered = evals.filter((e) => {
          if (!e.createdAt) return true;
          const d = new Date(e.createdAt);
          if (Number.isNaN(d.getTime())) return true;
          return d >= from && d <= to;
        });
        if (filtered.length === 0) {
          setStatDef(null);
          setStatValues(null);
          return;
        }
        const sums: Record<string, number> = {};
        const counts: Record<string, number> = {};
        for (const e of filtered) {
          for (const [catId, arr] of Object.entries(e.scores)) {
            if (!Array.isArray(arr) || arr.length === 0) continue;
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            sums[catId] = (sums[catId] ?? 0) + avg;
            counts[catId] = (counts[catId] ?? 0) + 1;
          }
        }
        const byCat: Record<string, number> = {};
        def.categories.forEach((c) => {
          const sum = sums[c.id] ?? 0;
          const cnt = counts[c.id] ?? 0;
          byCat[c.id] = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0;
        });
        if (!cancelled) {
          setStatDef(def);
          setStatValues(byCat);
        }
      } catch {
        if (!cancelled) {
          setStatDef(null);
          setStatValues(null);
        }
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

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

  const ABSENCE_REASON_OPTIONS = [
    { value: "injury", label: "부상" },
    { value: "personal", label: "개인사유" },
    { value: "study", label: "학업" },
    { value: "other", label: "기타" },
  ];

  async function submitAbsence() {
    if (!absenceModalSchedule || !currentPlayerId) return;
    setAbsenceSaving(true);
    try {
      const res = await fetch("/api/schedule-absence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: absenceModalSchedule.id,
          playerId: currentPlayerId,
          reasons: Array.from(absenceReasons),
          reasonText: absenceReasonText.trim() || null,
        }),
      });
      if (res.ok) {
        setAbsenceSubmittedIds((prev) => new Set([...prev, absenceModalSchedule.id]));
        setAbsenceModalSchedule(null);
      }
    } finally {
      setAbsenceSaving(false);
    }
  }

  function toggleAbsenceReason(value: string) {
    setAbsenceReasons((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <aside className="w-full max-w-xs space-y-4 rounded-2xl border border-sky-100 bg-white/95 p-4">
          <h1 className="text-xl font-semibold mb-1">선수 대시보드</h1>
          {me && myTeam?.name && (
            <p className="mb-2 text-sm text-sky-800">
              소속:{" "}
              <span className="font-semibold text-sky-900">{myTeam.name}</span>
            </p>
          )}

          {error && (
            <p className="text-sm text-rose-600">
              {error}
            </p>
          )}

          {me ? (
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 p-3 text-sm space-y-1">
              <p className="text-xs text-slate-500">내 정보</p>
              <p className="font-semibold">{me.name}</p>
              <p className="text-slate-600">
                소속:{" "}
                <span className="font-medium text-sky-900">{myTeam?.name ?? "—"}</span>
              </p>
              {me.position && (
                <p className="text-slate-600">
                  포지션: <span className="text-slate-900">{me.position}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-slate-400">
                선수 전용입니다. 코치에게 받은 접속 링크를 입력하세요.
              </p>
              <input
                type="text"
                value={accessCodeInput}
                onChange={(e) => setAccessCodeInput(e.target.value)}
                placeholder="접속 링크 또는 선수 코드"
                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => {
                  const id = getPlayerIdFromInput(accessCodeInput);
                  if (id) {
                    setCurrentPlayerId(id);
                    setAccessCodeInput("");
                    try {
                      window.localStorage.setItem("tmt:lastRole", "player");
                      window.localStorage.setItem("tmt:lastPlayerId", id);
                    } catch {
                      // ignore
                    }
                    window.history.replaceState(null, "", `/player?playerId=${encodeURIComponent(id)}`);
                  }
                }}
                className="w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
              >
                접속하기
              </button>
            </div>
          )}
          <nav className="pt-2 border-t border-sky-100 space-y-1">
            <Link
              href="/player/profile"
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              내 정보
            </Link>
            <Link
              href={
                currentPlayerId
                  ? `/player/stats?playerId=${encodeURIComponent(currentPlayerId)}`
                  : "/player"
              }
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              내 스탯
            </Link>
            <Link
              href={
                currentPlayerId
                  ? `/player/report?playerId=${encodeURIComponent(currentPlayerId)}`
                  : "/player"
              }
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              리포트 (인쇄용)
            </Link>
            <Link
              href={
                currentPlayerId
                  ? `/player/self-evaluate?playerId=${encodeURIComponent(currentPlayerId)}`
                  : "/player"
              }
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              자기평가
            </Link>
            <Link
              href="/player/tasks"
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              내 과제
            </Link>
            <Link
              href="/player/analysis"
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              개인 전술 데이터
            </Link>
            <Link
              href="/player/archive"
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              기록관
            </Link>
            {isLoggedIn && (
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  setIsLoggedIn(false);
                  setCurrentPlayerId("");
                  window.location.href = "/login";
                }}
                className="mt-2 block w-full rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-sky-50 hover:text-slate-800 border-t border-sky-100 pt-2 text-left"
              >
                로그아웃
              </button>
            )}
            <Link
              href="/"
              className="mt-2 block rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-sky-50 hover:text-slate-800 border-t border-sky-100 pt-2"
            >
              ← 역할 선택
            </Link>
          </nav>
        </aside>

        <section className="flex-1 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">데이터를 불러오는 중입니다...</p>
          ) : !me ? (
            <div className="rounded-2xl border border-sky-100 bg-white/95 p-6 text-center space-y-2">
              <p className="text-slate-600">
                등록된 선수는 본인만 볼 수 있습니다.
              </p>
              <p className="text-sm text-slate-500">
                왼쪽에서 코치에게 받은 접속 링크 또는 선수 코드를 입력해 주세요.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
                  <p className="text-xs text-slate-400 mb-1">다가오는 일정</p>
                  <p className="text-2xl font-semibold">{mySchedule.length}</p>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
                  <p className="text-xs text-slate-400 mb-1">할당된 과제</p>
                  <p className="text-2xl font-semibold">{myTasks.length}</p>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
                  <p className="text-xs text-slate-400 mb-1">과제 진행률</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-lg font-semibold">{progressRate}%</p>
                    <p className="text-[11px] text-slate-400">
                      {completedCount}/{totalCount} 완료
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-sky-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all"
                      style={{ width: `${progressRate}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
                  <p className="text-xs text-slate-400 mb-1">팀 공지</p>
                  <p className="text-2xl font-semibold">{announcementCount ?? "…"}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">건</p>
                </div>
              </div>

              {statDef && statValues && (
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">내 스탯 레이더 (최근 30일)</p>
                      <p className="text-[11px] text-slate-500">
                        코치 평가 기반으로, 내 강점/약점 카테고리를 1~5점 다각형으로 표시합니다.
                      </p>
                    </div>
                    <Link
                      href={
                        currentPlayerId
                          ? `/player/report?playerId=${encodeURIComponent(currentPlayerId)}`
                          : "/player"
                      }
                      className="rounded-full border border-sky-300 px-3 py-1 text-[11px] text-sky-800 hover:border-sky-500 hover:text-sky-950"
                    >
                      리포트 보기
                    </Link>
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="md:w-1/2">
                      <MiniPlayerRadar
                        categories={statDef.categories.filter((c) =>
                          !isMeasurementCategory(statDef, c.id),
                        )}
                        values={statValues}
                      />
                    </div>
                    <div className="md:w-1/2 space-y-1 text-[11px] text-slate-600">
                      {statDef.categories
                        .filter((c) => !isMeasurementCategory(statDef, c.id))
                        .map((c) => {
                          const v = statValues[c.id] ?? 0;
                          return (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span style={{ color: c.color }}>{c.label}</span>
                              <span className="text-slate-800">{v.toFixed(1)} / 5.0</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4">
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
                          className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 flex items-start justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium">{s.title}</p>
                            <p className="text-xs text-slate-500">{s.date}</p>
                            {absenceSubmittedIds.has(s.id) && (
                              <span className="mt-1 inline-block text-[10px] text-amber-400">불참 신청함</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setAbsenceModalSchedule(s)}
                            className="shrink-0 rounded border border-sky-200 px-2 py-1 text-xs text-sky-800 hover:bg-sky-100"
                          >
                            불참 의사
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">내 과제</h2>
                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                      <select
                        value={taskFilter}
                        onChange={(e) =>
                          setTaskFilter(
                            e.target.value as "all" | "team" | "personal",
                          )
                        }
                        className="rounded-md border border-sky-200 bg-white px-2 py-1 text-slate-800 outline-none focus:border-sky-500"
                      >
                        <option value="all">전체</option>
                        <option value="team">팀 과제</option>
                        <option value="personal">개인 과제</option>
                      </select>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-sky-300 bg-white"
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
                      {filteredTasks.map((t) => {
                        const details = parseTaskDetails(t);
                        const isLocked = !!details?.playerLocked;
                        const isExpanded = expandedTaskId === t.id;
                        const hasDetails =
                          !isLocked &&
                          details &&
                          (details.detailText?.trim() ||
                            details.goalText?.trim() ||
                            (details.contents && details.contents.length > 0) ||
                            details.singleDate ||
                            (details.dailyStart && details.dailyEnd));
                        return (
                          <li
                            key={t.id}
                            className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{t.title}</p>
                                <p className="text-xs text-slate-600">
                                  카테고리: {t.category}
                                  {t.dueDate && ` · 마감일: ${String(t.dueDate).slice(0, 10)}`}
                                </p>
                                {isLocked && details?.publicAt && (
                                  <p className="text-[11px] text-amber-700 mt-0.5">
                                    공개 예정:{" "}
                                    {new Date(details.publicAt).toLocaleString("ko-KR")}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isLocked && (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                                    공개 전
                                  </span>
                                )}
                                {hasDetails && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedTaskId(isExpanded ? null : t.id)
                                    }
                                    className="text-xs text-slate-500 hover:text-sky-600"
                                  >
                                    {isExpanded ? "접기" : "상세 보기"}
                                  </button>
                                )}
                                <label className="flex items-center gap-1 text-xs text-sky-700">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-sky-300 bg-white disabled:opacity-50"
                                    disabled={isLocked}
                                    checked={!!completedMap[t.id]}
                                    onChange={() => toggleCompleted(t.id)}
                                  />
                                  완료
                                </label>
                              </div>
                            </div>
                            {isExpanded && hasDetails && details && (
                              <div className="rounded-lg border border-sky-200 bg-white p-3 text-xs space-y-2">
                                {details.detailText?.trim() && (
                                  <div>
                                    <p className="text-slate-500 mb-0.5">세부 과제</p>
                                    <p className="text-slate-800 whitespace-pre-wrap">
                                      {details.detailText}
                                    </p>
                                  </div>
                                )}
                                {details.goalText?.trim() && (
                                  <div>
                                    <p className="text-slate-500 mb-0.5">과제 목표</p>
                                    <p className="text-slate-800 whitespace-pre-wrap">
                                      {details.goalText}
                                    </p>
                                  </div>
                                )}
                                {details.contents && details.contents.length > 0 && (
                                  <div>
                                    <p className="text-slate-500 mb-0.5">평가 항목</p>
                                    <p className="text-slate-800">
                                      {details.contents.join(", ")}
                                    </p>
                                  </div>
                                )}
                                {(details.singleDate ||
                                  (details.dailyStart && details.dailyEnd)) && (
                                  <div>
                                    <p className="text-slate-500 mb-0.5">일정</p>
                                    <p className="text-slate-800">
                                      {details.singleDate
                                        ? `단일: ${details.singleDate}`
                                        : `${details.dailyStart} ~ ${details.dailyEnd}`}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                            <div>
                              <textarea
                                value={noteMap[t.id] ?? ""}
                                onChange={(e) => updateNote(t.id, e.target.value)}
                                placeholder="오늘 과제를 하면서 느낀 점이나 기록을 간단히 적어보세요."
                                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                                rows={2}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {absenceModalSchedule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setAbsenceModalSchedule(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-6 shadow-xl shadow-sky-900/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              불참 의사 — {absenceModalSchedule.title}
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              불참 사유를 선택하고 추가 설명을 입력할 수 있습니다.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-400">불참 사유 (중복 선택 가능)</p>
              <div className="flex flex-wrap gap-2">
                {ABSENCE_REASON_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm cursor-pointer hover:bg-sky-100"
                  >
                    <input
                      type="checkbox"
                      checked={absenceReasons.has(opt.value)}
                      onChange={() => toggleAbsenceReason(opt.value)}
                      className="h-4 w-4 rounded border-sky-300 bg-white text-sky-600"
                    />
                    <span className="text-slate-800">{opt.label}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">추가 사유 (선택)</label>
                <textarea
                  value={absenceReasonText}
                  onChange={(e) => setAbsenceReasonText(e.target.value)}
                  placeholder="기타 사유를 입력하세요"
                  rows={2}
                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbsenceModalSchedule(null)}
                className="rounded-lg border border-sky-200 px-4 py-2 text-sm text-slate-600 hover:bg-sky-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={submitAbsence}
                disabled={absenceSaving}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {absenceSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function PlayerHome() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8 text-slate-900">
          <div className="mx-auto max-w-4xl">
            <p className="text-sm text-slate-400">불러오는 중…</p>
          </div>
        </main>
      }
    >
      <PlayerHomeInner />
    </Suspense>
  );
}

