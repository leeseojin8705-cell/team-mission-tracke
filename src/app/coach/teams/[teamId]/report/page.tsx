"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, StatCategory, StatDefinition, Team } from "@/lib/types";
import { aggregatePhaseScores, getImprovement, getTaskScores } from "@/lib/taskScore";
import {
  DEFAULT_STAT_DEFINITION,
  formatCategoryValue,
  isMeasurementCategory,
} from "@/lib/statDefinition";

type PlayerEvalRow = {
  evaluatorStaffId: string;
  subjectPlayerId: string;
  phase?: string | null;
  scores: Record<string, number[]>;
  createdAt?: string | null;
};

const RADAR_SIZE = 260;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.85;

function TeamRadarChart({
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

export default function CoachTeamReportPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params?.teamId as string | undefined;

  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [evaluations, setEvaluations] = useState<PlayerEvalRow[]>([]);
  const [loading, setLoading] = useState(!!teamId);
  const [error, setError] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!teamId) return;
    const tid = teamId;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const safeJson = async (r: Response, fallback: unknown) => {
        const text = await r.text();
        if (!text.trim()) return fallback;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return fallback;
        }
      };
      try {
        const [teamRes, playersList, evalsList] = await Promise.all([
          fetch(`/api/teams/${tid}`).then((r) => (r.ok ? r.json() : null)) as Promise<Team | null>,
          fetch(`/api/players?teamId=${encodeURIComponent(tid)}`).then((r) =>
            safeJson(r, []),
          ) as Promise<Player[]>,
          fetch(`/api/teams/${tid}/player-evaluations`).then((r) =>
            safeJson(r, []),
          ) as Promise<PlayerEvalRow[]>,
        ]);
        if (cancelled) return;
        setTeam(teamRes ?? null);
        setPlayers(Array.isArray(playersList) ? playersList : []);
        setEvaluations(Array.isArray(evalsList) ? evalsList : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const def: StatDefinition = team?.statDefinition ?? DEFAULT_STAT_DEFINITION;

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
    const bySubject: Record<
      string,
      { sumByCat: Record<string, number>; countByCat: Record<string, number> }
    > = {};
    for (const e of filteredEvaluations) {
      if (!bySubject[e.subjectPlayerId]) {
        bySubject[e.subjectPlayerId] = { sumByCat: {}, countByCat: {} };
      }
      const sub = bySubject[e.subjectPlayerId];
      for (const [catId, arr] of Object.entries(e.scores)) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        sub.sumByCat[catId] = (sub.sumByCat[catId] ?? 0) + avg;
        sub.countByCat[catId] = (sub.countByCat[catId] ?? 0) + 1;
      }
    }
    const result: { subjectPlayerId: string; byCat: Record<string, number>; overall: number }[] =
      [];
    for (const [subjectPlayerId, data] of Object.entries(bySubject)) {
      const byCat: Record<string, number> = {};
      def.categories.forEach((c) => {
        const avg = data.countByCat[c.id]
          ? data.sumByCat[c.id]! / data.countByCat[c.id]!
          : 0;
        byCat[c.id] = Math.round(avg * 10) / 10;
      });
      const values = Object.values(byCat);
      const mean = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
      result.push({ subjectPlayerId, byCat, overall: mean });
    }
    return result;
  }, [filteredEvaluations, def.categories]);

  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    players.forEach((p) => {
      m[p.id] = p;
    });
    return m;
  }, [players]);

  const phaseAggregated = useMemo(
    () =>
      aggregatePhaseScores(
        filteredEvaluations.map((e) => ({
          subjectPlayerId: e.subjectPlayerId,
          phase: e.phase,
          scores: e.scores,
        })),
        def.categories.map((c) => c.id),
      ),
    [filteredEvaluations, def.categories],
  );

  const teamAvgByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    if (aggregated.length === 0) {
      def.categories.forEach((c) => {
        byCat[c.id] = 0;
      });
      return byCat;
    }
    def.categories.forEach((c) => {
      const sum = aggregated.reduce((acc, r) => acc + (r.byCat[c.id] ?? 0), 0);
      byCat[c.id] = Math.round((sum / aggregated.length) * 10) / 10;
    });
    return byCat;
  }, [def.categories, aggregated]);

  const topBottomByCategory = useMemo(() => {
    const out: {
      catId: string;
      label: string;
      color: string;
      top: { id: string; name: string; avg: number }[];
      bottom: { id: string; name: string; avg: number }[];
    }[] = [];
    for (const c of def.categories) {
      const withAvg = aggregated
        .map((r) => ({
          id: r.subjectPlayerId,
          name: playerById[r.subjectPlayerId]?.name ?? r.subjectPlayerId,
          avg: r.byCat[c.id] ?? 0,
        }))
        .filter((x) => x.avg > 0);
      withAvg.sort((a, b) => b.avg - a.avg);
      const top = withAvg.slice(0, 5);
      const bottom = [...withAvg].reverse().slice(0, 5);
      out.push({ catId: c.id, label: c.label, color: c.color, top, bottom });
    }
    return out;
  }, [def.categories, aggregated, playerById]);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  if (!teamId) {
    return (
      <div className="p-4">
        <p className="text-slate-400">팀 정보가 없습니다.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-2 rounded border border-slate-600 px-2 py-1 text-sm text-slate-300"
        >
          뒤로
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6 print:bg-white print:text-black">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 print:border-b print:border-slate-300">
          <div>
            <h1 className="text-xl font-semibold text-slate-100 print:text-black">
              팀 리포트
            </h1>
            <p className="text-xs text-slate-400 print:text-slate-700">
              팀 스탯과 선수별 평가 결과를 한 페이지로 인쇄할 수 있는 화면입니다.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              ← 팀 화면
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              인쇄
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 print:text-black">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-rose-300 print:text-red-600">{error}</p>
        ) : !team ? (
          <p className="text-sm text-slate-400 print:text-black">팀을 찾을 수 없습니다.</p>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm print:border-slate-300 print:bg-white print:text-black">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400 print:text-slate-700">
                    팀 / 시즌
                  </p>
                  <p className="text-lg font-semibold text-slate-100 print:text-black">
                    {team.name}
                  </p>
                  <p className="text-xs text-slate-400 print:text-slate-700">
                    시즌: {team.season}
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
                평가 {filteredEvaluations.length}건 / 전체 {evaluations.length}건 · 집계
                대상 {aggregated.length}명
              </p>
            </section>

            {def.categories.length > 0 && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
                <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
                  팀 레이더 (카테고리 평균)
                </h2>
                <p className="mb-4 text-[11px] text-slate-400 print:text-slate-700">
                  코치·선수 평가를 1~5점으로 환산한 팀 평균을 다각형으로 표시합니다.
                  (측정형 카테고리는 제외)
                </p>
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="md:w-1/2">
                    <TeamRadarChart
                      categories={def.categories.filter((c) =>
                        !isMeasurementCategory(def, c.id),
                      )}
                      values={teamAvgByCategory}
                    />
                  </div>
                  <div className="md:w-1/2 space-y-1 text-[11px] text-slate-300 print:text-slate-800">
                    {def.categories
                      .filter((c) => !isMeasurementCategory(def, c.id))
                      .map((c) => {
                        const v = teamAvgByCategory[c.id] ?? 0;
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span style={{ color: c.color }}>{c.label}</span>
                            <span className="text-slate-100 print:text-black">
                              {v.toFixed(1)} / 5.0
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
              <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
                선수별 평가 요약
              </h2>
              <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
                이해(사전)·달성(사후)·코치 평가(사후)를 0~100점으로 환산한 값과 개선도(달성−이해)
                를 함께 표시합니다.
              </p>
              {aggregated.length === 0 ? (
                <p className="text-sm text-slate-500 print:text-slate-700">
                  평가 데이터가 없습니다.
                </p>
              ) : (
                <div className="space-y-2 text-[11px]">
                  {aggregated.map((row) => {
                    const player = playerById[row.subjectPlayerId];
                    const triple = getTaskScores(phaseAggregated, row.subjectPlayerId);
                    const improvement = getImprovement(phaseAggregated, row.subjectPlayerId);
                    const fallbackScore = row.overall
                      ? Math.max(0, Math.min(100, (row.overall / 5) * 100))
                      : triple.evaluation;
                    return (
                      <div
                        key={row.subjectPlayerId}
                        className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 print:border-slate-300 print:bg-transparent"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-100 print:text-black">
                            {player?.name ?? row.subjectPlayerId}
                            {player?.position && (
                              <span className="ml-1 text-[10px] text-slate-400 print:text-slate-700">
                                {player.position}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400 print:text-slate-700">
                            평균 {row.overall.toFixed(1)} / 5.0
                          </span>
                        </div>
                        <div className="mt-1 grid grid-cols-4 gap-1 text-[10px]">
                          <div>
                            <p className="text-slate-400 print:text-slate-700">이해</p>
                            <p className="font-semibold text-emerald-300 print:text-emerald-700">
                              {triple.understanding.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 print:text-slate-700">달성</p>
                            <p className="font-semibold text-emerald-300 print:text-emerald-700">
                              {triple.achievement.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 print:text-slate-700">코치</p>
                            <p className="font-semibold text-sky-300 print:text-sky-700">
                              {(triple.evaluation || fallbackScore).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 print:text-slate-700">개선</p>
                            <p
                              className={
                                improvement != null && improvement < 0
                                  ? "font-semibold text-amber-300 print:text-amber-700"
                                  : "font-semibold text-emerald-300 print:text-emerald-700"
                              }
                            >
                              {improvement != null
                                ? `${improvement >= 0 ? "+" : ""}${improvement.toFixed(
                                    0,
                                  )}점`
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 print:border-slate-300 print:bg-white">
              <h2 className="mb-2 text-sm font-semibold text-slate-100 print:text-black">
                장단점 요약 (항목별 상·하위 5위)
              </h2>
              <p className="mb-3 text-[11px] text-slate-400 print:text-slate-700">
                카테고리별로 평균 점수가 높은 선수 5명과 낮은 선수 5명을 한눈에 볼 수 있습니다.
              </p>
              {topBottomByCategory.length === 0 ? (
                <p className="text-sm text-slate-500 print:text-slate-700">
                  평가 데이터가 없습니다.
                </p>
              ) : (
                <div className="space-y-4 text-[11px]">
                  {topBottomByCategory.map(({ catId, label, color, top, bottom }) => (
                    <div
                      key={catId}
                      className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3 print:border-slate-300 print:bg-transparent"
                    >
                      <p className="mb-2 text-sm font-medium" style={{ color }}>
                        {label}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold text-emerald-400/90 print:text-emerald-700">
                            상위 5위
                          </p>
                          {top.length === 0 ? (
                            <p className="text-[11px] text-slate-500 print:text-slate-700">
                              —
                            </p>
                          ) : (
                            <ol className="list-inside list-decimal space-y-0.5 text-xs text-slate-200 print:text-black">
                              {top.map((x) => (
                                <li key={x.id}>
                                  <span className="font-medium">{x.name}</span>
                                  <span className="ml-1 text-slate-400 print:text-slate-700">
                                    {formatCategoryValue(def, catId, x.avg)}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold text-amber-400/90 print:text-amber-700">
                            하위 5위
                          </p>
                          {bottom.length === 0 ? (
                            <p className="text-[11px] text-slate-500 print:text-slate-700">
                              —
                            </p>
                          ) : (
                            <ol className="list-inside list-decimal space-y-0.5 text-xs text-slate-200 print:text-black">
                              {bottom.map((x) => (
                                <li key={x.id}>
                                  <span className="font-medium">{x.name}</span>
                                  <span className="ml-1 text-slate-400 print:text-slate-700">
                                    {formatCategoryValue(def, catId, x.avg)}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

