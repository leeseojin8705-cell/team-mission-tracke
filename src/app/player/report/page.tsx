// @ts-nocheck
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { StatCategory, StatDefinition } from "@/lib/types";
import {
  DEFAULT_STAT_DEFINITION,
  formatCategoryValue,
  getWeightedOverall,
  isMeasurementCategory,
} from "@/lib/statDefinition";
import { aggregatePhaseScores, getImprovement, getTaskScores } from "@/lib/taskScore";

type EvalRow = {
  teamId?: string;
  evaluatorStaffId: string;
  phase?: string | null;
  scores: Record<string, number[]>;
  createdAt?: string | null;
};

type TeamStaff = {
  id: string;
  name: string;
};

type PersonalRecord = {
  id: string;
  playerId: string;
  matchAnalysisId: string | null;
  goals: number;
  assists: number;
  starterType: string | null;
  injured: boolean;
  matchResult: string | null;
  createdAt: string;
  match: {
    id: string;
    name: string | null;
    date: string | null;
    result: string | null;
  } | null;
};

const RADAR_SIZE = 260;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.85;

function PlayerRadarChart({
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
  const axisEndPoints = categories.map((_, i) => getPoint(5, i));

  return (
    <div className="flex justify-center">
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
        {[1, 2, 3, 4, 5].map((level) => {
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
        {axisEndPoints.map((end, i) => (
          <line
            key={i}
            x1={RADAR_CX}
            y1={RADAR_CY}
            x2={end.x}
            y2={end.y}
            stroke="rgba(148,163,184,0.35)"
            strokeWidth="1"
          />
        ))}
        <polygon
          points={polygonPoints}
          fill="rgba(16,185,129,0.25)"
          stroke="rgba(16,185,129,0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function TaskScoreBar({ label, score }: { label: string; score: number }) {
  const safe = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-300 print:text-slate-800">
        <span>{label}</span>
        <span className="font-semibold text-emerald-400 print:text-emerald-700">
          {safe.toFixed(0)}점
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 print:bg-slate-300/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 print:bg-emerald-500"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

function PlayerReportContent() {
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId") ?? "";

  const [evaluations, setEvaluations] = useState<EvalRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, TeamStaff>>({});
  const [def, setDef] = useState<StatDefinition>(DEFAULT_STAT_DEFINITION);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(!!playerId);
  const [error, setError] = useState<string | null>(null);

  const [periodPreset, setPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setAffiliationName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/players/${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { teamId?: string | null } | null) => {
        if (!p?.teamId || cancelled) return null;
        return fetch(`/api/teams/${encodeURIComponent(p.teamId)}`);
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((t: { name?: string } | null) => {
        if (!cancelled) setAffiliationName(t?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setAffiliationName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const safeJson = async <T,>(r: Response, fallback: T): Promise<T> => {
      const text = await r.text();
      if (!text.trim()) return fallback;
      try {
        return JSON.parse(text) as T;
      } catch {
        return fallback;
      }
    };
    fetch(`/api/players/${playerId}/evaluations`)
      .then((r) =>
        safeJson(
          r,
          [] as (EvalRow & {
            teamId?: string;
          })[],
        ),
      )
      .then((list) => {
        if (cancelled) return;
        const evals = Array.isArray(list) ? (list as EvalRow[]) : [];
        setEvaluations(evals);
        const teamId = (list as { teamId?: string }[])[0]?.teamId;
        if (teamId) {
          return Promise.all([
            fetch(`/api/teams/${teamId}`).then((r) =>
              r.ok ? r.json() : null,
            ) as Promise<{ statDefinition?: StatDefinition | null } | null>,
            fetch(`/api/teams/${teamId}/staff`).then((r) =>
              safeJson(r, [] as TeamStaff[]),
            ),
          ]);
        }
        return undefined;
      })
      .then((res) => {
        if (!cancelled && res) {
          const [teamRes, staffList] = res;
          if (teamRes?.statDefinition) setDef(teamRes.statDefinition);
          else setDef(DEFAULT_STAT_DEFINITION);
          const staff = Array.isArray(staffList) ? staffList : [];
          const map: Record<string, TeamStaff> = {};
          staff.forEach((s) => {
            map[s.id] = s;
          });
          setStaffMap(map);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "평가 데이터를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`/api/player-match-records?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PersonalRecord[]) => {
        if (!cancelled && Array.isArray(data)) {
          setRecords(data);
        }
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

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

  const aggregated = useMemo(() => {
    if (filteredEvaluations.length === 0) return null;
    const byCat: Record<string, { sum: number; count: number }> = {};
    def.categories.forEach((c) => {
      byCat[c.id] = { sum: 0, count: 0 };
    });
    filteredEvaluations.forEach((e) => {
      def.categories.forEach((c) => {
        const arr = e.scores[c.id];
        if (Array.isArray(arr) && arr.length > 0) {
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
          byCat[c.id].sum += avg;
          byCat[c.id].count += 1;
        }
      });
    });
    const result: Record<string, number> = {};
    def.categories.forEach((c) => {
      const d = byCat[c.id];
      const avg = d.count ? d.sum / d.count : 0;
      result[c.id] = Math.round(avg * 10) / 10;
    });
    result._overall = getWeightedOverall(result, def);
    return result;
  }, [filteredEvaluations, def]);

  const phaseAggregated = useMemo(
    () =>
      aggregatePhaseScores(
        filteredEvaluations.map((e) => ({
          subjectPlayerId: playerId,
          phase: e.phase,
          scores: e.scores,
        })),
        def.categories.map((c) => c.id),
      ),
    [filteredEvaluations, playerId, def.categories],
  );

  const taskTriple = useMemo(
    () => getTaskScores(phaseAggregated, playerId),
    [phaseAggregated, playerId],
  );

  const strengthsWeaknesses = useMemo(() => {
    if (!aggregated || def.categories.length === 0) return { strengths: [], weaknesses: [] };
    const withVal = def.categories
      .map((c) => ({ ...c, value: aggregated[c.id] ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const n = Math.min(3, withVal.length);
    const strengths = withVal.slice(0, n);
    const weaknesses = [...withVal].reverse().slice(0, n);
    return { strengths, weaknesses };
  }, [aggregated, def.categories]);

  const recordSummary = useMemo(() => {
    if (records.length === 0) {
      return {
        total: 0,
        goals: 0,
        assists: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      };
    }
    let goals = 0;
    let assists = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    for (const r of records) {
      goals += r.goals ?? 0;
      assists += r.assists ?? 0;
      if (r.matchResult === "win") wins += 1;
      else if (r.matchResult === "draw") draws += 1;
      else if (r.matchResult === "loss") losses += 1;
    }
    return {
      total: records.length,
      goals,
      assists,
      wins,
      draws,
      losses,
    };
  }, [records]);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  if (!playerId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400 print:text-black">
          선수 정보가 없습니다. 선수 대시보드에서 진입해 주세요.
        </p>
        <Link
          href="/player"
          className="inline-flex items-center rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 print:hidden"
        >
          ← 선수 대시보드로
        </Link>
      </div>
    );
  }

  if (loading && evaluations.length === 0) {
    return <p className="text-sm text-slate-400 print:text-black">불러오는 중…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200 print:text-red-700 print:bg-transparent print:border-red-400">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm print:border-slate-300 print:bg-white print:text-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400 print:text-slate-700">리포트 대상</p>
            <p className="text-lg font-semibold text-slate-100 print:text-black">
              선수 개인 리포트
            </p>
            {affiliationName && (
              <p className="mt-1 text-sm font-medium text-emerald-200/90 print:text-emerald-800">
                소속: {affiliationName}
              </p>
            )}
            <p className="text-xs text-slate-400 print:text-slate-700">
              코치 평가, 자기평가, 개인 기록관 데이터를 한 장으로 모은 요약 리포트입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 print:text-slate-800">
            <span>기간</span>
            <select
              value={periodPreset}
              onChange={(e) =>
                setPeriodPreset(e.target.value as "all" | "30d" | "custom")
              }
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400 print:border-slate-400 print:bg-white print:text-black"
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
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400 print:border-slate-400 print:bg-white print:text-black"
                />
                <span className="text-slate-500 print:text-slate-700">~</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400 print:border-slate-400 print:bg-white print:text-black"
                />
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 print:text-slate-700">
          평가 {filteredEvaluations.length}건 / 전체 {evaluations.length}건 · 개인 기록{" "}
          {records.length}건
        </p>
      </section>

      {aggregated && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
          <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
            전체 평가 요약
          </h2>
          <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
            코치 평가와 선수 자기평가를 종합한 전체 평균 점수와 과제 이해·달성·코치 평가 요약입니다.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-slate-400 print:text-slate-700">
                전체 가중 평균
              </p>
              <p className="text-2xl font-bold text-emerald-400 print:text-emerald-700">
                {aggregated._overall?.toFixed(1) ?? "-"}점
              </p>
              <div className="mt-2 space-y-2">
                <TaskScoreBar label="이해 (선수 사전)" score={taskTriple.understanding} />
                <TaskScoreBar label="달성 (선수 사후)" score={taskTriple.achievement} />
                {(() => {
                  const improvement = getImprovement(phaseAggregated, playerId);
                  return improvement != null ? (
                    <div className="flex items-center justify-between text-[11px] text-slate-300 print:text-slate-800">
                      <span>개선 (달성−이해)</span>
                      <span
                        className={
                          improvement >= 0
                            ? "font-semibold text-emerald-400 print:text-emerald-700"
                            : "font-semibold text-amber-400 print:text-amber-700"
                        }
                      >
                        {improvement >= 0 ? "+" : ""}
                        {improvement.toFixed(0)}점
                      </span>
                    </div>
                  ) : null;
                })()}
                <TaskScoreBar
                  label="평가 (코치 사후)"
                  score={
                    taskTriple.evaluation ||
                    Math.max(
                      0,
                      Math.min(
                        100,
                        aggregated._overall != null ? (aggregated._overall / 5) * 100 : 0,
                      ),
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-2 text-[11px] text-slate-300 print:text-slate-800">
              <p className="text-xs font-semibold text-slate-400 print:text-slate-700">
                코치별 평가 참여 현황
              </p>
              {Object.keys(staffMap).length === 0 ? (
                <p className="text-xs text-slate-500 print:text-slate-700">
                  코치 명단 정보가 없습니다.
                </p>
              ) : (
                <ul className="space-y-1">
                  {Object.values(staffMap).map((s) => {
                    const count = filteredEvaluations.filter(
                      (e) => e.evaluatorStaffId === s.id,
                    ).length;
                    return (
                      <li key={s.id} className="flex items-center justify-between">
                        <span>{s.name}</span>
                        <span className="text-slate-400 print:text-slate-700">
                          평가 {count}건
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {def.categories.length > 0 && aggregated && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
          <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
            카테고리별 레이더 & 평균
          </h2>
          <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
            코치 평가 기반으로, 선수의 강점/약점 카테고리를 1~5점 다각형과 표로 함께 보여줍니다.
          </p>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="md:w-1/2">
              <PlayerRadarChart
                categories={def.categories.filter((c) =>
                  !isMeasurementCategory(def, c.id),
                )}
                values={aggregated}
              />
            </div>
            <div className="md:w-1/2 space-y-1 text-[11px] text-slate-300 print:text-slate-800">
              {def.categories.map((cat) => {
                const val = aggregated[cat.id] ?? 0;
                const isMeas = isMeasurementCategory(def, cat.id);
                const pct = isMeas ? 0 : (val / 5) * 100;
                return (
                  <div key={cat.id}>
                    <div className="mb-0.5 flex justify-between">
                      <span style={{ color: cat.color }}>{cat.label}</span>
                      <span className="font-semibold text-slate-200 print:text-black">
                        {formatCategoryValue(def, cat.id, val)}
                      </span>
                    </div>
                    {!isMeas && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 print:bg-slate-300/70">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: cat.color }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
        <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
          강점 · 약점 요약
        </h2>
        <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
          평균 점수가 높은 상위 3개 카테고리(강점)와 낮은 하위 3개 카테고리(약점)를 정리했습니다.
        </p>
        {strengthsWeaknesses.strengths.length === 0 ? (
          <p className="text-sm text-slate-500 print:text-slate-700">
            아직 평가 데이터가 부족합니다.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 text-[11px]">
            <div>
              <p className="mb-2 text-xs font-semibold text-emerald-400/90 print:text-emerald-700">
                강점 (상위)
              </p>
              <ol className="list-inside list-decimal space-y-1 text-xs text-slate-200 print:text-black">
                {strengthsWeaknesses.strengths.map((x) => (
                  <li key={x.id}>
                    <span style={{ color: x.color }}>{x.label}</span>
                    <span className="ml-2 text-slate-400 print:text-slate-700">
                      {formatCategoryValue(def, x.id, x.value)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-amber-400/90 print:text-amber-700">
                약점 (하위)
              </p>
              <ol className="list-inside list-decimal space-y-1 text-xs text-slate-200 print:text-black">
                {strengthsWeaknesses.weaknesses.map((x) => (
                  <li key={x.id}>
                    <span style={{ color: x.color }}>{x.label}</span>
                    <span className="ml-2 text-slate-400 print:text-slate-700">
                      {formatCategoryValue(def, x.id, x.value)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
        <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
          개인 기록관 요약
        </h2>
        <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
          개인 전술 데이터에서 저장한 경기별 개인 기록을 기반으로 공격 포인트 및 승·무·패를
          요약했습니다.
        </p>
        <div className="grid gap-4 md:grid-cols-3 text-[11px] text-slate-300 print:text-slate-800">
          <div className="rounded-xl bg-slate-900/80 p-3 print:bg-slate-100">
            <p className="text-[11px] text-slate-400 print:text-slate-700">총 기록 수</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-400 print:text-emerald-700">
              {recordSummary.total}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 print:text-slate-700">
              저장된 경기/연습 개인 기록 개수
            </p>
          </div>
          <div className="rounded-xl bg-slate-900/80 p-3 print:bg-slate-100">
            <p className="text-[11px] text-slate-400 print:text-slate-700">공격 포인트</p>
            <p className="mt-1 text-xl font-semibold text-slate-100 print:text-black">
              골 {recordSummary.goals} / 도움 {recordSummary.assists}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800 print:bg-slate-300/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 print:bg-emerald-500"
                style={{
                  width:
                    recordSummary.total > 0
                      ? `${Math.min(
                          100,
                          ((recordSummary.goals + recordSummary.assists) /
                            recordSummary.total) *
                            25,
                        )}%`
                      : "0%",
                }}
              />
            </div>
          </div>
          <div className="rounded-xl bg-slate-900/80 p-3 print:bg-slate-100">
            <p className="text-[11px] text-slate-400 print:text-slate-700">결과 요약</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300 print:text-emerald-700">
              {recordSummary.wins}승 {recordSummary.draws}무 {recordSummary.losses}패
            </p>
            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800 print:bg-slate-300/70">
              {recordSummary.total > 0 && (
                <>
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${(recordSummary.wins / recordSummary.total) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-slate-400"
                    style={{
                      width: `${(recordSummary.draws / recordSummary.total) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{
                      width: `${(recordSummary.losses / recordSummary.total) * 100}%`,
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-3 text-[11px] text-slate-400 print:border-slate-300 print:bg-white print:text-slate-700">
        <p>
          * 더 자세한 과제별 내용은{" "}
          <span className="font-semibold text-slate-200 print:text-black">
            내 과제 / 자기평가 / 기록관
          </span>{" "}
          화면에서 확인할 수 있습니다.
        </p>
      </section>
    </div>
  );
}

export default function PlayerReportPage() {
  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 print:bg-white print:text-black">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 print:border-slate-300">
          <div>
            <h1 className="text-xl font-semibold text-slate-100 print:text-black">
              선수 개인 리포트
            </h1>
            <p className="text-xs text-slate-400 print:text-slate-700">
              인쇄용으로 정리된 개인 스탯·과제·개인 기록 요약입니다.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Link
              href="/player"
              className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              ← 선수 대시보드
            </Link>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              인쇄
            </button>
          </div>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-400 print:text-black">불러오는 중…</p>}>
          <PlayerReportContent />
        </Suspense>
      </div>
    </main>
  );
}

