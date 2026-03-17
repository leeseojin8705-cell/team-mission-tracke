"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
} from "@/components/FootballTacticsAnalyzer";
import type { MatchAnalysis } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AnalysisWithMeta = MatchAnalysis & {
  schedule?: { id: string; title: string; date: string } | null;
  team?: { id: string; name: string } | null;
};

function getSortDate(a: AnalysisWithMeta): number {
  if (a.matchDate) return new Date(a.matchDate).getTime();
  const d = a.schedule?.date;
  if (!d) return 0;
  return new Date(typeof d === "string" ? d : (d as unknown as string)).getTime();
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function PlayerArchivePage() {
  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [players, setPlayers] = useState<{ id: string; name: string; teamId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  const me = useMemo(
    () => players.find((p) => p.id === currentPlayerId),
    [players, currentPlayerId],
  );
  const myTeamId = me?.teamId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [playersRes, analysesRes] = await Promise.all([
          fetch("/api/players"),
          fetch("/api/analyses"),
        ]);
        if (!playersRes.ok || !analysesRes.ok) throw new Error("데이터를 불러오지 못했습니다.");
        const [playersData, analysesData]: [
          { id: string; name: string; teamId: string }[],
          AnalysisWithMeta[],
        ] = await Promise.all([playersRes.json(), analysesRes.json()]);
        if (cancelled) return;
        setPlayers(playersData);
        setAnalyses(analysesData);
        if (!currentPlayerId && playersData[0]) {
          const saved = typeof window !== "undefined" ? window.localStorage.getItem("tmt:lastPlayerId") : null;
          const id = saved && playersData.some((p) => p.id === saved) ? saved : playersData[0].id;
          setCurrentPlayerId(id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const myAnalyses = useMemo(() => {
    if (!myTeamId) return [];
    return analyses
      .filter((a) => a.teamId === myTeamId)
      .sort((a, b) => getSortDate(b) - getSortDate(a));
  }, [analyses, myTeamId]);

  const selectedAnalysis = useMemo(
    () => myAnalyses.find((a) => a.id === selectedAnalysisId),
    [myAnalyses, selectedAnalysisId],
  );

  const mySubmittedData: AnalysisEventsData | null = useMemo(() => {
    if (!selectedAnalysis || !currentPlayerId) return null;
    const pe = selectedAnalysis.playerEvents as Record<string, AnalysisEventsData> | null | undefined;
    const existing = pe?.[currentPlayerId];
    if (existing && typeof existing === "object") {
      return {
        atk: existing.atk ?? [],
        def: existing.def ?? [],
        pass: existing.pass ?? [],
        gk: existing.gk ?? [],
      };
    }
    return { atk: [], def: [], pass: [], gk: [] };
  }, [selectedAnalysis, currentPlayerId]);

  const hasSubmittedData = mySubmittedData
    ? (mySubmittedData.atk?.length ?? 0) +
      (mySubmittedData.def?.length ?? 0) +
      (mySubmittedData.pass?.length ?? 0) +
      (mySubmittedData.gk?.length ?? 0) > 0
    : false;

  const handlePlayerChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setCurrentPlayerId(id);
    try {
      window.localStorage.setItem("tmt:lastPlayerId", id);
    } catch {}
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/player"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 대시보드
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-slate-100">기록관</h1>
        <p className="text-sm text-slate-400">
          내가 제출한 개인 전술 데이터를 경기별로 볼 수 있습니다. 코치 기록관과 연동된 데이터입니다.
        </p>

        {error && (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : !me ? (
          <p className="text-sm text-slate-400">선수를 선택해 주세요.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <aside className="w-full shrink-0 sm:max-w-[260px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  선수 선택
                </p>
                <select
                  value={currentPlayerId}
                  onChange={handlePlayerChange}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  경기 목록
                </p>
                {myAnalyses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    우리 팀 경기 기록이 없습니다.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-0.5">
                    {myAnalyses.map((a) => {
                      const dateStr = a.matchDate
                        ? formatDate(a.matchDate)
                        : a.schedule?.date
                          ? formatDate(
                              typeof a.schedule.date === "string"
                                ? a.schedule.date
                                : new Date(a.schedule.date as unknown as string).toISOString(),
                            )
                          : "—";
                      const name = a.matchName ?? a.opponent ?? "—";
                      const isSelected = selectedAnalysisId === a.id;
                      const pe = a.playerEvents as Record<string, AnalysisEventsData> | null | undefined;
                      const myData = currentPlayerId && pe?.[currentPlayerId];
                      const hasData = myData && typeof myData === "object" &&
                        ((myData.atk?.length ?? 0) + (myData.def?.length ?? 0) + (myData.pass?.length ?? 0) + (myData.gk?.length ?? 0) > 0);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedAnalysisId(a.id)}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              isSelected
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                                : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                            }`}
                          >
                            <span className="block font-medium">{name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{dateStr}</span>
                            {hasData && (
                              <span className="mt-1 inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                제출함
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

            <div className="min-w-0 flex-1">
              {selectedAnalysis && mySubmittedData ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-200">
                      {selectedAnalysis.matchName ?? selectedAnalysis.opponent ?? "—"}
                    </span>
                    <span className="text-xs text-slate-500">내가 제출한 데이터 (읽기 전용)</span>
                  </div>
                  {!hasSubmittedData ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
                      <p className="text-sm text-slate-400">이 경기에 제출한 데이터가 없습니다.</p>
                      <Link
                        href="/player/analysis"
                        className="mt-3 text-sm text-emerald-400 hover:underline"
                      >
                        개인 전술 데이터에서 제출하기 →
                      </Link>
                    </div>
                  ) : (
                    <div className="min-w-0 w-full max-w-4xl">
                      <FootballTacticsAnalyzer
                        initialData={mySubmittedData}
                        onChange={() => {}}
                        showHalfToggle={true}
                        readOnly={true}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
                  <p className="text-sm font-medium text-slate-400">경기 선택</p>
                  <p className="mt-1 text-sm text-slate-500">
                    왼쪽에서 경기를 선택하면 내가 제출한 기록을 볼 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
