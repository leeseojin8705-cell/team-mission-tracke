"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
} from "@/components/FootballTacticsAnalyzer";
import type { MatchAnalysis, Player } from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type PlayerSession = {
  session?: {
    role: "player" | "coach" | "owner";
    playerId?: string;
  };
};

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

function PlayerAnalysisInner() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const playerIdFromUrl = searchParams.get("playerId");

  const [analyses, setAnalyses] = useState<AnalysisWithMeta[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [initialEvents, setInitialEvents] = useState<AnalysisEventsData | null>(null);
  const [playerEvents, setPlayerEvents] = useState<AnalysisEventsData>({
    atk: [],
    def: [],
    pass: [],
    gk: [],
  });
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [goals, setGoals] = useState(0);
  const [assists, setAssists] = useState(0);
  const [starterType, setStarterType] = useState<"starter" | "sub">("starter");
  const [injured, setInjured] = useState(false);
  const [matchResult, setMatchResult] = useState<"win" | "draw" | "loss">("win");
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordMessage, setRecordMessage] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  const myTeamId = player?.teamId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const fetchOpts = { credentials: "same-origin" as const };
        const sessionRes = await fetch("/api/auth/session", fetchOpts);
        const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
        const sessionRole = sessionData.session?.role;
        if (sessionRole === "coach" || sessionRole === "owner") {
          throw new Error(
            "코치·구단 계정으로는 선수용 「개인 전술 데이터」를 열 수 없습니다. 선수 로그인 또는 선수 전용 링크(?playerId=)를 이용해 주세요.",
          );
        }
        const sid: string | null =
          sessionData.session?.role === "player"
            ? (sessionData.session.playerId ?? null)
            : null;
        setSessionPlayerId(sid);

        let pid = sid;
        if (!pid) {
          const fromUrl = playerIdFromUrl?.trim();
          if (fromUrl) pid = fromUrl;
        }
        if (!pid) {
          try {
            const stored = window.localStorage.getItem("tmt:lastPlayerId");
            if (stored) pid = stored;
          } catch {
            /* ignore */
          }
        }
        if (!pid) {
          throw new Error(
            "선수 정보를 찾을 수 없습니다. 로그인하거나 링크(?playerId=)로 접속해 주세요.",
          );
        }

        const playerRes = await fetch(
          `/api/players/${encodeURIComponent(pid)}`,
          fetchOpts,
        );
        if (!playerRes.ok) {
          if (playerRes.status === 404) {
            throw new Error(
              "선수를 찾을 수 없습니다. 링크·코드가 맞는지 확인해 주세요.",
            );
          }
          throw new Error("선수 정보를 불러오지 못했습니다.");
        }
        const playerData = (await playerRes.json()) as Player;
        if (!playerData.teamId) {
          throw new Error("팀에 소속된 선수만 전술 데이터를 이용할 수 있습니다.");
        }
        try {
          window.localStorage.setItem("tmt:lastPlayerId", playerData.id);
        } catch {
          /* ignore */
        }

        const q = new URLSearchParams({
          teamId: playerData.teamId,
          playerId: playerData.id,
        });
        const analysesRes = await fetch(`/api/analyses?${q.toString()}`, fetchOpts);
        if (!analysesRes.ok) throw new Error("경기 분석 목록을 불러오지 못했습니다.");
        const analysesData = (await analysesRes.json()) as AnalysisWithMeta[];
        if (cancelled) return;
        setPlayer(playerData);
        setAnalyses(Array.isArray(analysesData) ? analysesData : []);
        setCurrentPlayerId(playerData.id);
        setAffiliationName(null);
        const tr = await fetch(
          `/api/teams/${encodeURIComponent(playerData.teamId)}`,
          fetchOpts,
        );
        if (tr.ok) {
          const tm = (await tr.json()) as { name?: string };
          if (!cancelled && tm?.name) setAffiliationName(tm.name);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [playerIdFromUrl]);

  /** API가 본인 팀만 주더라도, 다른 팀 행이 섞이면 표시하지 않음 (폴백으로 전체 목록 사용 금지) */
  const myAnalyses = useMemo(() => {
    if (analyses.length === 0 || myTeamId == null) return [];
    const scoped = analyses.filter(
      (a) =>
        a.teamId === myTeamId ||
        (a.team?.id != null && a.team.id === myTeamId),
    );
    return [...scoped].sort((a, b) => getSortDate(b) - getSortDate(a));
  }, [analyses, myTeamId]);

  // 과제 상세에서 taskId 로 진입했을 때, 과제 날짜와 같은 경기 자동 선택
  useEffect(() => {
    if (!taskId || !player || !myTeamId) return;
    if (selectedAnalysisId || myAnalyses.length === 0) return;
    let cancelled = false;

    async function selectByTask() {
      try {
        const tid = taskId;
        const p = player;
        if (!tid || !p) return;
        const pid = p.id;
        if (!sessionPlayerId || sessionPlayerId !== pid) return;
        const res = await fetch(
          `/api/tasks/${encodeURIComponent(tid)}`,
          { credentials: "same-origin" },
        );
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

        const found = myAnalyses.find((a) => {
          const raw =
            a.matchDate ??
            (typeof a.schedule?.date === "string"
              ? a.schedule.date
              : null);
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
          setSelectedAnalysisId(found.id);
        }
      } catch {
        // 실패해도 조용히 무시
      }
    }

    selectByTask();
    return () => {
      cancelled = true;
    };
  }, [taskId, player, myTeamId, myAnalyses, selectedAnalysisId, sessionPlayerId]);

  const selectedAnalysis = useMemo(
    () => myAnalyses.find((a) => a.id === selectedAnalysisId),
    [myAnalyses, selectedAnalysisId],
  );

  useEffect(() => {
    if (!selectedAnalysisId || !currentPlayerId || !selectedAnalysis) return;
    const pe = selectedAnalysis.playerEvents as Record<string, AnalysisEventsData> | null | undefined;
    const existing = pe?.[currentPlayerId];
    const next: AnalysisEventsData =
      existing && typeof existing === "object"
        ? {
            atk: existing.atk ?? [],
            def: existing.def ?? [],
            pass: existing.pass ?? [],
            gk: existing.gk ?? [],
          }
        : { atk: [], def: [], pass: [], gk: [] };
    setInitialEvents(next);
    setPlayerEvents(next);
  }, [selectedAnalysisId, currentPlayerId, selectedAnalysis]);

  const handleAnalysisSelect = useCallback((id: string) => {
    setSelectedAnalysisId(id);
    setSendMessage(null);
  }, []);

  const handleSendToCoach = useCallback(async () => {
    if (!selectedAnalysisId || !currentPlayerId) return;
    setSending(true);
    setSendMessage(null);
    try {
      const res = await fetch(`/api/analyses/${selectedAnalysisId}/player-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
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

  const handleEnterPracticeMode = useCallback(() => {
    setSelectedAnalysisId(null);
    setInitialEvents(null);
    setPlayerEvents({
      atk: [],
      def: [],
      pass: [],
      gk: [],
    });
    setSendMessage(null);
    setRecordMessage(null);
  }, []);

  const handleSavePersonalRecord = useCallback(async () => {
    if (!currentPlayerId) {
      setRecordMessage({
        type: "err",
        text: "선수 정보를 불러오지 못했습니다. 다시 로그인해 주세요.",
      });
      return;
    }
    setSavingRecord(true);
    setRecordMessage(null);
    try {
      const res = await fetch("/api/player-match-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          matchAnalysisId: selectedAnalysisId ?? null,
          playerId: currentPlayerId,
          goals,
          assists,
          starterType,
          injured,
          matchResult,
          events: playerEvents,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        const detail = data.detail ? ` (${String(data.detail)})` : "";
        setRecordMessage({
          type: "err",
          text: (data.error || "개인 기록 저장에 실패했습니다.") + detail,
        });
        return;
      }
      setRecordMessage({
        type: "ok",
        text: "개인 기록이 저장되었습니다. (코치 기록과는 아직 합쳐지지 않습니다.)",
      });
    } catch {
      setRecordMessage({
        type: "err",
        text: "개인 기록 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setSavingRecord(false);
    }
  }, [
    assists,
    currentPlayerId,
    goals,
    injured,
    matchResult,
    playerEvents,
    selectedAnalysisId,
    starterType,
  ]);

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
        {affiliationName && (
          <p className="text-sm text-emerald-200/90">
            소속:{" "}
            <span className="font-semibold text-emerald-100">{affiliationName}</span>
          </p>
        )}
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
        ) : !player ? (
          <p className="text-sm text-slate-400">선수 로그인 정보가 없습니다. 다시 로그인해 주세요.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <aside className="w-full shrink-0 sm:max-w-[260px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  선수
                </p>
                <p className="mb-1 text-sm font-medium text-slate-100">
                  {player.name}
                </p>
                {affiliationName && (
                  <p className="mb-3 text-xs text-emerald-200/85">
                    소속: {affiliationName}
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    경기 선택
                  </p>
                  <button
                    type="button"
                    onClick={handleEnterPracticeMode}
                    className="rounded-full border border-slate-600 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  >
                    연습 모드
                  </button>
                </div>
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
                  <div className="mb-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-200">
                        {selectedAnalysis.matchName ?? selectedAnalysis.opponent ?? "—"}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSendToCoach}
                          disabled={sending || !sessionPlayerId}
                          title={
                            !sessionPlayerId
                              ? "선수 로그인 후에만 코치 쪽으로 전송할 수 있습니다."
                              : undefined
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {sending ? "전송 중…" : "코치에게 보내기"}
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePersonalRecord}
                          disabled={savingRecord}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                        >
                          {savingRecord ? "저장 중…" : "개인 기록 저장"}
                        </button>
                      </div>
                    </div>
                    {!sessionPlayerId && (
                      <p className="rounded-lg bg-amber-950/40 px-3 py-2 text-xs text-amber-100/90">
                        링크만으로 연 경우 「코치에게 보내기」는 선수 로그인 후에 사용할 수 있습니다. 개인 기록 저장은 그대로 가능합니다.
                      </p>
                    )}

                    <div className="mb-1 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800/50 px-3 py-2 text-xs sm:text-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span>득점</span>
                          <input
                            type="number"
                            min={0}
                            value={goals}
                            onChange={(e) => setGoals(Number(e.target.value) || 0)}
                            className="w-12 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-xs sm:text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>도움</span>
                          <input
                            type="number"
                            min={0}
                            value={assists}
                            onChange={(e) => setAssists(Number(e.target.value) || 0)}
                            className="w-12 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-xs sm:text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>출전</span>
                          <select
                            value={starterType}
                            onChange={(e) =>
                              setStarterType(e.target.value === "starter" ? "starter" : "sub")
                            }
                            className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs sm:text-sm"
                          >
                            <option value="starter">선발</option>
                            <option value="sub">교체</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1 text-xs sm:text-sm">
                          <input
                            type="checkbox"
                            checked={injured}
                            onChange={(e) => setInjured(e.target.checked)}
                            className="h-3 w-3 sm:h-4 sm:w-4 rounded border-slate-600 bg-slate-900"
                          />
                          <span>부상 여부</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span>경기 결과</span>
                          <select
                            value={matchResult}
                            onChange={(e) =>
                              setMatchResult(
                                e.target.value === "win"
                                  ? "win"
                                  : e.target.value === "draw"
                                    ? "draw"
                                    : "loss",
                              )
                            }
                            className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs sm:text-sm"
                          >
                            <option value="win">승</option>
                            <option value="draw">무</option>
                            <option value="loss">패</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {sendMessage && (
                      <p
                        className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${
                          sendMessage.type === "ok"
                            ? "bg-emerald-950/50 text-emerald-200"
                            : "bg-rose-950/50 text-rose-200"
                        }`}
                      >
                        {sendMessage.text}
                      </p>
                    )}
                    {recordMessage && (
                      <p
                        className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${
                          recordMessage.type === "ok"
                            ? "bg-sky-950/50 text-sky-200"
                            : "bg-rose-950/50 text-rose-200"
                        }`}
                      >
                        {recordMessage.text}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 w-full max-w-4xl">
                    <FootballTacticsAnalyzer
                      initialData={initialEvents ?? playerEvents}
                      onChange={setPlayerEvents}
                      showHalfToggle={true}
                      readOnly={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5 space-y-3">
                  <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-200">
                    연습 모드 — 아직 코치가 등록한 경기가 없습니다. 아래 경기장을 자유롭게 클릭해
                    개인 전술 포인트를 연습해 보세요. 이 모드에서도 「개인 기록 저장」을 누르면 내
                    개인 기록관에만 저장됩니다. 코치에게는 자동으로 보내지지 않습니다.
                  </div>

                  <div className="space-y-2 rounded-lg bg-slate-800/50 px-3 py-2 text-xs sm:text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span>득점</span>
                          <input
                            type="number"
                            min={0}
                            value={goals}
                            onChange={(e) => setGoals(Number(e.target.value) || 0)}
                            className="w-12 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-xs sm:text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>도움</span>
                          <input
                            type="number"
                            min={0}
                            value={assists}
                            onChange={(e) => setAssists(Number(e.target.value) || 0)}
                            className="w-12 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-xs sm:text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span>출전</span>
                          <select
                            value={starterType}
                            onChange={(e) =>
                              setStarterType(e.target.value === "starter" ? "starter" : "sub")
                            }
                            className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs sm:text-sm"
                          >
                            <option value="starter">선발</option>
                            <option value="sub">교체</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1 text-xs sm:text-sm">
                          <input
                            type="checkbox"
                            checked={injured}
                            onChange={(e) => setInjured(e.target.checked)}
                            className="h-3 w-3 sm:h-4 sm:w-4 rounded border-slate-600 bg-slate-900"
                          />
                          <span>부상 여부</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span>경기 결과</span>
                          <select
                            value={matchResult}
                            onChange={(e) =>
                              setMatchResult(
                                e.target.value === "win"
                                  ? "win"
                                  : e.target.value === "draw"
                                    ? "draw"
                                    : "loss",
                              )
                            }
                            className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs sm:text-sm"
                          >
                            <option value="win">승</option>
                            <option value="draw">무</option>
                            <option value="loss">패</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSavePersonalRecord}
                        disabled={savingRecord}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                      >
                        {savingRecord ? "저장 중…" : "개인 기록 저장"}
                      </button>
                    </div>
                    {recordMessage && (
                      <p
                        className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${
                          recordMessage.type === "ok"
                            ? "bg-sky-950/50 text-sky-200"
                            : "bg-rose-950/50 text-rose-200"
                        }`}
                      >
                        {recordMessage.text}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 w-full max-w-4xl">
                    <FootballTacticsAnalyzer
                      initialData={initialEvents ?? playerEvents}
                      onChange={setPlayerEvents}
                      showHalfToggle={true}
                      readOnly={false}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PlayerAnalysisPage() {
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
      <PlayerAnalysisInner />
    </Suspense>
  );
}
