"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
  type OverlayLayer,
} from "@/components/FootballTacticsAnalyzer";
import type { MatchAnalysis, PlayerEventsMap } from "@/lib/types";
import { aggregatePlayerEvents } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type AnalysisWithMeta = MatchAnalysis & {
  schedule?: { id: string; title: string; date: string } | null;
  team?: { id: string; name: string } | null;
};

type PlayerRow = { id: string; name: string; teamId: string };

function getSortDate(a: AnalysisWithMeta): number {
  if (a.matchDate) return new Date(a.matchDate).getTime();
  const d = a.schedule?.date;
  if (!d) return 0;
  return new Date(typeof d === "string" ? d : (d as unknown as string)).getTime();
}

const AGGREGATED_ID = "__aggregated__";

export default function CoachAnalysisArchivePage() {
  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAggregated, setShowAggregated] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [optionsExpanded, setOptionsExpanded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const loadAnalyses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/analyses");
      if (!res.ok) throw new Error("목록을 불러오지 못했습니다.");
      const data: AnalysisWithMeta[] = await res.json();
      setAnalyses(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  const sortedByDate = useMemo(() => {
    return [...analyses].sort((a, b) => getSortDate(b) - getSortDate(a));
  }, [analyses]);

  const selected = analyses.find((a) => a.id === selectedId);

  useEffect(() => {
    if (!selected?.teamId) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/players?teamId=${encodeURIComponent(selected.teamId)}`)
      .then((r) => r.json())
      .then((list: PlayerRow[]) => {
        if (!cancelled) setPlayers(list);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      });
    return () => { cancelled = true; };
  }, [selected?.teamId]);

  const coachData: AnalysisEventsData | null = selected
    ? (selected.events as AnalysisEventsData)
    : null;

  const playerEventsMap = (selected?.playerEvents ?? null) as PlayerEventsMap | null;
  const aggregatedData = useMemo(
    () => aggregatePlayerEvents(playerEventsMap),
    [playerEventsMap],
  );

  const overlayLayers = useMemo((): OverlayLayer[] => {
    if (!playerEventsMap || typeof playerEventsMap !== "object") return [];
    const list: OverlayLayer[] = [];
    list.push({
      id: AGGREGATED_ID,
      name: "팀 전체(선수 합산)",
      data: aggregatedData as AnalysisEventsData,
    });
    players.forEach((p) => {
      const ev = playerEventsMap[p.id];
      if (ev && typeof ev === "object" && (Array.isArray(ev.atk) ? ev.atk.length : 0) + (Array.isArray(ev.def) ? ev.def.length : 0) + (Array.isArray(ev.pass) ? ev.pass.length : 0) + (Array.isArray(ev.gk) ? ev.gk.length : 0) > 0) {
        list.push({
          id: p.id,
          name: p.name,
          data: ev as AnalysisEventsData,
        });
      }
    });
    return list;
  }, [playerEventsMap, players, aggregatedData]);

  const visibleOverlayIds = useMemo(() => {
    const ids: string[] = [];
    if (showAggregated) ids.push(AGGREGATED_ID);
    selectedPlayerIds.forEach((id) => ids.push(id));
    return ids;
  }, [showAggregated, selectedPlayerIds]);

  const togglePlayer = useCallback((playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }, []);

  const hasAggregated = aggregatedData.atk.length + aggregatedData.def.length + aggregatedData.pass.length + aggregatedData.gk.length > 0;
  const playersWithData = useMemo(() => {
    if (!playerEventsMap || typeof playerEventsMap !== "object") return [];
    return players.filter((p) => {
      const ev = playerEventsMap[p.id];
      if (!ev || typeof ev !== "object") return false;
      const n = (Array.isArray(ev.atk) ? ev.atk.length : 0) + (Array.isArray(ev.def) ? ev.def.length : 0) + (Array.isArray(ev.pass) ? ev.pass.length : 0) + (Array.isArray(ev.gk) ? ev.gk.length : 0);
      return n > 0;
    });
  }, [playerEventsMap, players]);

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          기록관
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          경기를 클릭한 뒤, 불러올 자료(코치 / 팀 전체 / 선수별)를 선택하세요. 선택하지 않으면 코치 기록만 표시됩니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          선수별 데이터는 선수가 「개인 전술 데이터」에서 보낸 내용이며, 이 기록관(코치 전술 데이터)과 연동됩니다.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="relative flex flex-wrap gap-6 lg:gap-8">
        {sidebarOpen && (
          <aside className="w-full shrink-0 sm:max-w-[260px]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  경기 자료
                </h2>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-700/60 hover:text-slate-300"
                  title="접어서 데이터 화면만 보기"
                >
                  접기
                </button>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-slate-500">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
                  <span className="text-sm">불러오는 중…</span>
                </div>
              ) : sortedByDate.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  저장된 분석이 없습니다.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {sortedByDate.map((a) => {
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
                    const resultStr = a.result ? ` · ${a.result}` : "";
                    const isSelected = selectedId === a.id;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSidebarOpen(false);
                            } else {
                              setSelectedId(a.id);
                            }
                          }}
                          className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            isSelected
                              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                              : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                          }`}
                        >
                          <span className="block font-medium">{name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {dateStr}{resultStr}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        )}

        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="fixed left-4 top-28 z-10 rounded-r-lg border border-slate-600 bg-slate-800/95 px-3 py-2 text-xs font-medium text-slate-300 shadow-lg hover:bg-slate-700 hover:text-slate-100"
            title="경기 자료 목록 펼치기"
          >
            경기 자료
          </button>
        )}

        <div className={`min-w-0 flex-1 space-y-6 ${!sidebarOpen ? "w-full" : ""}`}>
          {selected && coachData ? (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-200">
                    {selected.matchName ?? selected.opponent ?? "—"}
                  </span>
                  {selected.result && (
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {selected.result}
                    </span>
                  )}
                  <span className="text-slate-500">
                    {selected.matchDate
                      ? formatDate(selected.matchDate)
                      : selected.schedule?.date
                        ? formatDate(
                            typeof selected.schedule.date === "string"
                              ? selected.schedule.date
                              : new Date(selected.schedule.date as unknown as string).toISOString(),
                          )
                        : ""}
                  </span>
                </div>

                {optionsExpanded ? (
                  <div className="mb-4 rounded-lg border border-slate-700/80 bg-slate-800/40 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setOptionsExpanded(false)}
                      className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
                    >
                      불러올 자료
                      <span className="text-slate-500">접기</span>
                    </button>
                    <p className="mb-2 text-xs text-slate-400">
                      기본: 코치 기록만 표시. 아래에서 팀 전체 합산·개별 선수를 선택하면 같은 캔버스에 겹쳐 표시됩니다. 해제하면 해당 포인트는 보이지 않습니다.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700/60">
                        <input
                          type="checkbox"
                          checked={showAggregated}
                          onChange={() => setShowAggregated((v) => !v)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                        />
                        팀 전체(선수 합산)
                      </label>
                      {players.map((p) => (
                        <label
                          key={p.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700/60"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPlayerIds.has(p.id)}
                            onChange={() => togglePlayer(p.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                          />
                          {p.name}
                        </label>
                      ))}
                      {players.length === 0 && (
                        <span className="text-xs text-slate-500">이 경기에 연결된 팀 선수 없음</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setOptionsExpanded(true)}
                      className="rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                    >
                      불러올 자료 펼치기
                    </button>
                  </div>
                )}

                <div className="min-w-0 w-full max-w-4xl">
                  <FootballTacticsAnalyzer
                    initialData={coachData}
                    showHalfToggle={true}
                    readOnly={true}
                    overlayLayers={overlayLayers}
                    visibleOverlayIds={visibleOverlayIds}
                  />
                </div>
              </div>

              {hasAggregated && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-200">
                    선수 데이터 전체 합산
                  </h3>
                  <p className="mb-3 text-xs text-slate-400">
                    선수들이 제출한 포인트만 합쳐서 표시합니다. (코치 기록 제외)
                  </p>
                  <div className="min-w-0 w-full max-w-4xl">
                    <FootballTacticsAnalyzer
                      initialData={aggregatedData as AnalysisEventsData}
                      showHalfToggle={true}
                      readOnly={true}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-400">경기 선택</p>
              <p className="mt-1 text-sm text-slate-500">
                왼쪽 목록에서 경기를 선택하면 여기에 코치 기록과 불러올 자료 선택이 표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
