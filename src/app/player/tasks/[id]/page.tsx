"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TaskCoachBlueprintView } from "@/components/TaskCoachBlueprintView";
import {
  formatSubFocusForDisplay,
  type Task,
  type TaskDetails,
  type Player,
  type TeamStaff,
} from "@/lib/types";
import {
  aggregatePhaseScores,
  getTaskScores,
  getImprovement,
  type EvaluationRow,
} from "@/lib/taskScore";

type PlayerSession = {
  session?: {
    role: "player" | "coach";
    playerId?: string;
  };
};

type TaskWithDetails = Task;

type EvaluationSummary = {
  understanding: number;
  achievement: number;
  evaluation: number;
  improvement: number | null;
};

export default function PlayerTaskDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : null;

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [completed, setCompleted] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [evalSummary, setEvalSummary] = useState<EvaluationSummary | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [entryPlayers, setEntryPlayers] = useState<Player[]>([]);
  const [evaluators, setEvaluators] = useState<TeamStaff[]>([]);
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);

        const sessionRes = await fetch("/api/auth/session");
        const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
        const pid =
          sessionData.session?.role === "player" ? sessionData.session.playerId ?? null : null;
        if (!pid) throw new Error("선수 로그인 정보가 없습니다. 다시 로그인해 주세요.");
        if (cancelled) return;
        setPlayerId(pid);

        const taskRes = await fetch(`/api/tasks/${encodeURIComponent(id)}`);
        if (!taskRes.ok) throw new Error("과제를 불러오지 못했습니다.");
        const rawTask = (await taskRes.json()) as TaskWithDetails & {
          details?: TaskWithDetails["details"] | string | null;
        };
        const parsedTask: TaskWithDetails = {
          ...rawTask,
          details:
            typeof rawTask.details === "string"
              ? (() => {
                  try {
                    return JSON.parse(rawTask.details) as TaskWithDetails["details"];
                  } catch {
                    return null;
                  }
                })()
              : rawTask.details ?? null,
        };
        if (cancelled) return;
        setTask(parsedTask);
        setAffiliationName(null);

        const det = parsedTask.details;
        if (
          det &&
          typeof det === "object" &&
          "playerLocked" in det &&
          (det as TaskDetails).playerLocked
        ) {
          const tid = parsedTask.teamId;
          if (tid) {
            const metaRes = await fetch(`/api/teams/${encodeURIComponent(tid)}`);
            if (metaRes.ok) {
              const tm = (await metaRes.json()) as { name?: string };
              if (!cancelled && tm?.name) setAffiliationName(tm.name);
            }
          } else {
            const pr = await fetch(`/api/players/${encodeURIComponent(pid)}`);
            if (pr.ok) {
              const pl = (await pr.json()) as { teamId?: string | null };
              if (pl?.teamId) {
                const tr = await fetch(`/api/teams/${encodeURIComponent(pl.teamId)}`);
                if (tr.ok) {
                  const tm = (await tr.json()) as { name?: string };
                  if (!cancelled && tm?.name) setAffiliationName(tm.name);
                }
              }
            }
          }
          return;
        }

        // 팀 기반 추가 정보 (평가 요약, 엔트리 선수, 평가자)
        const teamId = parsedTask.teamId ?? undefined;
        if (teamId) {
          const [evalRes, playersRes, staffRes] = await Promise.all([
            fetch(
              `/api/teams/${encodeURIComponent(teamId)}/player-evaluations?taskId=${encodeURIComponent(
                id,
              )}`,
            ),
            fetch(`/api/players?teamId=${encodeURIComponent(teamId)}`),
            fetch(`/api/teams/${encodeURIComponent(teamId)}/staff`),
          ]);

          if (evalRes.ok) {
            const evalList = (await evalRes.json()) as EvaluationRow[];
            const mine = evalList.filter((e) => e.subjectPlayerId === pid);
            if (mine.length > 0) {
              const byPhase = aggregatePhaseScores(mine);
              const s = getTaskScores(byPhase, pid);
              const diff = getImprovement(byPhase, pid);
              setEvalSummary({ ...s, improvement: diff });
            } else {
              setEvalSummary(null);
            }
          }

          if (playersRes.ok) {
            const teamPlayers = (await playersRes.json()) as Player[];
            setTeamPlayers(teamPlayers);
            const ids =
              Array.isArray(parsedTask.details?.players) &&
              parsedTask.details.players.length > 0
                ? (parsedTask.details.players as string[])
                : [];
            setEntryPlayers(
              ids.length > 0 ? teamPlayers.filter((p) => ids.includes(p.id)) : [],
            );
          }

          if (staffRes.ok) {
            const staffList = (await staffRes.json()) as TeamStaff[];
            const evalIds =
              Array.isArray(parsedTask.details?.evaluators) &&
              parsedTask.details.evaluators.length > 0
                ? (parsedTask.details.evaluators as string[])
                : [];
            setEvaluators(
              evalIds.length > 0 ? staffList.filter((s) => evalIds.includes(s.id)) : [],
            );
          }

          const metaRes = await fetch(`/api/teams/${encodeURIComponent(teamId)}`);
          if (metaRes.ok) {
            const tm = (await metaRes.json()) as { name?: string };
            if (!cancelled && tm?.name) setAffiliationName(tm.name);
          }
        } else {
          const pr = await fetch(`/api/players/${encodeURIComponent(pid)}`);
          if (pr.ok) {
            const pl = (await pr.json()) as { teamId?: string | null };
            if (pl?.teamId) {
              const tr = await fetch(`/api/teams/${encodeURIComponent(pl.teamId)}`);
              if (tr.ok) {
                const tm = (await tr.json()) as { name?: string };
                if (!cancelled && tm?.name) setAffiliationName(tm.name);
              }
            }
          }
        }

        const progressRes = await fetch(
          `/api/task-progress?taskId=${encodeURIComponent(id)}&playerId=${encodeURIComponent(pid)}`,
        );
        if (progressRes.ok) {
          const list = (await progressRes.json()) as {
            taskId: string;
            playerId: string;
            completed: boolean;
            note?: string | null;
          }[];
          const mine = list.find((p) => p.playerId === pid);
          if (mine) {
            setCompleted(mine.completed);
            setNote(mine.note ?? "");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const d = useMemo(() => task?.details ?? null, [task]);

  async function handleSaveProgress() {
    if (!id || !playerId) return;
    try {
      setSaving(true);
      setSaveMessage(null);
      const res = await fetch("/api/task-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: id,
          playerId,
          completed,
          note,
        }),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      setSaveMessage("저장되었습니다.");
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/player/tasks"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 내 과제
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        ) : !task ? (
          <p className="text-sm text-slate-400">과제를 찾을 수 없습니다.</p>
        ) : d?.playerLocked ? (
          <>
            <header className="space-y-1">
              <h1 className="text-xl font-semibold text-slate-100">{task.title}</h1>
              <p className="text-sm text-slate-400">
                {task.teamId ? "팀 과제" : task.playerId ? "개인 과제" : "기타 과제"}
              </p>
              {affiliationName && (
                <p className="text-sm font-medium text-emerald-200/90">
                  소속: {affiliationName}
                </p>
              )}
            </header>

            <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-5 text-sm">
              <p className="font-medium text-amber-100">아직 공개 전인 과제입니다</p>
              <p className="text-xs text-amber-200/80">
                코치가 설정한 공개 일시가 되면 전술·과제 줄·진행 체크 등 전체 내용을 볼 수 있습니다.
              </p>
              {d.publicAt && (
                <p className="text-base font-semibold text-amber-50">
                  공개 예정: {new Date(d.publicAt).toLocaleString("ko-KR")}
                </p>
              )}
              {task.dueDate && (
                <p className="text-xs text-slate-400">
                  마감일시:{" "}
                  {new Date(task.dueDate as string).toLocaleString("ko-KR")}
                </p>
              )}
            </section>
          </>
        ) : (
          <>
            {evalSummary && (
              <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
                <h2 className="text-sm font-semibold text-slate-100">
                  이 과제의 평가 요약
                </h2>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2 rounded-xl bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">이해도 (사전)</p>
                    <p className="text-xl font-semibold text-slate-100">
                      {evalSummary.understanding.toFixed(1)}%
                    </p>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400/80"
                        style={{ width: `${Math.max(
                          0,
                          Math.min(100, evalSummary.understanding),
                        )}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">달성도 (사후)</p>
                    <p className="text-xl font-semibold text-emerald-300">
                      {evalSummary.achievement.toFixed(1)}%
                    </p>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(
                          0,
                          Math.min(100, evalSummary.achievement),
                        )}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">코치 평가</p>
                    <p className="text-xl font-semibold text-sky-300">
                      {evalSummary.evaluation.toFixed(1)}%
                    </p>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.max(
                          0,
                          Math.min(100, evalSummary.evaluation),
                        )}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl bg-slate-900/80 p-3">
                    <p className="text-xs text-slate-400">개선도 (사후 − 사전)</p>
                    <p className="text-xl font-semibold">
                      {evalSummary.improvement == null ? (
                        <span className="text-xs text-slate-500">데이터 부족</span>
                      ) : (
                        <span
                          className={
                            evalSummary.improvement >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }
                        >
                          {evalSummary.improvement >= 0 ? "+" : ""}
                          {evalSummary.improvement.toFixed(1)}%
                        </span>
                      )}
                    </p>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      {evalSummary.improvement != null && (
                        <div
                          className={`h-full rounded-full ${
                            evalSummary.improvement >= 0
                              ? "bg-emerald-400"
                              : "bg-rose-400"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.abs(evalSummary.improvement),
                            )}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <header className="space-y-1">
              <h1 className="text-xl font-semibold text-slate-100">{task.title}</h1>
              <p className="text-sm text-slate-400">
                {task.teamId ? "팀 과제" : task.playerId ? "개인 과제" : "기타 과제"}
              </p>
              {affiliationName && (
                <p className="text-sm font-medium text-emerald-200/90">
                  소속: {affiliationName}
                </p>
              )}
            </header>

            {d && <TaskCoachBlueprintView details={d} />}

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
              <h2 className="text-sm font-semibold text-slate-100">과제 정보</h2>
              <div className="text-xs text-slate-400 space-y-1">
                {(d?.taskTypes?.length || d?.taskType) && (
                  <p>
                    분류:{" "}
                    {d?.taskTypes?.length
                      ? d.taskTypes.join(" · ")
                      : d?.taskType}
                  </p>
                )}
                {Array.isArray(d?.contents) && d!.contents!.length > 0 ? (
                  <p>내용: {d!.contents!.join(", ")}</p>
                ) : (
                  d?.contentCategory && <p>내용: {d.contentCategory}</p>
                )}
                {d?.goalText && <p>목표: {d.goalText}</p>}
                {d?.detailText && <p>세부 내용: {d.detailText}</p>}
                {d?.htmlTaskType === "single" ? (
                  <p>일자: {d.singleDate ?? "-"}</p>
                ) : (
                  <p>
                    기간: {d?.dailyStart ?? "-"} ~ {d?.dailyEnd ?? "-"}
                  </p>
                )}
                {Array.isArray(d?.weekdays) && d!.weekdays!.length > 0 && (
                  <p>
                    요일:{" "}
                    {d!.weekdays!
                      .map((w) => "일월화수목금토"[Number(w)] ?? w)
                      .join(", ")}
                  </p>
                )}
                {(d?.timeStart || d?.timeEnd) && (
                  <p>
                    시간: {d.timeStart ?? "00:00"} ~ {d.timeEnd ?? "23:59"}
                  </p>
                )}
                {d?.preCheckTime && <p>사전 점검: {d.preCheckTime}</p>}
                {formatSubFocusForDisplay(d?.subFocus) ? (
                  <p>세부 초점: {formatSubFocusForDisplay(d?.subFocus)}</p>
                ) : null}
                {Array.isArray(d?.positions) && d.positions.length > 0 && (
                  <p>
                    포지션 대상:{" "}
                    {d.positions.includes("ALL") ? "전체 포지션" : d.positions.join(", ")}
                  </p>
                )}
                {d?.positionWeights && (
                  <p>
                    포지션 중요도:{" "}
                    {["GK", "DF", "MF", "FW"]
                      .map((pos) => `${pos} ${d.positionWeights?.[pos] ?? 0}%`)
                      .join(" / ")}
                  </p>
                )}
                {entryPlayers.length > 0 && (
                  <p>
                    대상 선수:{" "}
                    {entryPlayers
                      .map((p) => (p.position ? `${p.name}(${p.position})` : p.name))
                      .join(", ")}
                  </p>
                )}
                {Array.isArray(d?.formationPlayerAssignments) &&
                  d.formationPlayerAssignments.length > 0 && (
                    <p>
                      슬롯 배정:{" "}
                      {d.formationPlayerAssignments
                        .slice()
                        .sort((a, b) => a.slot - b.slot)
                        .map((row) => {
                          const player = teamPlayers.find((p) => p.id === row.playerId);
                          return `슬롯 ${row.slot + 1} ${
                            player
                              ? `${player.name}${player.position ? `(${player.position})` : ""}`
                              : row.playerId
                          }`;
                        })
                        .join(", ")}
                    </p>
                  )}
                {evaluators.length > 0 && (
                  <p>
                    평가자:{" "}
                    {evaluators
                      .map((s) => (s.role ? `${s.name}(${s.role})` : s.name))
                      .join(", ")}
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
              <h2 className="text-sm font-semibold text-slate-100">내 진행 상황</h2>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(e) => setCompleted(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                  />
                  <span>이 과제를 완료했습니다.</span>
                </label>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-slate-300">내 메모</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="과제를 하면서 느낀 점이나 기록을 남겨 보세요."
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSaveProgress}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {saving ? "저장 중…" : "진행 상황 저장"}
                </button>
                {saveMessage && (
                  <span className="text-[11px] text-slate-300">{saveMessage}</span>
                )}
              </div>
            </section>

            {playerId && id && (
              <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
                <h2 className="text-sm font-semibold text-slate-100">평가 바로가기</h2>
                <p className="text-xs text-slate-400">
                  사전/사후 자기평가를 남기면 코치가 과제 이해도와 달성도를 더 잘 볼 수 있습니다. 아래
                  버튼을 통해 관련 전술 기록과 개인 기록관도 바로 이동할 수 있습니다.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/player/self-evaluate?playerId=${encodeURIComponent(
                      playerId,
                    )}&taskId=${encodeURIComponent(id)}`}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-700"
                  >
                    자기평가 하러 가기
                  </Link>
                  <Link
                    href={`/player/analysis?taskId=${encodeURIComponent(id)}`}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
                  >
                    개인 전술 데이터 보기
                  </Link>
                  <Link
                    href={`/player/archive?taskId=${encodeURIComponent(id)}`}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
                  >
                    개인 기록관 보기
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}


