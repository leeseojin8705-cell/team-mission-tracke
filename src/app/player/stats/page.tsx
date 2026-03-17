"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { StatCategory, StatDefinition, TeamStaff } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, formatCategoryValue, getWeightedOverall, isMeasurementCategory } from "@/lib/statDefinition";

const RADAR_SIZE = 280;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.85;

function PlayerRadarChart({ categories, values }: { categories: StatCategory[]; values: Record<string, number> }) {
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
        {[1, 2, 3, 4, 5].map((level) => {
          const r = (level / 5) * RADAR_R;
          const pts = categories
            .map((_, i) => {
              const angle = angleStep * i - Math.PI / 2;
              return `${RADAR_CX + r * Math.cos(angle)},${RADAR_CY + r * Math.sin(angle)}`;
            })
            .join(" ");
          return (
            <polygon key={level} points={pts} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
          );
        })}
        {axisEndPoints.map((end, i) => (
          <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={end.x} y2={end.y} stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
        ))}
        <polygon
          points={polygonPoints}
          fill="rgba(16,185,129,0.25)"
          stroke="rgba(16,185,129,0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {labelPoints.map((lp, i) => (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[11px] font-medium"
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

function StatsContent() {
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId") ?? "";

  const [evaluations, setEvaluations] = useState<{ evaluatorStaffId: string; scores: Record<string, number[]> }[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, TeamStaff>>({});
  const [def, setDef] = useState<StatDefinition>(DEFAULT_STAT_DEFINITION);
  const [loading, setLoading] = useState(!!playerId);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
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
      .then((r) => safeJson(r, [] as { teamId?: string; evaluatorStaffId: string; scores: Record<string, number[]> }[]))
      .then((list) => {
        if (cancelled) return;
        const evals = Array.isArray(list) ? list : [];
        setEvaluations(evals);
        const teamId = evals[0]?.teamId;
        if (teamId) {
          return Promise.all([
            fetch(`/api/teams/${teamId}`).then((r) => (r.ok ? r.json() : null)) as Promise<{ statDefinition?: StatDefinition | null } | null>,
            fetch(`/api/teams/${teamId}/staff`).then((r) => safeJson(r, [] as TeamStaff[])),
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
          staff.forEach((s) => { map[s.id] = s; });
          setStaffMap(map);
        }
      })
      .catch(() => {
        if (!cancelled) setEvaluations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playerId]);

  const aggregated = useMemo(() => {
    if (evaluations.length === 0) return null;
    const byCat: Record<string, { sum: number; count: number }> = {};
    def.categories.forEach((c) => {
      byCat[c.id] = { sum: 0, count: 0 };
    });
    evaluations.forEach((e) => {
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
  }, [evaluations, def]);

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

  if (!playerId) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <p className="text-slate-400">선수를 선택해 주세요.</p>
        <Link href="/player" className="mt-3 inline-block text-sm text-emerald-400 hover:underline">
          대시보드로 이동
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">불러오는 중…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">내 스탯</h2>
        <div className="flex gap-2">
          <Link
            href={playerId ? `/player/self-evaluate?playerId=${encodeURIComponent(playerId)}` : "/player"}
            className="rounded-lg border border-emerald-600/70 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-800/40"
          >
            자기평가
          </Link>
          <Link
            href="/player"
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← 대시보드
          </Link>
        </div>
      </div>
      <p className="text-xs text-slate-400">선수는 스탯 조회와 자기평가만 가능합니다. 코치 평가·측정 입력은 코치 화면에서만 가능합니다.</p>

      {evaluations.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-slate-400">아직 코치님들의 평가가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-2 text-xs text-slate-400">평가 반영: {evaluations.length}건</p>
            <p className="text-2xl font-bold text-emerald-400">
              전체 평균 {aggregated?._overall?.toFixed(1) ?? "-"}점
            </p>
            {aggregated?._overall != null && (
              <div className="mt-3">
                <TaskScoreBar
                  label="과제 평가 점수"
                  score={Math.max(0, Math.min(100, ((aggregated._overall as number) / 5) * 100))}
                />
              </div>
            )}
          </div>

          {(() => {
            const ratingCats = def.categories.filter((c) => !isMeasurementCategory(def, c.id));
            return ratingCats.length > 0 && aggregated ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-300">전체 통계 (다각형)</p>
                <p className="mb-4 text-xs text-slate-400">카테고리별 평균을 다각형으로 표시합니다. (기입 1~5점만, 측정 제외)</p>
                <PlayerRadarChart categories={ratingCats} values={aggregated} />
              </div>
            ) : null;
          })()}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-300">카테고리별 평균</p>
            <div className="space-y-3">
              {def.categories.map((cat) => {
                const val = aggregated?.[cat.id] ?? 0;
                const isMeasurement = isMeasurementCategory(def, cat.id);
                const pct = isMeasurement ? 0 : (val / 5) * 100;
                return (
                  <div key={cat.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span style={{ color: cat.color }}>{cat.label}</span>
                      <span className="font-semibold text-slate-200">{formatCategoryValue(def, cat.id, val)}</span>
                    </div>
                    {!isMeasurement && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
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

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-300">강점 · 약점</p>
            <p className="mb-4 text-xs text-slate-400">평균이 높은 순 상위 3개(강점), 낮은 순 하위 3개(약점)입니다.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-emerald-400/90">강점 (상위)</p>
                {strengthsWeaknesses.strengths.length === 0 ? (
                  <p className="text-xs text-slate-500">—</p>
                ) : (
                  <ol className="list-inside list-decimal space-y-1 text-sm text-slate-200">
                    {strengthsWeaknesses.strengths.map((x) => (
                      <li key={x.id}>
                        <span style={{ color: x.color }}>{x.label}</span>
                        <span className="ml-2 text-slate-400">{formatCategoryValue(def, x.id, x.value)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-amber-400/90">약점 (하위)</p>
                {strengthsWeaknesses.weaknesses.length === 0 ? (
                  <p className="text-xs text-slate-500">—</p>
                ) : (
                  <ol className="list-inside list-decimal space-y-1 text-sm text-slate-200">
                    {strengthsWeaknesses.weaknesses.map((x) => (
                      <li key={x.id}>
                        <span style={{ color: x.color }}>{x.label}</span>
                        <span className="ml-2 text-slate-400">{formatCategoryValue(def, x.id, x.value)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PlayerStatsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50">
      <div className="mx-auto max-w-2xl">
        <Suspense fallback={<p className="text-slate-500">불러오는 중…</p>}>
          <StatsContent />
        </Suspense>
      </div>
    </main>
  );
}
