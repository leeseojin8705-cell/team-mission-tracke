"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Player, StatDefinition } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, isMeasurementCategory } from "@/lib/statDefinition";

const SELF_EVALUATOR_ID = "self";

type EvalPhaseSelf = "PLAYER_PRE" | "PLAYER_POST";

function SelfEvaluateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId") ?? "";
  const taskId = searchParams.get("taskId") ?? undefined;

  const [player, setPlayer] = useState<Player | null>(null);
  const [def, setDef] = useState<StatDefinition>(DEFAULT_STAT_DEFINITION);
  const [phase, setPhase] = useState<EvalPhaseSelf>("PLAYER_POST");
  const [scores, setScores] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(!!playerId);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  const setScore = useCallback((catId: string, itemIndex: number, value: number) => {
    setScores((prev) => {
      const arr = [...(prev[catId] ?? [])];
      arr[itemIndex] = value;
      return { ...prev, [catId]: arr };
    });
  }, []);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/players").then((r) => r.json()) as Promise<Player[]>,
    ])
      .then(([playersList]) => {
        if (cancelled) return;
        const p = (playersList as Player[]).find((x) => x.id === playerId);
        setPlayer(p ?? null);
        if (!p?.teamId) {
          setAffiliationName(null);
          return;
        }
        return fetch(`/api/teams/${p.teamId}`).then((r) => (r.ok ? r.json() : null));
      })
      .then((teamRes: { statDefinition?: StatDefinition | null; name?: string } | null | undefined) => {
        if (!cancelled && teamRes?.statDefinition) setDef(teamRes.statDefinition);
        if (!cancelled) setAffiliationName(teamRes?.name ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    if (!player?.teamId || !playerId) return;
    let cancelled = false;
    fetch(`/api/teams/${player.teamId}/player-evaluations`)
      .then((r) => r.json())
      .then(
        (
          list: {
            evaluatorStaffId: string;
            subjectPlayerId: string;
            phase?: string | null;
            scores: Record<string, number[]>;
          }[],
        ) => {
          if (!cancelled) {
            const selfEval = list.find((e: any) => {
              const isSelf =
                e.evaluatorStaffId === SELF_EVALUATOR_ID &&
                e.subjectPlayerId === playerId &&
                (e.phase === "PLAYER_PRE" || e.phase === "PLAYER_POST") &&
                e.phase === phase;
              if (!isSelf) return false;
              // taskId 가 있으면 같은 taskId 것만, 없으면 taskId 없는 평가만 사용
              if (taskId) return e.taskId === taskId;
              return !e.taskId;
            });
            if (selfEval?.scores) setScores(selfEval.scores);
            else setScores({});
          }
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [player?.teamId, playerId, phase]);

  async function handleSave() {
    if (!player?.teamId || !playerId) return;
    setSubmitting(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/teams/${player.teamId}/player-evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluatorStaffId: SELF_EVALUATOR_ID,
          subjectPlayerId: playerId,
          phase,
          scores,
          taskId,
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setSaved(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">선수를 선택해 주세요.</p>
          <Link href="/player" className="mt-4 inline-block rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            대시보드로 이동
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">자기평가</h1>
            {affiliationName && (
              <p className="mt-1 text-xs font-medium text-emerald-200/90">
                소속: {affiliationName}
              </p>
            )}
          </div>
          <Link
            href={`/player/stats?playerId=${encodeURIComponent(playerId)}`}
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← 내 스탯
          </Link>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          본인 스탯 항목에 대해 1~5점 또는 측정값을 입력하세요. 코치 평가와 함께 반영됩니다.
        </p>

        <div className="mb-4 flex gap-2 rounded-lg border border-slate-700/80 bg-slate-800/40 p-2">
          <button
            type="button"
            onClick={() => setPhase("PLAYER_PRE")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              phase === "PLAYER_PRE"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            }`}
          >
            사전 (과제 전 이해도)
          </button>
          <button
            type="button"
            onClick={() => setPhase("PLAYER_POST")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              phase === "PLAYER_POST"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            }`}
          >
            사후 (과제 후 달성도)
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-slate-700/70 bg-slate-900/50 p-3 text-[11px] text-slate-300 space-y-1">
          <p className="font-semibold text-slate-200">리커트 5점 척도 안내</p>
          <p>1점: 전혀 아니다 / 매우 낮다</p>
          <p>2점: 그렇지 않은 편이다</p>
          <p>3점: 보통이다</p>
          <p>4점: 그런 편이다</p>
          <p>5점: 매우 그렇다 / 매우 높다</p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : !player ? (
          <p className="text-slate-400">선수 정보를 찾을 수 없습니다.</p>
        ) : (
          <>
            <div className="mb-4 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200">
              {player.name}
              {player.position && ` · ${player.position}`}
            </div>

            <div className="space-y-4">
              {def.categories.map((cat) => {
                const items = def.items[cat.id] ?? [];
                if (items.length === 0) return null;
                const isMeasurement = isMeasurementCategory(def, cat.id);
                const unit = (def.categoryUnit?.[cat.id] ?? "").trim();
                return (
                  <div key={cat.id} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                    <p className="mb-2 text-xs font-semibold" style={{ color: cat.color }}>
                      {cat.label}
                      {isMeasurement && unit && ` (${unit})`}
                    </p>
                    {items.map((item, i) => {
                      const val = scores[cat.id]?.[i] ?? 0;
                      return (
                        <div key={`${cat.id}-${i}`} className="mb-3 last:mb-0">
                          <p className="mb-1 text-sm text-slate-300">{item}</p>
                          {isMeasurement ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="any"
                                value={val || ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                                  setScore(cat.id, i, Number.isFinite(v) ? v : 0);
                                }}
                                placeholder="수치"
                                className="w-28 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                              />
                              {unit && <span className="text-xs text-slate-500">{unit}</span>}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] text-slate-400">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <span key={n}>{n}</span>
                                ))}
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={val || 0}
                                onChange={(e) =>
                                  setScore(cat.id, i, Number(e.target.value) || 0)
                                }
                                className="w-full accent-emerald-500"
                              />
                              <div className="flex justify-between text-[11px] text-slate-300">
                                <span>
                                  선택:{" "}
                                  {val ? `${val}점` : "아직 선택하지 않았습니다 (1~5점)"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Link
                href={`/player/stats?playerId=${encodeURIComponent(playerId)}`}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                닫기
              </Link>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "저장 중…" : "저장"}
              </button>
            </div>

            {saved && <p className="mt-4 text-center text-sm text-emerald-400">저장되었습니다. 내 스탯에 반영됩니다.</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayerSelfEvaluatePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <Suspense fallback={<p className="p-4 text-slate-500">불러오는 중…</p>}>
        <SelfEvaluateContent />
      </Suspense>
    </main>
  );
}
