"use client";

import { aggregateResults } from "@/lib/analysisResult";
import type { MatchAnalysis } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function CoachAnalysisArchivePage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 선택한 경기 id 집합 (통계에 포함) */
  const [selectedIdsForStats, setSelectedIdsForStats] = useState<Set<string>>(new Set());

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

  const toggleSelectForStats = useCallback((id: string) => {
    setSelectedIdsForStats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllForStats = useCallback(() => {
    setSelectedIdsForStats(new Set(sortedByDate.map((a) => a.id)));
  }, [sortedByDate]);

  const clearSelectForStats = useCallback(() => {
    setSelectedIdsForStats(new Set());
  }, []);

  const selectedForStats = useMemo(() => {
    return sortedByDate.filter((a) => selectedIdsForStats.has(a.id));
  }, [sortedByDate, selectedIdsForStats]);

  const stats = useMemo(
    () =>
      aggregateResults(
        selectedForStats.map((a) => ({ result: a.result ?? null })),
      ),
    [selectedForStats],
  );

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          기록관
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          경기 목록에서 항목을 클릭하면 상세 페이지(전체 화면)로 이동합니다. 통계를 보려면 경기를 선택한 뒤 아래 통계 영역을 확인하세요.
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

      {!loading && selectedForStats.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              선택 경기 통계 (총 {stats.total}경기)
            </p>
            <button
              type="button"
              onClick={clearSelectForStats}
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              선택 해제
            </button>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            결과가 입력된 경기만 승·패·득점·실점에 포함됩니다. 전술 데이터 저장 시 「결과」란에 예: 2-1 승, 1-2 패, 1-1 무 형식으로 입력하세요.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-300">
                <span className="font-semibold text-emerald-400">{stats.wins}</span> 승
              </span>
              <span className="text-slate-300">
                <span className="font-semibold text-rose-400">{stats.losses}</span> 패
              </span>
              <span className="text-slate-300">
                <span className="font-semibold text-slate-300">{stats.draws}</span> 무
              </span>
            </div>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">
              승률 <span className="font-semibold text-slate-100">{stats.winRate.toFixed(1)}%</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">
              득실 차 <span className="font-semibold text-slate-100">{stats.goalDiff >= 0 ? `+${stats.goalDiff}` : stats.goalDiff}</span>
              <span className="ml-1 text-xs text-slate-500">(득 {stats.goalsFor} / 실 {stats.goalsAgainst})</span>
            </span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
            <span className="text-sm">목록을 불러오는 중…</span>
          </div>
        ) : sortedByDate.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            저장된 경기 분석이 없습니다. 전술 데이터에서 경기를 저장하면 여기에 표시됩니다.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-2">
              <span className="text-xs text-slate-500">
                아래 체크한 경기만 통계에 반영됩니다.
              </span>
              <button
                type="button"
                onClick={selectAllForStats}
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                전체 선택
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="w-10 px-4 py-2.5 text-left">
                    <span className="sr-only">통계 포함</span>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">날짜</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">경기명 / 상대</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">결과</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">팀</th>
                  <th className="w-20 px-4 py-2.5 text-right font-medium text-slate-400">상세</th>
                </tr>
              </thead>
              <tbody>
                {sortedByDate.map((a) => {
                  const dateStr = a.matchDate
                    ? formatDate(a.matchDate)
                    : a.schedule?.date
                      ? formatDate(
                          typeof a.schedule.date === "string"
                            ? a.schedule.date
                            : new Date(String(a.schedule.date)).toISOString(),
                        )
                      : "—";
                  const name = a.matchName ?? a.opponent ?? "—";
                  const isChecked = selectedIdsForStats.has(a.id);
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-slate-800 transition hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <label className="flex cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectForStats(a.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                          />
                        </label>
                      </td>
                      <td
                        className="cursor-pointer px-4 py-2.5 text-slate-300"
                        onClick={() => router.push(`/coach/analysis/archive/${a.id}`)}
                        role="gridcell"
                      >
                        {dateStr}
                      </td>
                      <td
                        className="cursor-pointer px-4 py-2.5 font-medium text-slate-200"
                        onClick={() => router.push(`/coach/analysis/archive/${a.id}`)}
                        role="gridcell"
                      >
                        {name}
                      </td>
                      <td
                        className="cursor-pointer px-4 py-2.5 text-slate-300"
                        onClick={() => router.push(`/coach/analysis/archive/${a.id}`)}
                        role="gridcell"
                      >
                        {a.result ?? "—"}
                      </td>
                      <td
                        className="cursor-pointer px-4 py-2.5 text-slate-400"
                        onClick={() => router.push(`/coach/analysis/archive/${a.id}`)}
                        role="gridcell"
                      >
                        {a.team?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/coach/analysis/archive/${a.id}`}
                          className="rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
