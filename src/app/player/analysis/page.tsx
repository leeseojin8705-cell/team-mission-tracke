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

export default function PlayerAnalysisPage() {
  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [players, setPlayers] = useState<{ id: string; name: string; teamId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [playerEvents, setPlayerEvents] = useState<AnalysisEventsData>({
    atk: [],
    def: [],
    pass: [],
    gk: [],
  });
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  useEffect(() => {
    if (!selectedAnalysisId || !currentPlayerId || !selectedAnalysis) return;
    const pe = selectedAnalysis.playerEvents as Record<string, AnalysisEventsData> | null | undefined;
    const existing = pe?.[currentPlayerId];
    if (existing && typeof existing === "object") {
      setPlayerEvents({
        atk: existing.atk ?? [],
        def: existing.def ?? [],
        pass: existing.pass ?? [],
        gk: existing.gk ?? [],
      });
    } else {
      setPlayerEvents({ atk: [], def: [], pass: [], gk: [] });
    }
  }, [selectedAnalysisId, currentPlayerId, selectedAnalysis?.id]);

  const handleAnalysisSelect = useCallback((id: string) => {
    setSelectedAnalysisId(id);
    setSendMessage(null);
  }, []);

  const handlePlayerChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setCurrentPlayerId(id);
    try {
      window.localStorage.setItem("tmt:lastPlayerId", id);
    } catch {}
  }, []);

  const handleSendToCoach = useCallback(async () => {
    if (!selectedAnalysisId || !currentPlayerId) return;
    setSending(true);
    setSendMessage(null);
    try {
      const res = await fetch(`/api/analyses/${selectedAnalysisId}/player-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId, events: playerEvents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendMessage({ type: "err", text: data.error || "저장에 실패했습니다." });
        return;
      }
      setSendMessage({ type: "ok", text: "코치에게 전달되었습니다." });
    } catch {
      setSendMessage({ type: "err", text: "전송 중 오류가 발생했습니다." });
    } finally {
      setSending(false);
    }
  }, [selectedAnalysisId, currentPlayerId, playerEvents]);

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
        <h1 className="text-xl font-semibold text-slate-100">개인 전술 데이터</h1>
        <p className="text-sm text-slate-400">
          경기를 선택한 뒤 포인트를 기록하고 「코치에게 보내기」를 누르면 이 정보가 코치 코너의 선수 개인 데이터로 전달되며, 코치 전술 데이터(기록관)와 연동됩니다.
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
                  경기 선택
                </p>
                {myAnalyses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    우리 팀 경기 기록이 없습니다. 코치가 전술 데이터를 저장하면 여기에서 선택할 수 있습니다.
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
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => handleAnalysisSelect(a.id)}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              isSelected
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                                : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                            }`}
                          >
                            <span className="block font-medium">{name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{dateStr}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              {selectedAnalysis ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-200">
                      {selectedAnalysis.matchName ?? selectedAnalysis.opponent ?? "—"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSendToCoach}
                        disabled={sending}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {sending ? "전송 중…" : "코치에게 보내기"}
                      </button>
                    </div>
                  </div>
                  {sendMessage && (
                    <p
                      className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                        sendMessage.type === "ok"
                          ? "bg-emerald-950/50 text-emerald-200"
                          : "bg-rose-950/50 text-rose-200"
                      }`}
                    >
                      {sendMessage.text}
                    </p>
                  )}
                  <div className="min-w-0 w-full max-w-4xl">
                    <FootballTacticsAnalyzer
                      initialData={playerEvents}
                      onChange={setPlayerEvents}
                      showHalfToggle={true}
                      readOnly={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
                  <p className="text-sm font-medium text-slate-400">경기 선택</p>
                  <p className="mt-1 text-sm text-slate-500">
                    왼쪽에서 경기를 선택하면 개인 전술 포인트를 기록하고 코치에게 보낼 수 있습니다. 제출한 데이터는 기록관에서 확인할 수 있습니다.
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
