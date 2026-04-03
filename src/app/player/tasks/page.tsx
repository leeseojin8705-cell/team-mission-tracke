"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { TaskCoachBlueprintView } from "@/components/TaskCoachBlueprintView";
import type { Task, TaskDetails } from "@/lib/types";

type PlayerSession = {
  session?: {
    role: "player" | "coach" | "owner";
    playerId?: string;
  };
};

type TaskWithDetails = Task & {
  teamName?: string | null;
};

function parseTaskDetails(raw: Task["details"]): TaskDetails | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as TaskDetails;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TaskDetails;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeTask(t: Task): TaskWithDetails {
  return {
    ...t,
    details: parseTaskDetails(t.details),
  };
}

type EvalBadgeStatus = {
  pre: boolean;
  post: boolean;
  coach: boolean;
};

function isNowWithinTaskWindow(task: Task): boolean {
  const d = task.details;
  if (d?.playerLocked) return true;
  if (!d) return true;

  const now = new Date();

  // 날짜 범위
  if (d.htmlTaskType === "single") {
    if (!d.singleDate) return true;
    const day = new Date(d.singleDate);
    if (Number.isNaN(day.getTime())) return true;
    if (
      now.getFullYear() !== day.getFullYear() ||
      now.getMonth() !== day.getMonth() ||
      now.getDate() !== day.getDate()
    ) {
      return false;
    }
  } else {
    const start = d.dailyStart ? new Date(d.dailyStart) : null;
    const end = d.dailyEnd ? new Date(d.dailyEnd) : null;
    if (start && now < start) return false;
    if (end) {
      const endDay = new Date(end);
      endDay.setHours(23, 59, 59, 999);
      if (now > endDay) return false;
    }
    if (Array.isArray(d.weekdays) && d.weekdays.length > 0) {
      const dow = String(now.getDay());
      if (!d.weekdays.includes(dow)) return false;
    }
  }

  // 시간대
  if (d.timeStart || d.timeEnd) {
    const [h, m] = (d.timeStart ?? "00:00").split(":").map(Number);
    const [eh, em] = (d.timeEnd ?? "23:59").split(":").map(Number);
    const minutes = now.getHours() * 60 + now.getMinutes();
    const from = (h || 0) * 60 + (m || 0);
    const to = (eh || 23) * 60 + (em || 59);
    if (minutes < from || minutes > to) return false;
  }

  return true;
}

function isTodayForTask(task: Task): boolean {
  const d = task.details;
  if (d?.playerLocked) return false;
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = today.getDate();

  const sameDate = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const dt = new Date(dateStr);
    if (Number.isNaN(dt.getTime())) return false;
    return (
      dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === day
    );
  };

  if (d?.htmlTaskType === "single") {
    return sameDate(d.singleDate);
  }
  if (d?.dailyStart || d?.dailyEnd) {
    const start = d.dailyStart ? new Date(d.dailyStart) : null;
    const end = d.dailyEnd ? new Date(d.dailyEnd) : null;
    const t = new Date(today);
    t.setHours(0, 0, 0, 0);
    if (start && t < new Date(start)) return false;
    if (end) {
      const e = new Date(end);
      e.setHours(23, 59, 59, 999);
      if (t > e) return false;
    }
    return true;
  }
  if (task.dueDate) return sameDate(task.dueDate);
  return true;
}

