"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, StatDefinition, Team } from "@/lib/types";
import type { StatCategory } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, formatCategoryValue, isMeasurementCategory } from "@/lib/statDefinition";

type PlayerEvalRow = { evaluatorStaffId: string; subjectPlayerId: string; scores: Record<string, number[]> };

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

export default function CoachTeamStatsPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params?.teamId as string | undefined;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [evaluations, setEvaluations] = useState<PlayerEvalRow[]>([]);
  const [loading, setLoading] = useState(!!teamId);

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

  const aggregated = useMemo(() => {
    const bySubject: Record<string, { sumByCat: Record<string, number>; countByCat: Record<string, number> }> = {};
    for (const e of evaluations) {
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
  }, [evaluations, def.categories]);

  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    players.forEach((p) => { m[p.id] = p; });
    return m;
  }, [players]);

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
        <h2 className="text-lg font-semibold text-slate-100">팀 스탯</h2>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
        >
          팀 관리로 돌아가기
        </button>
      </div>
      {loading ? (
        <p className="text-slate-500">불러오는 중…</p>
      ) : !team ? (
        <p className="text-slate-400">팀을 찾을 수 없습니다.</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-2 font-medium text-slate-200">{team.name}</p>
            <p className="text-sm text-slate-400">시즌: {team.season}</p>
            <p className="mt-2 text-xs text-slate-500">선수 평가 {evaluations.length}건 · 집계 대상 {aggregated.length}명</p>
          </div>

          {def.categories.length > 0 && (() => {
            const ratingCategories = def.categories.filter((c) => !isMeasurementCategory(def, c.id));
            return ratingCategories.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="mb-3 text-base font-semibold text-slate-100">전체 통계 (레이더 차트)</h3>
                <p className="mb-4 text-xs text-slate-400">팀 전체 카테고리별 평균을 다각형으로 표시합니다. (기입 1~5점만, 측정 제외)</p>
                <TeamRadarChart categories={ratingCategories} values={teamAvgByCategory} />
              </div>
            ) : null;
          })()}

          {/* 선수별 과제 평가 점수 (막대) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-100">선수별 과제 평가 점수</h3>
            <p className="mb-4 text-xs text-slate-400">
              코치가 기록한 전체 평가 점수를 0~100점으로 환산한 과제 평가 점수입니다. (1~5점 평균 → 0~100점)
            </p>
            {aggregated.length === 0 ? (
              <p className="text-sm text-slate-500">평가 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {aggregated.map((row) => {
                  const player = playerById[row.subjectPlayerId];
                  const score = row.overall ? Math.max(0, Math.min(100, (row.overall / 5) * 100)) : 0;
                  return (
                    <div
                      key={row.subjectPlayerId}
                      className="flex flex-col gap-1 rounded-xl border border-slate-700/70 bg-slate-800/50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-100">
                          {player?.name ?? row.subjectPlayerId}
                          {player?.position && (
                            <span className="ml-2 text-[11px] text-slate-400">{player.position}</span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          평균 점수 {row.overall.toFixed(1)} / 5.0
                        </span>
                      </div>
                      <TaskScoreBar label="과제 평가 점수" score={score} />
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
