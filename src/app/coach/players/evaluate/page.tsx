"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Player, StatDefinition, TeamStaff } from "@/lib/types";
import { DEFAULT_STAT_DEFINITION, isMeasurementCategory } from "@/lib/statDefinition";

function EvaluateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId") ?? "";
  const urlPlayerId = searchParams.get("playerId") ?? "";
  const urlEvaluatorStaffId = searchParams.get("evaluatorStaffId") ?? "";

  const [subjectPlayerId, setSubjectPlayerId] = useState(urlPlayerId);
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [evaluatorStaffId, setEvaluatorStaffId] = useState("");
  const [staffList, setStaffList] = useState<TeamStaff[]>([]);
  const [coachList, setCoachList] = useState<TeamStaff[]>([]);
  const [scores, setScores] = useState<Record<string, number[]>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const subjectPlayer = playerList.find((p) => p.id === subjectPlayerId);
  const name = subjectPlayer?.name ?? "";
  const position = subjectPlayer?.position ?? "";

  useEffect(() => {
    setSubjectPlayerId((prev) => (urlPlayerId || prev));
  }, [urlPlayerId]);

  const [def, setDef] = useState<StatDefinition>(DEFAULT_STAT_DEFINITION);

  const setScore = useCallback((catId: string, itemIndex: number, value: number) => {
    setScores((prev) => {
      const arr = [...(prev[catId] ?? [])];
      arr[itemIndex] = value;
      return { ...prev, [catId]: arr };
    });
  }, []);

  useEffect(() => {
    if (!teamId) return;
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
    Promise.all([
      fetch(`/api/teams/${teamId}`).then((r) => safeJson(r, null as { statDefinition?: StatDefinition | null } | null)),
      fetch(`/api/teams/${teamId}/staff`).then((r) => safeJson(r, [] as TeamStaff[])),
      fetch(`/api/players?teamId=${encodeURIComponent(teamId)}`).then((r) => safeJson(r, [] as Player[])),
    ])
      .then(([teamRes, staffList, playersList]) => {
        if (cancelled) return;
        if (teamRes?.statDefinition) setDef(teamRes.statDefinition);
        else setDef(DEFAULT_STAT_DEFINITION);
        const staff = Array.isArray(staffList) ? staffList : [];
        const coaches = staff.filter((s) => s.guidance);
        setStaffList(staff);
        setCoachList(coaches);
        const players = Array.isArray(playersList) ? playersList : [];
        setPlayerList(players);
        if (urlEvaluatorStaffId) {
          setEvaluatorStaffId((prev) => prev || urlEvaluatorStaffId);
        } else if (coaches.length) {
          setEvaluatorStaffId((prev) => prev || coaches[0].id);
        }
        if (players.length && !subjectPlayerId) setSubjectPlayerId((prev) => prev || players[0].id);
        else if (urlPlayerId && players.some((p) => p.id === urlPlayerId)) setSubjectPlayerId(urlPlayerId);
      })
      .catch(() => {
        if (!cancelled) setPlayerList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !subjectPlayerId || !evaluatorStaffId) return;
    let cancelled = false;
    fetch(`/api/teams/${teamId}/player-evaluations`)
      .then((r) => r.json())
      .then((list: { evaluatorStaffId: string; subjectPlayerId: string; scores: Record<string, number[]> }[]) => {
        if (!cancelled) {
          const one = list.find(
            (e) => e.evaluatorStaffId === evaluatorStaffId && e.subjectPlayerId === subjectPlayerId
          );
          if (one?.scores) setScores(one.scores);
          else setScores({});
        }
      })
      .catch(() => {
        if (!cancelled) setScores({});
      });
    return () => { cancelled = true; };
  }, [teamId, subjectPlayerId, evaluatorStaffId]);

  function handleClose() {
    router.back();
  }

  async function handleSave() {
    if (!teamId || !evaluatorStaffId || !subjectPlayerId) return;
    setSubmitting(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/teams/${teamId}/player-evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluatorStaffId,
          subjectPlayerId,
          scores: scores && typeof scores === "object" ? scores : {},
        }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text) as { error?: string }; } catch { return {}; } })() : {};
      if (!res.ok) {
        const msg = data.error ?? `저장 실패 (${res.status})`;
        setSaveError(msg);
        return;
      }
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!teamId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">잘못된 접근입니다. 선수 관리에서 평가할 팀/선수를 선택해 주세요.</p>
          <button
            type="button"
            onClick={handleClose}
            className="mt-4 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            선수 관리로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h1 className="mb-4 text-lg font-semibold text-slate-100">선수 스탯 평가</h1>

        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">평가 대상 선수</label>
              <select
                value={subjectPlayerId}
                onChange={(e) => setSubjectPlayerId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">선수를 선택하세요</option>
                {playerList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.position ? ` (${p.position})` : ""}
                  </option>
                ))}
              </select>
              {subjectPlayer && (
                <p className="mt-1 text-xs text-emerald-400/90">
                  {subjectPlayer.name}
                  {subjectPlayer.position ? ` · ${subjectPlayer.position}` : ""}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">평가자 (지도진)</label>
              <select
                value={evaluatorStaffId}
                onChange={(e) => setEvaluatorStaffId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              >
                {(() => {
                  const coaches = coachList;
                  const selected = evaluatorStaffId && !coaches.some((c) => c.id === evaluatorStaffId)
                    ? staffList.find((s) => s.id === evaluatorStaffId)
                    : null;
                  const options = selected ? [selected, ...coaches] : coaches;
                  return options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ));
                })()}
              </select>
            </div>

            {!subjectPlayerId ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-6 text-center text-sm text-slate-400">
                평가 대상 선수를 선택하세요.
              </div>
            ) : (
              <>
            <p className="mb-3 text-xs text-slate-400">항목별 기입(1~5점) 또는 측정(수치+단위)</p>
            <div className="space-y-4">
              {def.categories.map((cat) => {
                const items = def.items[cat.id] ?? [];
                if (items.length === 0) return null;
                const isMeasurement = isMeasurementCategory(def, cat.id);
                const unit = (def.categoryUnit?.[cat.id] ?? "").trim();
                return (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3"
                  >
                    <p
                      className="mb-2 text-xs font-semibold"
                      style={{ color: cat.color }}
                    >
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
                            <div className="flex gap-0">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setScore(cat.id, i, n)}
                                  className={`h-9 w-10 border border-slate-600 text-sm font-semibold transition first:rounded-l-md last:rounded-r-md last:border-r ${
                                    val === n
                                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
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
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "저장 중…" : "저장"}
              </button>
            </div>

            {saved && (
              <p className="mt-4 text-center text-sm text-emerald-400">저장되었습니다.</p>
            )}
            {saveError && (
              <p className="mt-4 text-center text-sm text-rose-400">{saveError}</p>
            )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CoachPlayersEvaluatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <p className="text-slate-500">불러오는 중…</p>
        </div>
      }
    >
      <EvaluateContent />
    </Suspense>
  );
}