function PlayerTasksInner() {
  const searchParams = useSearchParams();
  const playerIdFromUrl = searchParams.get("playerId");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [summaryFilter, setSummaryFilter] = useState<
    "all" | "team" | "personal" | "completed" | "incomplete"
  >("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [evalStatusMap, setEvalStatusMap] = useState<
    Record<string, EvalBadgeStatus>
  >({});
  const [periodPreset, setPeriodPreset] = useState<"all" | "30d" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"dueDate" | "title">("dueDate");
  const [affiliationName, setAffiliationName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const sessionRes = await fetch("/api/auth/session", {
          credentials: "same-origin",
        });
        const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
        const sessionRole = sessionData.session?.role;
        if (sessionRole === "coach" || sessionRole === "owner") {
          throw new Error(
            "코치·구단 계정으로는 선수용 「내 과제」를 열 수 없습니다. 선수 로그인을 하거나, 코치가 준 선수 전용 링크(?playerId=)로만 접속해 주세요.",
          );
        }
        const sessionPlayerId =
          sessionData.session?.role === "player"
            ? sessionData.session.playerId ?? null
            : null;

        let pid = sessionPlayerId;
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
            "선수 정보를 찾을 수 없습니다. 로그인하거나, 홈에서 코치가 준 링크(?playerId=)로 접속해 주세요.",
          );
        }
        if (cancelled) return;
        setPlayerId(pid);
        setAffiliationName(null);

        const playerRes = await fetch(
          `/api/players/${encodeURIComponent(pid)}`,
          { credentials: "same-origin" },
        );
        if (!playerRes.ok) {
          if (playerRes.status === 404) {
            throw new Error(
              "선수를 찾을 수 없습니다. 링크·코드가 맞는지 확인해 주세요.",
            );
          }
          throw new Error("선수 정보를 확인하지 못했습니다.");
        }
        const playerJson = (await playerRes.json()) as { teamId?: string | null };
        const teamId = playerJson?.teamId;

        const tasksUrl =
          sessionPlayerId && sessionPlayerId === pid
            ? "/api/tasks"
            : `/api/tasks?playerId=${encodeURIComponent(pid)}`;
        const tasksRes = await fetch(tasksUrl, { credentials: "same-origin" });
        if (!tasksRes.ok) {
          const errBody = (await tasksRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errBody.error ?? "과제 목록을 불러오지 못했습니다.");
        }
        const tasksData = (await tasksRes.json()) as Task[];
        if (cancelled) return;
        setTasks(tasksData.map(normalizeTask));

        const progressRes = await fetch(
          `/api/task-progress?playerId=${encodeURIComponent(pid)}`,
          { credentials: "same-origin" },
        );
        if (progressRes.ok) {
          const progressData = (await progressRes.json()) as {
            taskId: string;
            completed: boolean;
          }[];
          const map: Record<string, boolean> = {};
          for (const p of progressData) {
            map[p.taskId] = p.completed;
          }
          setCompletedMap(map);
        }

        try {
          if (teamId) {
            const teamMetaRes = await fetch(
              `/api/teams/${encodeURIComponent(teamId)}`,
              { credentials: "same-origin" },
            );
            if (teamMetaRes.ok) {
              const tm = (await teamMetaRes.json()) as { name?: string };
              if (!cancelled && tm?.name) setAffiliationName(tm.name);
            }
            const evalRes = await fetch(
              `/api/teams/${encodeURIComponent(teamId)}/player-evaluations?forPlayerId=${encodeURIComponent(pid)}`,
              { credentials: "same-origin" },
            );
            if (evalRes.ok) {
              const evalList = (await evalRes.json()) as {
                subjectPlayerId?: string;
                phase?: string | null;
                taskId?: string | null;
              }[];
              const evalMap: Record<string, EvalBadgeStatus> = {};
              for (const ev of evalList) {
                if (!ev.taskId) continue;
                if (ev.subjectPlayerId !== pid) continue;
                const key = ev.taskId;
                const current: EvalBadgeStatus =
                  evalMap[key] ?? { pre: false, post: false, coach: false };
                if (ev.phase === "PLAYER_PRE") current.pre = true;
                else if (ev.phase === "PLAYER_POST") current.post = true;
                else if (ev.phase === "COACH_POST") current.coach = true;
                evalMap[key] = current;
              }
              setEvalStatusMap(evalMap);
            }
          } else {
            setEvalStatusMap({});
          }
        } catch {
          // 평가 배지는 선택 기능
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [playerIdFromUrl]);

  const visibleTasks = useMemo(() => {
    if (!playerId) return [];

    // 기간 필터용 from/to 계산 (마감일 또는 singleDate/dailyEnd 기준)
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (periodPreset === "30d") {
      to = now;
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (periodPreset === "custom") {
      if (dateFrom) {
        const f = new Date(dateFrom);
        if (!Number.isNaN(f.getTime())) {
          f.setHours(0, 0, 0, 0);
          from = f;
        }
      }
      if (dateTo) {
        const t = new Date(dateTo);
        if (!Number.isNaN(t.getTime())) {
          t.setHours(23, 59, 59, 999);
          to = t;
        }
      }
    }

    const base = tasks
      .filter((t) => {
        // 개인 과제: 나에게 직접 지정된 것
        if (t.playerId && t.playerId !== playerId) return false;

        // 기간/요일/시간 안에 있는 과제만
        if (!isNowWithinTaskWindow(t)) return false;
        if (todayOnly && !isTodayForTask(t)) return false;

        // 기간 필터: 마감일/단일일자/종료일 중 하나를 기준으로 from/to 안에 있는지만 확인
        if (from || to) {
          const d = t.details;
          const dateCandidate =
            (d?.htmlTaskType === "single" && d.singleDate) ||
            d?.dailyEnd ||
            t.dueDate ||
            null;
          if (dateCandidate) {
            const dd = new Date(dateCandidate);
            if (!Number.isNaN(dd.getTime())) {
              dd.setHours(12, 0, 0, 0);
              if (from && dd < from) return false;
              if (to && dd > to) return false;
            }
          }
        }

        return true;
      })
      .map((t) => ({ task: t, isToday: isTodayForTask(t) }));

    // 오늘 해당 과제 우선 정렬, 그 안에서 마감일/제목 순
    return base
      .sort((a, b) => {
        if (a.isToday !== b.isToday) {
          return a.isToday ? -1 : 1;
        }
        if (sortOrder === "dueDate") {
          const ad = a.task.dueDate ? new Date(a.task.dueDate).getTime() : Infinity;
          const bd = b.task.dueDate ? new Date(b.task.dueDate).getTime() : Infinity;
          if (ad !== bd) return ad - bd;
        }
        return (a.task.title ?? "").localeCompare(b.task.title ?? "", "ko");
      })
      .map((x) => x.task);
  }, [playerId, tasks, todayOnly, periodPreset, dateFrom, dateTo, sortOrder]);

  const summary = useMemo(() => {
    const total = visibleTasks.length;
    const completed = visibleTasks.filter((t) => completedMap[t.id]).length;
    const progressRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const teamCount = visibleTasks.filter((t) => t.teamId).length;
    const personalCount = visibleTasks.filter((t) => t.playerId === playerId).length;
    return { total, completed, progressRate, teamCount, personalCount };
  }, [completedMap, playerId, visibleTasks]);

  const filteredBySummary = useMemo(() => {
    if (summaryFilter === "all") return visibleTasks;
    if (summaryFilter === "team") return visibleTasks.filter((t) => t.teamId);
    if (summaryFilter === "personal") return visibleTasks.filter((t) => t.playerId === playerId);
    if (summaryFilter === "completed")
      return visibleTasks.filter((t) => completedMap[t.id]);
    return visibleTasks.filter((t) => !completedMap[t.id]); // incomplete
  }, [completedMap, playerId, summaryFilter, visibleTasks]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/player"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 대시보드
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-lime-400/25 bg-slate-900/40">
          <div className="bg-gradient-to-r from-lime-400/90 to-emerald-500/90 px-4 py-2 text-center">
            <p className="text-[10px] font-bold tracking-[0.2em] text-slate-900">TEAM MISSION TRACKER</p>
            <h1 className="text-lg font-extrabold text-slate-950">내 과제</h1>
            {affiliationName && (
              <p className="px-2 pb-1 text-xs font-medium text-slate-800">
                소속: <span className="font-bold text-slate-950">{affiliationName}</span>
              </p>
            )}
          </div>
          <p className="px-4 py-3 text-sm text-slate-400">
            코치가 등록한 과제와 내가 만든 개인 과제 중, 지금 기간·요일·시간대에 해당하는 과제를 볼 수 있습니다. 코치가
            입력한 전술·포메이션·과제 줄은 카드에서 함께 확인할 수 있습니다.
          </p>
        </div>

        {playerId && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={todayOnly}
                  onChange={(e) => setTodayOnly(e.target.checked)}
                  className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                />
                오늘 해야 하는 과제만
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">기간</span>
                <select
                  value={periodPreset}
                  onChange={(e) =>
                    setPeriodPreset(e.target.value as "all" | "30d" | "custom")
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                >
                  <option value="all">전체</option>
                  <option value="30d">최근 30일</option>
                  <option value="custom">직접 선택</option>
                </select>
                {periodPreset === "custom" && (
                  <>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                    />
                    <span className="text-[11px] text-slate-500">~</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400">정렬</span>
                <select
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(e.target.value as "dueDate" | "title")
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                >
                  <option value="dueDate">마감일 순</option>
                  <option value="title">제목 순</option>
                </select>
              </div>
            </div>
            <Link
              href="/player/tasks/new"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              개인 과제 만들기
            </Link>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : !playerId ? (
          <p className="text-sm text-slate-400">선수 로그인 정보가 없습니다. 다시 로그인해 주세요.</p>
        ) : visibleTasks.length === 0 ? (
          <p className="text-sm text-slate-400">
            지금 진행 중인 과제가 없습니다. 코치가 과제를 등록하면 이곳에 표시됩니다.
          </p>
        ) : (
          <>
            <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-200 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setSummaryFilter("all")}
                className={`rounded-xl bg-slate-900/80 p-3 text-left transition ${
                  summaryFilter === "all" ? "border border-emerald-500/60" : "border border-transparent"
                }`}
              >
                <p className="text-[11px] text-slate-400">전체 과제</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-400">
                  {summary.total}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  팀 과제 {summary.teamCount}개 / 개인 과제 {summary.personalCount}개
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSummaryFilter("completed")}
                className={`rounded-xl bg-slate-900/80 p-3 text-left transition ${
                  summaryFilter === "completed"
                    ? "border border-emerald-500/60"
                    : "border border-transparent"
                }`}
              >
                <p className="text-[11px] text-slate-400">완료한 과제</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">
                  {summary.completed}/{summary.total}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSummaryFilter("incomplete")}
                className={`rounded-xl bg-slate-900/80 p-3 text-left transition ${
                  summaryFilter === "incomplete"
                    ? "border border-emerald-500/60"
                    : "border border-transparent"
                }`}
              >
                <p className="text-[11px] text-slate-400">진행률</p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="text-xl font-semibold text-emerald-400">
                    {summary.progressRate}%
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${summary.progressRate}%` }}
                  />
                </div>
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredBySummary.map((task) => {
                const d = task.details;
                const locked = !!d?.playerLocked;
                const labelDate =
                  d?.htmlTaskType === "single"
                    ? d.singleDate
                    : d?.dailyStart && d?.dailyEnd
                      ? `${d.dailyStart} ~ ${d.dailyEnd}`
                      : task.dueDate ?? "";
                const labelTime =
                  d?.timeStart || d?.timeEnd
                    ? `${d.timeStart ?? "00:00"} ~ ${d.timeEnd ?? "23:59"}`
                    : null;

                const completed = completedMap[task.id] ?? false;
                const isToday = isTodayForTask(task);
                const contentLabel =
                  Array.isArray(d?.contents) && d!.contents!.length > 0
                    ? d!.contents!.join(", ")
                    : d?.contentCategory;
                const evalStatus: EvalBadgeStatus =
                  evalStatusMap[task.id] ?? {
                    pre: false,
                    post: false,
                    coach: false,
                  };
                return (
                  <div
                    key={task.id}
                    className={`space-y-2 rounded-2xl border p-4 text-sm transition ${
                      isToday
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-400">
                          {task.teamId
                            ? "팀 과제"
                            : task.playerId
                              ? "개인 과제"
                              : "기타"}
                          {d?.taskTypes?.length
                            ? ` · ${d.taskTypes.join(" · ")}`
                            : d?.taskType
                              ? ` · ${d.taskType}`
                              : ""}
                          {contentLabel && ` · ${contentLabel}`}
                        </p>
                        <p className="text-base font-semibold text-slate-100">
                          {task.title}
                        </p>
                        {locked && (
                          <p className="mt-1 text-[11px] text-amber-200/90">
                            공개 예정:{" "}
                            {d?.publicAt
                              ? new Date(d.publicAt).toLocaleString("ko-KR")
                              : "—"}
                          </p>
                        )}
                        {!locked && d?.goalText && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            목표: {d.goalText}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {locked && (
                            <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
                              공개 전
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              completed
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            {locked ? "대기" : completed ? "완료" : "진행 중"}
                          </span>
                          {isToday && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300">
                              오늘
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 text-[10px]">
                          <span
                            className={`rounded-full border px-1.5 py-0.5 ${
                              evalStatus.pre
                                ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-300"
                                : "border-slate-700 bg-slate-900 text-slate-500"
                            }`}
                          >
                            사전 {evalStatus.pre ? "✔" : "✕"}
                          </span>
                          <span
                            className={`rounded-full border px-1.5 py-0.5 ${
                              evalStatus.post
                                ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-300"
                                : "border-slate-700 bg-slate-900 text-slate-500"
                            }`}
                          >
                            사후 {evalStatus.post ? "✔" : "✕"}
                          </span>
                          <span
                            className={`rounded-full border px-1.5 py-0.5 ${
                              evalStatus.coach
                                ? "border-sky-500/70 bg-sky-500/10 text-sky-300"
                                : "border-slate-700 bg-slate-900 text-slate-500"
                            }`}
                          >
                            코치 {evalStatus.coach ? "✔" : "✕"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-slate-400">
                      {locked && task.dueDate && (
                        <p>
                          마감일시:{" "}
                          {new Date(task.dueDate as string).toLocaleString("ko-KR")}
                        </p>
                      )}
                      {!locked && labelDate && <p>기간: {labelDate}</p>}
                      {!locked &&
                        Array.isArray(d?.weekdays) &&
                        d!.weekdays!.length > 0 && (
                        <p>
                          요일:{" "}
                          {d!.weekdays!
                            .map((w) => "일월화수목금토"[Number(w)] ?? w)
                            .join(", ")}
                        </p>
                      )}
                      {!locked && labelTime && <p>시간: {labelTime}</p>}
                      {!locked && d?.preCheckTime && (
                        <p className="text-slate-500">사전 점검: {d.preCheckTime}</p>
                      )}
                    </div>
                    {d && !locked && (
                      <TaskCoachBlueprintView details={d} compact />
                    )}
                    {!locked && (
                      <div className="mt-1 space-y-1 text-[10px]">
                        <p className="text-slate-500">진행률</p>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              completed ? "bg-emerald-500" : "bg-slate-600"
                            }`}
                            style={{ width: completed ? "100%" : "0%" }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={`/player/tasks/${encodeURIComponent(task.id)}${
                          playerId
                            ? `?playerId=${encodeURIComponent(playerId)}`
                            : ""
                        }`}
                        className={`rounded-lg px-3 py-1.5 font-medium text-white ${
                          locked
                            ? "border border-amber-500/50 bg-amber-950/40 text-amber-100 hover:bg-amber-950/60"
                            : "bg-emerald-600 hover:bg-emerald-500"
                        }`}
                      >
                        {locked ? "상세(공개 안내)" : "자세히 보기"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function PlayerTasksPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8 text-slate-900">
          <p className="text-sm text-slate-500">불러오는 중…</p>
        </main>
      }
    >
      <PlayerTasksInner />
    </Suspense>
  );
}
