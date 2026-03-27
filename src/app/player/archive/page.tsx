// @ts-nocheck
"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
} from "@/components/FootballTacticsAnalyzer";
import type { MatchAnalysis } from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type AnalysisWithMeta = MatchAnalysis & {
  schedule?: { id: string; title: string; date: string } | null;
  team?: { id: string; name: string } | null;
};

type PersonalRecord = {
  id: string;
  playerId: string;
  matchAnalysisId: string | null;
  goals: number;
  assists: number;
  starterType: string | null;
  injured: boolean;
  matchResult: string | null;
  events: AnalysisEventsData | null;
  createdAt: string;
  match: {
    id: string;
    name: string | null;
    date: string | null;
    result: string | null;
  } | null;
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

function PlayerArchiveInner() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [players, setPlayers] = useState<{ id: string; name: string; teamId: string }[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const me = useMemo(
    () => players.find((p) => p.id === currentPlayerId),
    [players, currentPlayerId],
  );
  const myTeamId = me?.teamId;
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  useEffect(() => {
    if (!myTeamId) {
      setAffiliationName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/teams/${encodeURIComponent(myTeamId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: { name?: string } | null) => {
        if (!cancelled && t?.name) setAffiliationName(t.name);
      })
      .catch(() => {
        if (!cancelled) setAffiliationName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  useEffect(() => {
    if (!myTeamId) {
      setAnalyses([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/analyses?teamId=${encodeURIComponent(myTeamId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AnalysisWithMeta[]) => {
        if (!cancelled && Array.isArray(data)) setAnalyses(data);
      })
      .catch(() => {
        if (!cancelled) setAnalyses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const playersRes = await fetch("/api/players");
        if (!playersRes.ok) throw new Error("데이터를 불러오지 못했습니다.");
        const playersData: { id: string; name: string; teamId: string }[] =
          await playersRes.json();
        if (cancelled) return;
        setPlayers(playersData);
        if (!currentPlayerId && playersData[0]) {
          const saved =
            typeof window !== "undefined"
              ? window.localStorage.getItem("tmt:lastPlayerId")
              : null;
          const id =
            saved && playersData.some((p) => p.id === saved) ? saved : playersData[0].id;
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

  useEffect(() => {
    if (!currentPlayerId) return;
    let cancelled = false;
    async function loadRecords() {
      try {
        const res = await fetch(
          `/api/player-match-records?playerId=${encodeURIComponent(currentPlayerId)}`,
        );
        if (!res.ok) return;
        const data: PersonalRecord[] = await res.json();
        if (cancelled) return;
        setRecords(data);
      } catch {
        if (!cancelled) setRecords([]);
      }
    }
    loadRecords();
    return () => {
      cancelled = true;
    };
  }, [currentPlayerId]);

  // 과제 상세에서 taskId 로 진입했을 때, 과제 날짜와 같은 개인 기록 자동 선택
  useEffect(() => {
    if (!taskId || records.length === 0) return;
    if (selectedRecordId) return;
    let cancelled = false;

    async function selectRecordByTask() {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
        if (!res.ok) return;
        const task = (await res.json()) as {
          details?: {
            singleDate?: string | null;
            dailyStart?: string | null;
          } | null;
          dueDate?: string | null;
        };
        const dateStr =
          task.details?.singleDate ??
          task.details?.dailyStart ??
          task.dueDate ??
          null;
        if (!dateStr) return;
        const target = new Date(dateStr);
        if (Number.isNaN(target.getTime())) return;
        const ty = target.getFullYear();
        const tm = target.getMonth();
        const td = target.getDate();

        const found = records.find((r) => {
          const raw = r.match?.date;
          if (!raw) return false;
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return false;
          return (
            d.getFullYear() === ty &&
            d.getMonth() === tm &&
            d.getDate() === td
          );
        });
        if (!cancelled && found) {
          setSelectedRecordId(found.id);
          setSelectedAnalysisId(found.matchAnalysisId);
        }
      } catch {
        // 실패해도 조용히 무시
      }
    }

    selectRecordByTask();
    return () => {
      cancelled = true;
    };
  }, [taskId, records, selectedRecordId]);

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

  const summary = useMemo(() => {
    if (records.length === 0) {
      return {
        total: 0,
        goals: 0,
        assists: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      };
    }
    let goals = 0;
    let assists = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    for (const r of records) {
      goals += r.goals ?? 0;
      assists += r.assists ?? 0;
      if (r.matchResult === "win") wins += 1;
      else if (r.matchResult === "draw") draws += 1;
      else if (r.matchResult === "loss") losses += 1;
    }
    return {
      total: records.length,
      goals,
      assists,
      wins,
      draws,
      losses,
    };
  }, [records]);

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
        {affiliationName && (
          <p className="text-sm text-emerald-200/90">
            소속:{" "}
            <span className="font-semibold text-emerald-100">{affiliationName}</span>
          </p>
        )}
        <p className="text-sm text-slate-400">
          개인 전술 데이터에서 저장한 내 개인 기록들을 모아서 볼 수 있습니다. 코치 기록관과는
          별도로, 나만의 개인 기록관입니다.
        </p>

        {me && (
          <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-200 md:grid-cols-4">
            <div className="rounded-xl bg-slate-900/80 p-3">
              <p className="text-[11px] text-slate-400">총 기록 수</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-400">
                {summary.total}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                저장된 경기/연습 개인 기록 개수
              </p>
            </div>
            <div className="rounded-xl bg-slate-900/80 p-3">
              <p className="text-[11px] text-slate-400">공격 포인트</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">
                골 {summary.goals} / 도움 {summary.assists}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                  style={{
                    width:
                      summary.total > 0
                        ? `${Math.min(100, ((summary.goals + summary.assists) / summary.total) * 25)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl bg-slate-900/80 p-3">
              <p className="text-[11px] text-slate-400">결과 요약</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">
                {summary.wins}승 {summary.draws}무 {summary.losses}패
              </p>
              <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                {summary.total > 0 && (
                  <>
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${(summary.wins / summary.total) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-slate-400"
                      style={{
                        width: `${(summary.draws / summary.total) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-rose-500"
                      style={{
                        width: `${(summary.losses / summary.total) * 100}%`,
                      }}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-slate-900/80 p-3">
              <p className="text-[11px] text-slate-400">선수</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{me.name}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                개인 기록 기준 요약입니다.
              </p>
            </div>
          </div>
        )}

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
                  개인 기록 목록
                </p>
                {records.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    아직 저장된 개인 기록이 없습니다. 개인 전술 데이터에서 「개인 기록 저장」을 눌러
                    기록을 남겨 보세요.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-0.5">
                    {records.map((r) => {
                      const name = r.match?.name ?? "연습 기록";
                      const dateStr = r.match?.date ? formatDate(r.match.date) : "—";
                      const isSelected = selectedRecordId === r.id;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecordId(r.id);
                              setSelectedAnalysisId(r.matchAnalysisId);
                            }}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              isSelected
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                                : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                            }`}
                          >
                            <span className="block font-medium">{name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{dateStr}</span>
                            <span className="mt-1 inline-flex items-center gap-2 text-[11px] text-slate-400">
                              <span>득점 {r.goals}</span>
                              <span>도움 {r.assists}</span>
                              {r.matchResult && <span>결과 {r.matchResult}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              {selectedRecordId ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-200">
                      {records.find((r) => r.id === selectedRecordId)?.match?.name ??
                        "연습 기록"}
                    </span>
                    <span className="text-xs text-slate-500">내 개인 기록 (읽기 전용)</span>
                  </div>
                  <div className="min-w-0 w-full max-w-4xl">
                    <FootballTacticsAnalyzer
                      initialData={
                        records.find((r) => r.id === selectedRecordId)?.events ?? {
                          atk: [],
                          def: [],
                          pass: [],
                          gk: [],
                        }
                      }
                      onChange={() => {}}
                      showHalfToggle={true}
                      readOnly={true}
                    />
                  </div>
                </div>
              ) : selectedAnalysis && mySubmittedData ? (
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

export default function PlayerArchivePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm text-slate-400">불러오는 중…</p>
          </div>
        </main>
      }
    >
      <PlayerArchiveInner />
    </Suspense>
  );
}
