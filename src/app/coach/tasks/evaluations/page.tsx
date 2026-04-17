"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Team, Player } from "@/lib/types";
import {
  aggregatePhaseScores,
  getImprovement,
  getTaskScores,
  type EvaluationRow,
} from "@/lib/taskScore";

export default function TaskEvaluationDashboardPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/teams");
        if (!res.ok) throw new Error("팀 목록을 불러오지 못했습니다.");
        const data = (await res.json()) as Team[];
        if (cancelled) return;
        setTeams(data);
        setSelectedTeamId((prev) => {
          if (prev && data.some((t) => t.id === prev)) return prev;
          return data[0]?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      setPlayers([]);
      setEvaluations([]);
      return;
    }
    let cancelled = false;
    async function loadTeamData() {
      try {
        setLoading(true);
        setError(null);
        const [playersRes, evalRes] = await Promise.all([
          fetch(`/api/players?teamId=${encodeURIComponent(selectedTeamId)}`),
          fetch(`/api/teams/${encodeURIComponent(selectedTeamId)}/player-evaluations`),
        ]);
        if (!playersRes.ok || !evalRes.ok) {
          throw new Error("선수/평가 데이터를 불러오지 못했습니다.");
        }
        const playersData = (await playersRes.json()) as Player[];
        const evalData = (await evalRes.json()) as EvaluationRow[];
        if (cancelled) return;
        setPlayers(playersData);
        setEvaluations(evalData);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTeamData();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  const filteredEvaluations = useMemo(() => {
    if (periodPreset === "all") return evaluations;

    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;

    if (periodPreset === "30d") {
      to = now;
      from = new Date(now);
      from.setDate(from.getDate() - 30);
    } else {
      if (dateFrom) {
        const f = new Date(dateFrom);
        if (!Number.isNaN(f.getTime())) {
          f.setHours(0, 0, 0, 0);
          from = f;
        }
      }
      if (dateTo) {
        const t = new Date(dateTo);
        if (!Number.isNaN(t.getTime())) {
          t.setHours(23, 59, 59, 999);
          to = t;
        }
      }
    }

    return evaluations.filter((e) => {
      const raw = e.createdAt ?? null;
      if (!raw) return true;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [evaluations, periodPreset, dateFrom, dateTo]);

  const byPhase = useMemo(
    () => aggregatePhaseScores(filteredEvaluations),
    [filteredEvaluations],
  );

  const rows = useMemo(
    () =>
      players.map((p) => {
        const scores = getTaskScores(byPhase, p.id);
        const improvement = getImprovement(byPhase, p.id);
        return { player: p, scores, improvement };
      }),
    [byPhase, players],
  );

  const teamAverage = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    let sumU = 0;
    let sumA = 0;
    let sumE = 0;
    let sumImpr = 0;
    let cntImpr = 0;
    rows.forEach(({ scores, improvement }) => {
      sumU += scores.understanding;
      sumA += scores.achievement;
      sumE += scores.evaluation;
      if (improvement != null) {
        sumImpr += improvement;
        cntImpr += 1;
      }
    });
    return {
      understanding: sumU / rows.length,
      achievement: sumA / rows.length,
      evaluation: sumE / rows.length,
      improvement: cntImpr > 0 ? sumImpr / cntImpr : null,
    };
  }, [rows]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/coach"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 코치 대시보드
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-slate-100">과제 평가 대시보드</h1>
        <p className="text-sm text-slate-400">
          자기평가(사전/사후)와 코치 평가 결과를 기반으로 선수별 이해·달성·평가·개선 점수를
          확인할 수 있습니다.
        </p>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">팀 선택</span>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="min-w-[160px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">기간</span>
            <select
              value={periodPreset}
              onChange={(e) =>
                setPeriodPreset(e.target.value as "all" | "30d" | "custom")
              }
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="all">전체</option>
              <option value="30d">최근 30일</option>
              <option value="custom">직접 선택</option>
            </select>
            {periodPreset === "custom" && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                />
                <span className="text-[11px] text-slate-500">~</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                />
              </>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            선수 {players.length}명 / 평가 {filteredEvaluations.length}건 (전체{" "}
            {evaluations.length}건)
          </span>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : players.length === 0 ? (
          <p className="text-sm text-slate-400">
            선택된 팀에 등록된 선수가 없습니다. 팀/선수 관리를 먼저 진행해 주세요.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800/80 text-[11px] uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">선수</th>
                  <th className="px-3 py-2 text-left">이해도 (사전)</th>
                  <th className="px-3 py-2 text-left">달성도 (사후)</th>
                  <th className="px-3 py-2 text-left">코치 평가</th>
                  <th className="px-3 py-2 text-right">개선도</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player, scores, improvement }) => (
                  <tr
                    key={player.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-left text-slate-100">
                      <div className="flex flex-col">
                        <span className="text-sm">{player.name}</span>
                        {player.position && (
                          <span className="text-[11px] text-slate-500">
                            {player.position}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-200">
                          {scores.understanding.toFixed(1)}%
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-400/80"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, scores.understanding),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-emerald-200">
                          {scores.achievement.toFixed(1)}%
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, scores.achievement),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-left align-middle">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-sky-200">
                          {scores.evaluation.toFixed(1)}%
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, scores.evaluation),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      {improvement == null ? (
                        <span className="text-[11px] text-slate-500">데이터 부족</span>
                      ) : (
                        <span
                          className={
                            improvement >= 0 ? "text-emerald-300" : "text-rose-300"
                          }
                        >
                          {improvement >= 0 ? "+" : ""}
                          {improvement.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {teamAverage && (
                <tfoot>
                  <tr className="border-t border-emerald-700/70 bg-slate-900/90">
                    <td className="px-3 py-2 text-left text-[11px] font-semibold text-emerald-300">
                      팀 평균
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-emerald-200">
                      {teamAverage.understanding.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-emerald-200">
                      {teamAverage.achievement.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-emerald-200">
                      {teamAverage.evaluation.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-[11px]">
                      {teamAverage.improvement == null ? (
                        <span className="text-[11px] text-slate-500">데이터 부족</span>
                      ) : (
                        <span
                          className={
                            teamAverage.improvement >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }
                        >
                          {teamAverage.improvement >= 0 ? "+" : ""}
                          {teamAverage.improvement.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

