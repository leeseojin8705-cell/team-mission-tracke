"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, StatDefinition, Team } from "@/lib/types";
import type { StatCategory } from "@/lib/types";
import { aggregatePhaseScores, getImprovement, getTaskScores } from "@/lib/taskScore";
import { DEFAULT_STAT_DEFINITION, formatCategoryValue, isMeasurementCategory } from "@/lib/statDefinition";

type PlayerEvalRow = {
  evaluatorStaffId: string;
  subjectPlayerId: string;
  phase?: string | null;
  scores: Record<string, number[]>;
  createdAt?: string | null;
};

const RADAR_SIZE = 280;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.85;

function TeamRadarChart({ categories, values }: { categories: StatCategory[]; values: Record<string, number> }) {
  const n = categories.length;
  if (n === 0) return null;
  const angleStep = (2 * Math.PI) / n;
  const getPoint = (value: number, index: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, Math.min(5, value)) / 5) * RADAR_R;
    return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle) };
  };
  const polygonPoints = categories
    .map((c, i) => getPoint(values[c.id] ?? 0, i))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const axisEndPoints = categories.map((_, i) => getPoint(5, i));
  const labelPoints = categories.map((_, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const r = RADAR_R + 18;
    return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle), label: categories[i].label, color: categories[i].color };
  });

  return (
    <div className="flex justify-center">
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
        {/* 배경 격자 (1~5 등급) */}
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
              stroke="rgba(148,163,184,0.2)"
              strokeWidth="1"
            />
          );
        })}
        {/* 축 */}
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
        {/* 데이터 다각형 */}
        <polygon
          points={polygonPoints}
          fill="rgba(16,185,129,0.25)"
          stroke="rgba(16,185,129,0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* 카테고리 라벨 */}
        {labelPoints.map((lp, i) => (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[11px] font-medium fill-slate-300"
            style={{ fill: lp.color }}
          >
            {lp.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function TaskScoreBar({ label, score }: { label: string; score: number }) {
  const safe = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-300">
        <span>{label}</span>
        <span className="font-semibold text-emerald-400">{safe.toFixed(0)}점</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

type Snapshot = {
  id: string;
  name: string;
  periodPreset: "all" | "30d" | "custom";
  dateFrom: string;
  dateTo: string;
  createdAt: string;
};

export default function CoachTeamStatsPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params?.teamId as string | undefined;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [evaluations, setEvaluations] = useState<PlayerEvalRow[]>([]);
  const [loading, setLoading] = useState(!!teamId);
  const [periodPreset, setPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // 스냅샷 불러오기
  useEffect(() => {
    if (!teamId) return;
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(`tmt:team-stats-snapshots:${teamId}`)
          : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Snapshot[];
      if (Array.isArray(parsed)) setSnapshots(parsed);
    } catch {
      // ignore
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setLoading(true);
    const safeJson = async (r: Response, fallback: unknown) => {
      const text = await r.text();
      if (!text.trim()) return fallback;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return fallback;
      }
    };
    Promise.all([
      fetch(`/api/teams/${teamId}`).then((r) => (r.ok ? r.json() : null)) as Promise<Team | null>,
      fetch(`/api/players?teamId=${encodeURIComponent(teamId)}`).then((r) => safeJson(r, []) as Promise<Player[]>),
      fetch(`/api/teams/${teamId}/player-evaluations`).then((r) => safeJson(r, []) as Promise<PlayerEvalRow[]>),
    ])
      .then(([teamRes, playersList, evalsList]) => {
        if (cancelled) return;
        setTeam(teamRes ?? null);
        setPlayers(Array.isArray(playersList) ? playersList : []);
        setEvaluations(Array.isArray(evalsList) ? evalsList : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
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
        from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) {
          from.setHours(0, 0, 0, 0);
        } else {
          from = null;
        }
      }
      if (dateTo) {
        to = new Date(dateTo);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
        } else {
          to = null;
        }
      }
    }

    return evaluations.filter((e) => {
      if (!e.createdAt) return true; // createdAt 이 없으면 일단 포함
      const d = new Date(e.createdAt);
      if (Number.isNaN(d.getTime())) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [evaluations, periodPreset, dateFrom, dateTo]);

  // 비교용 기간 집계 (선택 시)
  const compareEvaluations = useMemo(() => {
    if (!showCompare || !compareFrom || !compareTo) return [];
    const from = new Date(compareFrom);
    const to = new Date(compareTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return evaluations.filter((e) => {
      if (!e.createdAt) return false;
      const d = new Date(e.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      return d >= from && d <= to;
    });
  }, [evaluations, showCompare, compareFrom, compareTo]);

  const aggregated = useMemo(() => {
    const bySubject: Record<string, { sumByCat: Record<string, number>; countByCat: Record<string, number> }> = {};
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
    const result: { subjectPlayerId: string; byCat: Record<string, number>; overall: number }[] = [];
    for (const [subjectPlayerId, data] of Object.entries(bySubject)) {
      const byCat: Record<string, number> = {};
      def.categories.forEach((c) => {
        const avg = data.countByCat[c.id] ? data.sumByCat[c.id]! / data.countByCat[c.id]! : 0;
        byCat[c.id] = Math.round(avg * 10) / 10;
      });
      const values = Object.values(byCat);
      const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      result.push({ subjectPlayerId, byCat, overall: mean });
    }
    return result;
  }, [filteredEvaluations, def.categories]);

  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    players.forEach((p) => { m[p.id] = p; });
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

  const topBottomByCategory = useMemo(() => {
    const out: { catId: string; label: string; color: string; top: { id: string; name: string; avg: number }[]; bottom: { id: string; name: string; avg: number }[] }[] = [];
    for (const c of def.categories) {
      const withAvg = aggregated
        .map((r) => ({ id: r.subjectPlayerId, name: playerById[r.subjectPlayerId]?.name ?? r.subjectPlayerId, avg: r.byCat[c.id] ?? 0 }))
        .filter((x) => x.avg > 0);
      withAvg.sort((a, b) => b.avg - a.avg);
      const top = withAvg.slice(0, 5);
      const bottom = [...withAvg].reverse().slice(0, 5);
      out.push({ catId: c.id, label: c.label, color: c.color, top, bottom });
    }
    return out;
  }, [def.categories, aggregated, playerById]);

  const teamAvgByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    if (aggregated.length === 0) {
      def.categories.forEach((c) => { byCat[c.id] = 0; });
      return byCat;
    }
    def.categories.forEach((c) => {
      const sum = aggregated.reduce((acc, r) => acc + (r.byCat[c.id] ?? 0), 0);
      byCat[c.id] = Math.round((sum / aggregated.length) * 10) / 10;
    });
    return byCat;
  }, [def.categories, aggregated]);

  const compareTeamAvgByCategory = useMemo(() => {
    if (compareEvaluations.length === 0) return null;
    const bySubject: Record<string, { sumByCat: Record<string, number>; countByCat: Record<string, number> }> = {};
    for (const e of compareEvaluations) {
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
    const byCat: Record<string, number> = {};
    def.categories.forEach((c) => {
      let sum = 0;
      let cnt = 0;
      for (const data of Object.values(bySubject)) {
        if (data.countByCat[c.id]) {
          sum += data.sumByCat[c.id]!;
          cnt += data.countByCat[c.id]!;
        }
      }
      byCat[c.id] = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0;
    });
    return byCat;
  }, [compareEvaluations, def.categories]);

  const handleSaveSnapshot = () => {
    if (!teamId) return;
    const id = `${Date.now()}`;
    const now = new Date();
    const nameParts: string[] = [];
    if (periodPreset === "all") nameParts.push("전체");
    else if (periodPreset === "30d") nameParts.push("최근 30일");
    else nameParts.push("사용자 지정");
    if (dateFrom) nameParts.push(dateFrom);
    if (dateTo) nameParts.push(`~ ${dateTo}`);
    const name = nameParts.join(" ") || "스냅샷";
    const snap: Snapshot = {
      id,
      name,
      periodPreset,
      dateFrom,
      dateTo,
      createdAt: now.toISOString(),
    };
    setSnapshots((prev) => {
      const next = [snap, ...prev].slice(0, 8);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            `tmt:team-stats-snapshots:${teamId}`,
            JSON.stringify(next),
          );
        }
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleApplySnapshot = (snap: Snapshot) => {
    setPeriodPreset(snap.periodPreset);
    setDateFrom(snap.dateFrom);
    setDateTo(snap.dateTo);
  };

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
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">팀 스탯 (선수)</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/coach/teams/${encodeURIComponent(teamId)}/report`)}
            className="rounded border border-emerald-500 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
          >
            리포트 (인쇄용)
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            팀 관리로 돌아가기
          </button>
        </div>
      </div>
      {loading ? (
        <p className="text-slate-500">불러오는 중…</p>
      ) : !team ? (
        <p className="text-slate-400">팀을 찾을 수 없습니다.</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1 font-medium text-slate-200">{team.name}</p>
                <p className="text-sm text-slate-400">시즌: {team.season}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">기준 기간</span>
                  <select
                    value={periodPreset}
                    onChange={(e) => setPeriodPreset(e.target.value as "all" | "30d" | "custom")}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
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
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      />
                      <span className="text-slate-500">~</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </>
                  )}
                </div>
                <div className="h-5 w-px bg-slate-700/60" />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-slate-400">
                    <input
                      type="checkbox"
                      checked={showCompare}
                      onChange={(e) => setShowCompare(e.target.checked)}
                      className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                    />
                    비교 기간
                  </label>
                  {showCompare && (
                    <>
                      <input
                        type="date"
                        value={compareFrom}
                        onChange={(e) => setCompareFrom(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      />
                      <span className="text-slate-500">~</span>
                      <input
                        type="date"
                        value={compareTo}
                        onChange={(e) => setCompareTo(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  className="rounded-full border border-slate-600 px-2.5 py-1 text-[11px] text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                >
                  현재 설정 스냅샷 저장
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              평가 {filteredEvaluations.length}건 / 전체 {evaluations.length}건 · 집계 대상{" "}
              {aggregated.length}명
            </p>
          </div>

          {snapshots.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-300">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-200">저장된 스냅샷</span>
                <span className="text-slate-500">최대 8개까지 저장됩니다.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleApplySnapshot(s)}
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-left hover:border-emerald-500 hover:text-emerald-300"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-1 text-slate-500">
                      ({s.createdAt.slice(0, 10)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {def.categories.length > 0 && (() => {
            const ratingCategories = def.categories.filter((c) => !isMeasurementCategory(def, c.id));
            return ratingCategories.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="mb-1 text-base font-semibold text-slate-100">전체 통계 (레이더 차트)</h3>
                    <p className="text-xs text-slate-400">
                      팀 전체 카테고리별 평균을 다각형으로 표시합니다. (기입 1~5점만, 측정 제외)
                    </p>
                  </div>
                  {showCompare && compareTeamAvgByCategory && (
                    <p className="text-[11px] text-slate-400">
                      초록: 기준 기간 / 회색 점선: 비교 기간
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="flex-1">
                    <TeamRadarChart categories={ratingCategories} values={teamAvgByCategory} />
                  </div>
                  {showCompare && compareTeamAvgByCategory && (
                    <div className="flex-1 space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs">
                      <p className="mb-1 text-[11px] font-semibold text-slate-300">
                        카테고리별 평균 비교 (기준 − 비교)
                      </p>
                      <div className="space-y-1.5">
                        {ratingCategories.map((c) => {
                          const baseVal = teamAvgByCategory[c.id] ?? 0;
                          const cmpVal = compareTeamAvgByCategory[c.id] ?? 0;
                          const diff = baseVal - cmpVal;
                          const pct = Math.min(100, Math.abs(diff) * 20);
                          return (
                            <div key={c.id}>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px]" style={{ color: c.color }}>
                                  {c.label}
                                </span>
                                <span className="text-[11px] text-slate-200">
                                  {baseVal.toFixed(1)} / {cmpVal.toFixed(1)} (
                                  <span
                                    className={
                                      diff > 0
                                        ? "text-emerald-400"
                                        : diff < 0
                                          ? "text-rose-400"
                                          : "text-slate-300"
                                    }
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff.toFixed(1)}
                                  </span>
                                  )
                                </span>
                              </div>
                              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${
                                    diff >= 0 ? "bg-emerald-500" : "bg-rose-500"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}

          {/* 선수별 과제 평가 점수 (이해/달성/평가 막대) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-100">선수별 과제 평가 점수</h3>
            <p className="mb-4 text-xs text-slate-400">
              이해(선수 사전)·달성(선수 사후)·평가(코치 사후)를 0~100점으로 환산합니다. 해당 단계 데이터가 없으면 0점으로 표시됩니다.
            </p>
            {aggregated.length === 0 ? (
              <p className="text-sm text-slate-500">평가 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {aggregated.map((row) => {
                  const player = playerById[row.subjectPlayerId];
                  const triple = getTaskScores(phaseAggregated, row.subjectPlayerId);
                  const improvement = getImprovement(phaseAggregated, row.subjectPlayerId);
                  const score = row.overall ? Math.max(0, Math.min(100, (row.overall / 5) * 100)) : triple.evaluation;
                  return (
                    <div
                      key={row.subjectPlayerId}
                      className="flex flex-col gap-2 rounded-xl border border-slate-700/70 bg-slate-800/50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-100">
                          {player?.name ?? row.subjectPlayerId}
                          {player?.position && (
                            <span className="ml-2 text-[11px] text-slate-400">{player.position}</span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          평균 {row.overall.toFixed(1)} / 5.0
                        </span>
                      </div>
                      <TaskScoreBar label="이해 (선수 사전)" score={triple.understanding} />
                      <TaskScoreBar label="달성 (선수 사후)" score={triple.achievement} />
                      {improvement != null && (
                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span>개선 (달성−이해)</span>
                          <span
                            className={
                              improvement >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"
                            }
                          >
                            {improvement >= 0 ? "+" : ""}
                            {improvement.toFixed(0)}점
                          </span>
                        </div>
                      )}
                      <TaskScoreBar label="평가 (코치 사후)" score={triple.evaluation || score} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-100">장단점 (항목별 상·하위 5위)</h3>
            <p className="mb-4 text-xs text-slate-400">카테고리별로 평균이 높은 순·낮은 순 5명입니다.</p>
            {topBottomByCategory.length === 0 ? (
              <p className="text-sm text-slate-500">평가 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-6">
                {topBottomByCategory.map(({ catId, label, color, top, bottom }) => (
                  <div key={catId} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                    <p className="mb-3 text-sm font-medium" style={{ color }}>{label}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-emerald-400/90">상위 5위</p>
                        {top.length === 0 ? (
                          <p className="text-xs text-slate-500">—</p>
                        ) : (
                          <ol className="list-inside list-decimal text-sm text-slate-200">
                            {top.map((x) => (
                              <li key={x.id}>
                                <span className="font-medium">{x.name}</span>
                                <span className="ml-2 text-slate-400">{formatCategoryValue(def, catId, x.avg)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-amber-400/90">하위 5위</p>
                        {bottom.length === 0 ? (
                          <p className="text-xs text-slate-500">—</p>
                        ) : (
                          <ol className="list-inside list-decimal text-sm text-slate-200">
                            {bottom.map((x) => (
                              <li key={x.id}>
                                <span className="font-medium">{x.name}</span>
                                <span className="ml-2 text-slate-400">{formatCategoryValue(def, catId, x.avg)}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}
