"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Player, StatDefinition } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, isMeasurementCategory } from "@/lib/statDefinition";
import { playerApiInit } from "@/lib/playerClientFetch";

const SELF_EVALUATOR_ID = "self";

type EvalPhaseSelf = "PLAYER_PRE" | "PLAYER_POST";

type PlayerSession = {
  session?: {
    role: "player" | "coach" | "owner";
    playerId?: string;
  };
};

type EvalRowSelf = {
  evaluatorStaffId: string;
  subjectPlayerId: string;
  phase?: string | null;
  taskId?: string | null;
  scores: Record<string, number[]>;
};

function SelfEvaluateContent() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId") ?? undefined;

  const [effectivePlayerId, setEffectivePlayerId] = useState<string | null>(null);
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [def, setDef] = useState<StatDefinition>(DEFAULT_STAT_DEFINITION);
  const [phase, setPhase] = useState<EvalPhaseSelf>("PLAYER_POST");
  const [scores, setScores] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  /** 팀 스탯 정의 중 코치가 자기평가에 포함하도록 지정한 카테고리만 */
  const selfEvalDef = useMemo(() => {
    const ids = def.selfEvalCategoryIds;
    if (ids === undefined) return def;
    if (ids.length === 0) {
      return { ...def, categories: [], items: {} };
    }
    const idSet = new Set(ids);
    const categories = def.categories.filter((c) => idSet.has(c.id));
    const items: Record<string, string[]> = {};
    for (const c of categories) {
      items[c.id] = def.items[c.id] ?? [];
    }
    return { ...def, categories, items };
  }, [def]);

  const canSaveSelfEval = useMemo(() => {
    for (const c of selfEvalDef.categories) {
      if ((selfEvalDef.items[c.id] ?? []).length > 0) return true;
    }
    return false;
  }, [selfEvalDef]);

  const setScore = useCallback((catId: string, itemIndex: number, value: number) => {
    setScores((prev) => {
      const arr = [...(prev[catId] ?? [])];
      arr[itemIndex] = value;
      return { ...prev, [catId]: arr };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPageError(null);
      setPlayer(null);
      setAffiliationName(null);
      try {
        const fetchOpts = playerApiInit();
        const sessionRes = await fetch("/api/auth/session", fetchOpts);
        const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
        const role = sessionData.session?.role;
        if (role === "coach" || role === "owner") {
          setPageError(
            "코치·구단 계정으로는 선수용 「자기평가」를 열 수 없습니다. 선수 계정으로 로그인해 주세요.",
          );
          setEffectivePlayerId(null);
          setSessionPlayerId(null);
          return;
        }
        const sid =
          role === "player" ? (sessionData.session?.playerId ?? null) : null;
        setSessionPlayerId(sid);
        if (!sid) {
          setPageError("자기평가를 보려면 선수로 로그인해 주세요.");
          setEffectivePlayerId(null);
          return;
        }
        const pid = sid;
        setEffectivePlayerId(pid);
        try {
          window.localStorage.setItem("tmt:lastPlayerId", pid);
        } catch {
          /* ignore */
        }

        const playerRes = await fetch(
          `/api/players/${encodeURIComponent(pid)}`,
          fetchOpts,
        );
        if (!playerRes.ok) {
          setEffectivePlayerId(null);
          if (playerRes.status === 404) {
            setPageError("선수를 찾을 수 없습니다. 링크·코드가 맞는지 확인해 주세요.");
          } else {
            setPageError("선수 정보를 불러오지 못했습니다.");
          }
          return;
        }
        const p = (await playerRes.json()) as Player;
        if (cancelled) return;
        setPlayer(p);
        if (!p.teamId) {
          setAffiliationName(null);
          setDef(DEFAULT_STAT_DEFINITION);
          return;
        }
        const teamRes = await fetch(`/api/teams/${encodeURIComponent(p.teamId)}`, fetchOpts);
        const teamJson = teamRes.ok
          ? ((await teamRes.json()) as {
              statDefinition?: StatDefinition | null;
              name?: string;
            })
          : null;
        if (cancelled) return;
        if (teamJson?.statDefinition) setDef(teamJson.statDefinition);
        else setDef(DEFAULT_STAT_DEFINITION);
        setAffiliationName(teamJson?.name ?? null);
      } catch {
        if (!cancelled) setPageError("데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!player?.teamId || !effectivePlayerId || !sessionPlayerId) return;
    let cancelled = false;
    const evalQs = new URLSearchParams();
    if (taskId) evalQs.set("taskId", taskId);
    fetch(
      `/api/teams/${encodeURIComponent(player.teamId)}/player-evaluations?${evalQs}`,
      playerApiInit(),
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((list: EvalRowSelf[]) => {
        if (!cancelled && Array.isArray(list)) {
          const selfEval = list.find((e) => {
            const isSelf =
              e.evaluatorStaffId === SELF_EVALUATOR_ID &&
              e.subjectPlayerId === effectivePlayerId &&
              (e.phase === "PLAYER_PRE" || e.phase === "PLAYER_POST") &&
              e.phase === phase;
            if (!isSelf) return false;
            if (taskId) return e.taskId === taskId;
            return !e.taskId;
          });
          if (selfEval?.scores) setScores(selfEval.scores);
          else setScores({});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [player?.teamId, effectivePlayerId, sessionPlayerId, phase, taskId]);

  async function handleSave() {
    if (!player?.teamId || !effectivePlayerId) return;
    if (!canSaveSelfEval) return;
    setSubmitting(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/teams/${encodeURIComponent(player.teamId)}/player-evaluations`,
        playerApiInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evaluatorStaffId: SELF_EVALUATOR_ID,
            subjectPlayerId: effectivePlayerId,
            phase,
            scores,
            taskId,
          }),
        }),
      );
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        setSaveError(
          errBody.error ??
            "저장하려면 선수로 로그인해 주세요. 대시보드에서 로그인한 뒤 다시 시도해 주세요.",
        );
        return;
      }
      if (!res.ok) {
        setSaveError(errBody.error ?? "저장에 실패했습니다.");
        return;
      }
      setSaved(true);
    } catch {
      setSaveError("저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && pageError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl border border-rose-800/80 bg-rose-950/40 p-6 text-center">
          <p className="text-sm text-rose-100">{pageError}</p>
          <Link
            href="/player"
            className="mt-4 inline-block rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            대시보드로 이동
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !effectivePlayerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">
            선수 정보를 찾을 수 없습니다. 홈에서 개인 번호로 로그인한 뒤 다시 이용해 주세요.
          </p>
          <Link
            href="/player"
            className="mt-4 inline-block rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
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
            href={
              effectivePlayerId
                ? `/player/stats?playerId=${encodeURIComponent(effectivePlayerId)}`
                : "/player/stats"
            }
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← 내 스탯
          </Link>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          본인 스탯 항목에 대해 1~5점 또는 측정값을 입력하세요. 코치 평가와 함께 반영됩니다.
        </p>
        <div className="mb-4 rounded-lg border border-slate-600/80 bg-slate-800/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          <p className="font-medium text-slate-300">문항은 어디서 바꾸나요?</p>
          <p className="mt-1">
            항목·카테고리는 <strong className="text-slate-200">소속 팀의 스탯 정의</strong>와 같습니다.
            코치는 <strong className="text-slate-200">코치 화면 → 팀</strong>에서 팀을 편집할 때「스탯
            정의」에서 카테고리·항목명·개수를 정하고, 각 카테고리마다「자기평가에 표시」를 켠
            것만 이 화면에 나옵니다. 팀 맞춤 스탯이 아직 없으면 기본 예시 문항이 보일 수 있습니다.
          </p>
        </div>
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
              {selfEvalDef.categories.length === 0 ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-3 text-sm text-amber-100/90">
                  자기평가에 표시된 문항이 없습니다. 소속 팀 코치에게 팀 편집 → 스탯 정의에서
                  카테고리를 켜고「자기평가에 표시」를 선택해 달라고 요청해 주세요.
                </p>
              ) : null}
              {selfEvalDef.categories.map((cat) => {
                const items = selfEvalDef.items[cat.id] ?? [];
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
                href={
                  effectivePlayerId
                    ? `/player/stats?playerId=${encodeURIComponent(effectivePlayerId)}`
                    : "/player/stats"
                }
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                닫기
              </Link>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting || !sessionPlayerId || !canSaveSelfEval}
                title={
                  !sessionPlayerId
                    ? "선수 로그인 후에만 저장할 수 있습니다."
                    : !canSaveSelfEval
                      ? "자기평가 문항이 없어 저장할 수 없습니다. 코치에게 팀 스탯·자기평가 표시 설정을 요청해 주세요."
                      : undefined
                }
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "저장 중…" : "저장"}
              </button>
            </div>

            {saveError && (
              <p className="mt-4 text-center text-sm text-amber-400">{saveError}</p>
            )}
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
