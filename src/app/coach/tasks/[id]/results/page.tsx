"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, Task } from "@/lib/types";
import {
  aggregatePhaseScores,
  getImprovement,
  getTaskScores,
  type EvaluationRow,
} from "@/lib/taskScore";

type TaskWithDetails = Task & {
  team?: { id: string; name: string } | null;
};

export default function TaskResultPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : null;

  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const taskRes = await fetch(`/api/tasks/${encodeURIComponent(id)}`);
        if (!taskRes.ok) throw new Error("과제 정보를 불러오지 못했습니다.");
        const taskData = (await taskRes.json()) as TaskWithDetails;
        if (cancelled) return;
        setTask(taskData);

        const teamId = taskData.teamId;
        if (!teamId) {
          setPlayers([]);
          setEvaluations([]);
          return;
        }

        const [playersRes, evalRes] = await Promise.all([
          fetch(`/api/players?teamId=${encodeURIComponent(teamId)}`),
          fetch(
            `/api/teams/${encodeURIComponent(
              teamId,
            )}/player-evaluations?taskId=${encodeURIComponent(id)}`,
          ),
        ]);
        if (!playersRes.ok || !evalRes.ok) {
          throw new Error("선수/평가 데이터를 불러오지 못했습니다.");
        }
        const playersData = (await playersRes.json()) as Player[];
        const evalData = (await evalRes.json()) as EvaluationRow[];
        if (cancelled) return;
        setPlayers(playersData);
        setEvaluations(evalData);

        if (!selectedPlayerId && playersData[0]) {
          setSelectedPlayerId(playersData[0].id);
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
  }, [id, selectedPlayerId]);

  const byPhase = useMemo(
    () => aggregatePhaseScores(evaluations),
    [evaluations],
  );

  const entryPlayers = useMemo(() => {
    if (!task?.details?.players || !Array.isArray(task.details.players)) return players;
    const set = new Set(task.details.players);
    return players.filter((p) => set.has(p.id));
  }, [players, task?.details?.players]);

  const currentScores = useMemo(() => {
    if (!selectedPlayerId) return null;
    const scores = getTaskScores(byPhase, selectedPlayerId);
    const improvement = getImprovement(byPhase, selectedPlayerId);
    return { scores, improvement };
  }, [byPhase, selectedPlayerId]);

  if (!id) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-slate-400">과제 ID가 없습니다.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/coach/tasks"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 과제 목록
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
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-xl font-semibold text-slate-100">
                과제 결과 · {task.title}
              </h1>
              <p className="text-sm text-slate-400">
                선수별 이해도·달성도·코치 평가 및 개선도를 확인할 수 있습니다. 이 화면은 현재 팀 전체
                평가 데이터를 기준으로 집계됩니다.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-[260px,1fr]">
              <aside className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
                <div className="mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    과제 정보
                  </p>
                  <p className="mt-1 text-sm text-slate-100">{task.title}</p>
                  {task.details?.goalText && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      목표: {task.details.goalText}
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  {task.details?.htmlTaskType === "single" ? (
                    <p>일자: {task.details.singleDate ?? "-"}</p>
                  ) : (
                    <p>
                      기간: {task.details?.dailyStart ?? "-"} ~ {task.details?.dailyEnd ?? "-"}
                    </p>
                  )}
                  {Array.isArray(task.details?.weekdays) && task.details!.weekdays!.length > 0 && (
                    <p>
                      요일:{" "}
                      {task.details!.weekdays!
                        .map((w) => "일월화수목금토"[Number(w)] ?? w)
                        .join(", ")}
                    </p>
                  )}
                  {(task.details?.timeStart || task.details?.timeEnd) && (
                    <p>
                      시간: {task.details.timeStart ?? "00:00"} ~{" "}
                      {task.details.timeEnd ?? "23:59"}
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    선수 선택
                  </p>
                  {entryPlayers.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      이 과제에 연결된 엔트리 정보가 없습니다. 팀 전체 선수 중에서 평가 데이터를
                      사용합니다.
                    </p>
                  ) : (
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                      {entryPlayers.map((p) => {
                        const on = selectedPlayerId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedPlayerId(p.id)}
                              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] ${
                                on
                                  ? "bg-emerald-600/20 text-emerald-100"
                                  : "bg-slate-900/80 text-slate-200 hover:bg-slate-800/80"
                              }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {p.position && (
                                <span className="ml-2 text-[10px] text-slate-400">
                                  {p.position}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </aside>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
                {!selectedPlayerId || !currentScores ? (
                  <p className="text-sm text-slate-400">왼쪽에서 선수를 선택해 주세요.</p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-xs text-slate-400">이해도 (사전)</p>
                        <p className="mt-1 text-xl font-semibold text-slate-100">
                          {currentScores.scores.understanding.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-xs text-slate-400">달성도 (사후)</p>
                        <p className="mt-1 text-xl font-semibold text-emerald-300">
                          {currentScores.scores.achievement.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-xs text-slate-400">코치 평가</p>
                        <p className="mt-1 text-xl font-semibold text-sky-300">
                          {currentScores.scores.evaluation.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-xs text-slate-400">개선도</p>
                        <p className="mt-1 text-xl font-semibold">
                          {currentScores.improvement == null ? (
                            <span className="text-xs text-slate-500">데이터 부족</span>
                          ) : (
                            <span
                              className={
                                currentScores.improvement >= 0
                                  ? "text-emerald-300"
                                  : "text-rose-300"
                              }
                            >
                              {currentScores.improvement >= 0 ? "+" : ""}
                              {currentScores.improvement.toFixed(1)}%
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      * 세부 항목별 점수는 선수 평가 목록 페이지에서 확인할 수 있으며, 이 화면은 과제
                      수준에서 요약된 이해·달성·평가 점수만 보여줍니다.
                    </p>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

