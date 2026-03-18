"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
  type OverlayLayer,
} from "@/components/FootballTacticsAnalyzer";
import type { PlayerEventsMap } from "@/lib/types";
import { aggregatePlayerEvents } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type AnalysisItem = {
  id: string;
  matchDate: string | null;
  matchName: string | null;
  result: string | null;
  teamId: string | null;
  team?: { id: string; name: string } | null;
  events: AnalysisEventsData;
  playerEvents: PlayerEventsMap | null;
};

type PlayerRow = { id: string; name: string; teamId: string };

const AGGREGATED_ID = "__aggregated__";

function formatDate(dateStr: string) {
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

export default function CoachAnalysisArchiveDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : null;

  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAggregated, setShowAggregated] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [optionsExpanded, setOptionsExpanded] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analyses/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("경기를 불러오지 못했습니다.");
        return r.json();
      })
      .then((data: AnalysisItem) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!analysis?.teamId) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/players?teamId=${encodeURIComponent(analysis.teamId)}`)
      .then((r) => r.json())
      .then((list: PlayerRow[]) => {
        if (!cancelled) setPlayers(list);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      });
    return () => { cancelled = true; };
  }, [analysis?.teamId]);

  const playerEventsMap = analysis?.playerEvents ?? null;
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
      if (
        ev &&
        typeof ev === "object" &&
        (Array.isArray(ev.atk) ? ev.atk.length : 0) +
          (Array.isArray(ev.def) ? ev.def.length : 0) +
          (Array.isArray(ev.pass) ? ev.pass.length : 0) +
          (Array.isArray(ev.gk) ? ev.gk.length : 0) >
          0
      ) {
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
    selectedPlayerIds.forEach((pid) => ids.push(pid));
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

  const hasAggregated =
    aggregatedData.atk.length +
      aggregatedData.def.length +
      aggregatedData.pass.length +
      aggregatedData.gk.length >
    0;

  if (!id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-slate-400">경기 ID가 없습니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-500">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
        <span>경기 정보를 불러오는 중…</span>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="space-y-4">
        <Link
          href="/coach/analysis/archive"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
        >
          ← 기록관 목록
        </Link>
        <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error ?? "경기를 찾을 수 없습니다."}
        </p>
      </div>
    );
  }

  const coachData = analysis.events;

  return (
    <div className="min-h-screen space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <Link
          href="/coach/analysis/archive"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-200"
        >
          ← 기록관 목록
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-200">
            {analysis.matchName ?? "—"}
          </span>
          {analysis.result && (
            <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
              {analysis.result}
            </span>
          )}
          <span className="text-slate-500">
            {analysis.matchDate ? formatDate(analysis.matchDate) : ""}
          </span>
          {analysis.team?.name && (
            <span className="text-slate-500">· {analysis.team.name}</span>
          )}
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
              기본: 코치 기록만 표시. 아래에서 팀 전체 합산·개별 선수를 선택하면 같은 캔버스에 겹쳐 표시됩니다.
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
    </div>
  );
}
