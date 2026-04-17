"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, StatCategory, StatDefinition, Task, Team } from "@/lib/types";
import { readApiErrorMessage } from "@/lib/apiError";
import { countDashboardTaskSlots } from "@/lib/taskDashboardCounts";
import { DEFAULT_STAT_DEFINITION, isMeasurementCategory } from "@/lib/statDefinition";

type ScheduleItem = { id: string; title: string; date: string; teamId: string };

const RADAR_SIZE = 200;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = (RADAR_SIZE / 2) * 0.8;

function MiniRadar({
  categories,
  values,
}: {
  categories: StatCategory[];
  values: Record<string, number>;
}) {
  const n = categories.length;
  if (n === 0) return null;
  const angleStep = (2 * Math.PI) / n;
  const getPoint = (value: number, index: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, Math.min(5, value)) / 5) * RADAR_R;
    return {
      x: RADAR_CX + r * Math.cos(angle),
      y: RADAR_CY + r * Math.sin(angle),
    };
  };
  const polygonPoints = categories
    .map((c, i) => getPoint(values[c.id] ?? 0, i))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="flex justify-center">
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="overflow-visible">
        {[1, 3, 5].map((level) => {
          const r = (level / 5) * RADAR_R;
          const pts = categories
            .map((_, i) => {
              const angle = angleStep * i - Math.PI / 2;
              return `${RADAR_CX + r * Math.cos(angle)},${RADAR_CY + r * Math.sin(angle)}`;
            })
            .join(" ");
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="rgba(148,163,184,0.25)"
              strokeWidth="1"
            />
          );
        })}
        <polygon
          points={polygonPoints}
          fill="rgba(16,185,129,0.25)"
          stroke="rgba(16,185,129,0.9)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function CoachHome() {
  const searchParams = useSearchParams();
  const contextTeamId = searchParams.get("teamId");
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [scheduleCount, setScheduleCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [announcementCount, setAnnouncementCount] = useState<number | null>(null);
  const [analysisCount, setAnalysisCount] = useState<number | null>(null);
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamSummary, setTeamSummary] = useState<
    { id: string; name: string; total: number; completed: number }[]
  >([]);
  const [playerSummary, setPlayerSummary] = useState<
    {
      id: string;
      name: string;
      teamName: string | null;
      teamId: string | null;
      total: number;
      completed: number;
    }[]
  >([]);
  const [teamsForStats, setTeamsForStats] = useState<Team[]>([]);
  const [latestTeamId, setLatestTeamId] = useState<string | null>(null);
  const [teamStatDef, setTeamStatDef] = useState<StatDefinition | null>(null);
  const [teamRadarValues, setTeamRadarValues] = useState<Record<string, number> | null>(null);
  const [myOrgName, setMyOrgName] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [isAdminMode, setIsAdminMode] = useState(false);

  /** URL ?teamId= 와 드롭다운 중 하나로만 범위를 정함 (둘 다 있으면 드롭다운 우선) */
  const scopeTeamId =
    selectedTeamId !== "all" ? selectedTeamId : contextTeamId ?? null;

  const filteredTeamSummary = useMemo(() => {
    if (!scopeTeamId) return teamSummary;
    return teamSummary.filter((t) => t.id === scopeTeamId);
  }, [teamSummary, scopeTeamId]);

  const filteredPlayerSummary = useMemo(() => {
    if (!scopeTeamId) return playerSummary;
    return playerSummary.filter((p) => p.teamId === scopeTeamId);
  }, [playerSummary, scopeTeamId]);

  const filteredUpcomingSchedules = useMemo(() => {
    if (!scopeTeamId) return upcomingSchedules;
    return upcomingSchedules.filter((s) => s.teamId === scopeTeamId);
  }, [upcomingSchedules, scopeTeamId]);

  useEffect(() => {
    if (contextTeamId && selectedTeamId === "all") {
      setSelectedTeamId(contextTeamId);
    }
  }, [contextTeamId, selectedTeamId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const teamQs = scopeTeamId
          ? `?teamId=${encodeURIComponent(scopeTeamId)}`
          : "";
        const [teamsRes, playersRes, schedulesRes, tasksRes, annRes, analysesRes] = await Promise.all([
          fetch(`/api/teams${teamQs}`),
          fetch(`/api/players${teamQs}`),
          fetch(`/api/schedules${teamQs}`),
          fetch(`/api/tasks${teamQs}`),
          fetch(`/api/announcements${teamQs}`),
          fetch(`/api/analyses${teamQs}`),
        ]);

        const teams = teamsRes.ok ? await teamsRes.json() : [];
        const playersData = playersRes.ok ? await playersRes.json() : [];
        const schedules = schedulesRes.ok ? await schedulesRes.json() : [];
        const tasks = tasksRes.ok ? await tasksRes.json() : [];

        const anyFailed =
          !teamsRes.ok || !playersRes.ok || !schedulesRes.ok || !tasksRes.ok;

        let loadDetail: string | null = null;
        if (anyFailed) {
          const failed = [teamsRes, playersRes, schedulesRes, tasksRes].find((r) => !r.ok);
          if (failed) loadDetail = await readApiErrorMessage(failed);
        }

        if (!cancelled) {
          const teamList: Team[] = Array.isArray(teams) ? teams : [];
          const playerList: Player[] = Array.isArray(playersData) ? playersData : [];
          const scopedTeams = scopeTeamId
            ? teamList.filter((t) => t.id === scopeTeamId)
            : teamList;
          const scopedPlayers = scopeTeamId
            ? playerList.filter((p) => p.teamId === scopeTeamId)
            : playerList;
          const schedulesList = Array.isArray(schedules) ? schedules : [];
          const scopedSchedules = scopeTeamId
            ? schedulesList.filter((s: { teamId?: string }) => s.teamId === scopeTeamId)
            : schedulesList;
          const tasksList = Array.isArray(tasks) ? tasks : [];
          const scopedTasks = scopeTeamId
            ? tasksList.filter((t: { teamId?: string | null }) => {
                if (t.teamId) return t.teamId === scopeTeamId;
                const pl = playerList.find((p) => p.id === (t as { playerId?: string }).playerId);
                return pl?.teamId === scopeTeamId;
              })
            : tasksList;

          const playersByTeamId = new Map<string, string[]>();
          for (const p of playerList) {
            if (!p.teamId) continue;
            const arr = playersByTeamId.get(p.teamId) ?? [];
            arr.push(p.id);
            playersByTeamId.set(p.teamId, arr);
          }
          let taskSlotSum = 0;
          for (const t of scopedTasks) {
            const tm = t as Task;
            if (tm.playerId) {
              taskSlotSum += 1;
            } else if (tm.teamId) {
              taskSlotSum += countDashboardTaskSlots(tm, playersByTeamId.get(tm.teamId) ?? []);
            } else {
              taskSlotSum += 1;
            }
          }

          setTeamCount(scopedTeams.length);
          setPlayerCount(scopedPlayers.length);
          setScheduleCount(scopedSchedules.length);
          setTaskCount(taskSlotSum);
          setAnnouncementCount(annRes.ok ? (await annRes.json()).length : 0);
          setAnalysisCount(analysesRes.ok ? (await analysesRes.json()).length : 0);
          setTeamsForStats(scopedTeams);
          const withDate = scopedSchedules
            .map((s: { id: string; title?: string; date?: string | Date; teamId?: string }) => ({
              id: s.id,
              title: s.title ?? "—",
              date: typeof s.date === "string" ? s.date : s.date ? new Date(s.date as Date).toISOString() : "",
              teamId: s.teamId ?? "",
            }))
            .filter((s: ScheduleItem) => s.date);
          const now = new Date().toISOString();
          const upcoming = withDate
            .filter((s: ScheduleItem) => s.date >= now)
            .sort((a: ScheduleItem, b: ScheduleItem) => a.date.localeCompare(b.date))
            .slice(0, 5);
          setUpcomingSchedules(upcoming);

          if (anyFailed) {
            setError(
              loadDetail ??
                "일부 데이터를 불러오지 못했습니다. 팀·선수·일정·과제를 먼저 등록해 보세요.",
            );
          }
        }

        const summaryRes = await fetch(`/api/dashboard/summary${teamQs}`);
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          if (!cancelled) {
            const teamEntries = Object.entries(
              summary.teamTaskCounts as Record<string, { total: number; completed: number; name: string }>,
            ).map(([id, v]) => ({ id, name: v.name, total: v.total, completed: v.completed }));
            const playerEntries = Object.entries(
              summary.playerTaskCounts as Record<
                string,
                {
                  total: number;
                  completed: number;
                  name: string;
                  teamName: string | null;
                  teamId?: string | null;
                }
              >,
            ).map(([id, v]) => ({
              id,
              name: v.name,
              teamName: v.teamName,
              teamId: v.teamId ?? null,
              total: v.total,
              completed: v.completed,
            }));
            setTeamSummary(teamEntries);
            setPlayerSummary(playerEntries);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [scopeTeamId]);

  useEffect(() => {
    function readAdminMode() {
      try {
        setIsAdminMode(window.localStorage.getItem("tmt:adminMode") === "on");
      } catch {
        setIsAdminMode(false);
      }
    }
    readAdminMode();
    window.addEventListener("focus", readAdminMode);
    return () => window.removeEventListener("focus", readAdminMode);
  }, []);

  // 코치가 소유한 조직/팀 이름 표시용
  useEffect(() => {
    let cancelled = false;
    async function loadOrg() {
      try {
        const res = await fetch("/api/coach/organizations/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { id: string; name: string }[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setMyOrgName(data[0].name);
        }
      } catch {
        // ignore
      }
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, []);

  // 팀 스탯 레이더: URL/드롭다운으로 고른 팀 우선, 없으면 목록의 마지막 팀
  useEffect(() => {
    let cancelled = false;
    async function loadTeamRadar() {
      if (!teamsForStats.length) return;
      const team =
        scopeTeamId != null
          ? teamsForStats.find((t) => t.id === scopeTeamId) ??
            teamsForStats[teamsForStats.length - 1]
          : teamsForStats[teamsForStats.length - 1];
      if (!team?.id) return;
      setLatestTeamId(team.id);
      try {
        const [teamRes, evalRes] = await Promise.all([
          fetch(`/api/teams/${team.id}`),
          fetch(`/api/teams/${team.id}/player-evaluations`),
        ]);
        if (!teamRes.ok || !evalRes.ok) return;
        const teamData = (await teamRes.json()) as Team;
        const evals = (await evalRes.json()) as {
          subjectPlayerId: string;
          scores: Record<string, number[]>;
          createdAt?: string | null;
        }[];
        if (cancelled) return;
        const def: StatDefinition =
          teamData.statDefinition ?? DEFAULT_STAT_DEFINITION;
        // 최근 30일만
        const now = new Date();
        const to = new Date(now);
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        const filtered = evals.filter((e) => {
          if (!e.createdAt) return true;
          const d = new Date(e.createdAt);
          if (Number.isNaN(d.getTime())) return true;
          return d >= from && d <= to;
        });
        const byCat: Record<string, number> = {};
        if (filtered.length === 0) {
          def.categories.forEach((c) => {
            byCat[c.id] = 0;
          });
        } else {
          const sums: Record<string, number> = {};
          const counts: Record<string, number> = {};
          for (const e of filtered) {
            for (const [catId, arr] of Object.entries(e.scores)) {
              if (!Array.isArray(arr) || arr.length === 0) continue;
              const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
              sums[catId] = (sums[catId] ?? 0) + avg;
              counts[catId] = (counts[catId] ?? 0) + 1;
            }
          }
          def.categories.forEach((c) => {
            const sum = sums[c.id] ?? 0;
            const cnt = counts[c.id] ?? 0;
            byCat[c.id] = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0;
          });
        }
        setTeamStatDef(def);
        setTeamRadarValues(byCat);
      } catch {
        if (!cancelled) {
          setTeamStatDef(null);
          setTeamRadarValues(null);
        }
      }
    }
    loadTeamRadar();
    return () => {
      cancelled = true;
    };
  }, [teamsForStats, scopeTeamId]);

  return (
    <main className="px-2 py-2 text-slate-900 md:px-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <aside className="w-full max-w-xs space-y-4 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-md shadow-sky-900/10">
          <h1 className="text-xl font-semibold text-slate-900">코치 대시보드</h1>
          <p className="text-sm text-slate-600">
            {scopeTeamId
              ? "URL·아래에서 고른 팀만 반영된 팀·선수·일정·과제·공지·전술 현황입니다."
              : "접근 가능한 팀 기준으로 팀, 선수, 일정, 과제 현황을 한눈에 볼 수 있습니다."}
          </p>
          {myOrgName && (
            <p className="text-xs text-slate-500">
              소속 조직: <span className="font-medium text-slate-800">{myOrgName}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2">
              <p className="text-[11px] text-slate-500">팀</p>
              <p className="text-lg font-semibold text-sky-900">{teamCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2">
              <p className="text-[11px] text-slate-500">선수</p>
              <p className="text-lg font-semibold text-sky-900">{playerCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2">
              <p className="text-[11px] text-slate-500">일정</p>
              <p className="text-lg font-semibold text-sky-900">{scheduleCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div
              className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2"
              title="팀 과제는 배정(엔트리) 선수 수만큼 합산합니다."
            >
              <p className="text-[11px] text-slate-500">과제</p>
              <p className="text-lg font-semibold text-sky-900">{taskCount ?? (loading ? "…" : 0)}</p>
              <p className="text-[10px] text-slate-400">배정 인원 기준</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2">
              <p className="text-[11px] text-slate-500">공지</p>
              <p className="text-lg font-semibold text-sky-900">{announcementCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2">
              <p className="text-[11px] text-slate-500">전술 기록</p>
              <p className="text-lg font-semibold text-sky-900">{analysisCount ?? (loading ? "…" : 0)}</p>
            </div>
          </div>

          {isAdminMode && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3">
              <p className="text-[11px] font-semibold text-amber-900">관리자 팀 보기</p>
              <p className="text-[10px] leading-snug text-amber-900/85">
                다른 팀 정보는 이 화면에서 팀을 바꾸지 말고, 홈의「관리자 팀 선택」으로 돌아가서 다시 고르세요.
              </p>
              {scopeTeamId ? (
                <p className="text-xs text-slate-800">
                  현재 보는 팀:{" "}
                  <span className="font-semibold">
                    {teamsForStats.find((t) => t.id === scopeTeamId)?.name ?? scopeTeamId}
                  </span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-600">
                  주소에 팀이 지정되어 있지 않습니다. 홈에서 팀을 고른 뒤 입장해 주세요.
                </p>
              )}
              <Link
                href="/?openAdminPicker=1"
                className="block rounded-md border border-amber-600 bg-white px-2 py-1.5 text-center text-[11px] font-medium text-amber-950 hover:bg-amber-50"
              >
                관리자 팀 선택으로 돌아가기
              </Link>
              {scopeTeamId ? (
                <Link
                  href={`/coach/players?teamId=${encodeURIComponent(scopeTeamId)}`}
                  className="block rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-center text-[11px] text-sky-800 hover:bg-sky-100"
                >
                  선수 개인 항목으로 이동
                </Link>
              ) : null}
            </div>
          )}
          {!isAdminMode && myOrgName && (
            <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-700">팀 이동</p>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-xs text-slate-800"
              >
                <option value="all">팀 선택</option>
                {teamsForStats.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {selectedTeamId !== "all" ? (
                <Link
                  href={`/coach/players?teamId=${encodeURIComponent(selectedTeamId)}`}
                  className="block rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-center text-[11px] text-sky-800 hover:bg-sky-100"
                >
                  선수 개인 항목으로 이동
                </Link>
              ) : (
                <p className="text-[10px] text-slate-500">
                  팀을 선택하면 선수 개인 항목으로 이동할 수 있습니다.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-300">
              {error}
            </p>
          )}
        </aside>

        <section className="flex-1 space-y-4">
          {teamStatDef && teamRadarValues && (
            <div className="rounded-2xl border border-sky-100 bg-white/90 p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">팀 스탯 레이더 (최근 30일)</h2>
                  <p className="text-xs text-slate-400">
                    가장 최근 팀의 평가를 기준으로, 카테고리별 평균을 1~5점 레이더로 보여줍니다.
                  </p>
                </div>
                {latestTeamId && (
                  <div className="flex flex-col items-end gap-1 text-[11px]">
                    <Link
                      href={`/coach/teams/${encodeURIComponent(latestTeamId)}/stats`}
                      className="rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-600 hover:border-sky-400 hover:text-sky-800"
                    >
                      스탯 상세
                    </Link>
                    <Link
                      href={`/coach/teams/${encodeURIComponent(latestTeamId)}/report`}
                      className="rounded-full border border-sky-500 bg-sky-50 px-3 py-1 text-[11px] text-sky-800 hover:bg-sky-100"
                    >
                      리포트 (인쇄용)
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="md:w-1/2">
                  <MiniRadar
                    categories={teamStatDef.categories.filter((c) =>
                      !isMeasurementCategory(teamStatDef, c.id),
                    )}
                    values={teamRadarValues}
                  />
                </div>
                <div className="md:w-1/2 space-y-1 text-xs text-slate-600">
                  {teamStatDef.categories
                    .filter((c) => !isMeasurementCategory(teamStatDef, c.id))
                    .map((c) => {
                      const v = teamRadarValues[c.id] ?? 0;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span style={{ color: c.color }}>{c.label}</span>
                          <span className="text-slate-900">{v.toFixed(1)} / 5.0</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-sky-100 bg-white/90 p-5 space-y-4">
            <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">팀 / 선수 과제 요약</h2>
              {scopeTeamId && (
                <p className="text-[11px] text-sky-700">
                  선택 팀만 표시 중
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  팀별 과제 완료율
                </p>
                <p className="text-[10px] text-slate-400">
                  총·완료 수는 팀 과제별 배정(엔트리) 선수 수를 기준으로 합니다.
                </p>
                {filteredTeamSummary.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    팀 대상 과제가 아직 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {filteredTeamSummary.map((t) => {
                      const rate =
                        t.total === 0
                          ? 0
                          : Math.round((t.completed / t.total) * 100);
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/coach/tasks?teamId=${encodeURIComponent(t.id)}`}
                            className="flex items-center justify-between rounded-lg bg-sky-50/90 px-3 py-2 hover:bg-sky-100 transition-colors"
                          >
                            <span className="text-slate-900">{t.name}</span>
                            <span className="text-slate-600">
                              {t.completed}/{t.total} ({rate}%)
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  선수별 과제 완료율
                </p>
                {filteredPlayerSummary.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    선수 개인 과제가 아직 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {filteredPlayerSummary.map((p) => {
                      const rate =
                        p.total === 0
                          ? 0
                          : Math.round((p.completed / p.total) * 100);
                      return (
                        <li key={p.id}>
                          <Link
                            href={
                              p.teamId
                                ? `/coach/players?teamId=${encodeURIComponent(p.teamId)}`
                                : "/coach/players"
                            }
                            className="flex items-center justify-between rounded-lg bg-sky-50/90 px-3 py-2 hover:bg-sky-100 transition-colors"
                          >
                            <div>
                              <p className="text-slate-900">{p.name}</p>
                              {p.teamName && (
                                <p className="text-[10px] text-slate-400">{p.teamName}</p>
                              )}
                            </div>
                            <span className="text-slate-600">
                              {p.completed}/{p.total} ({rate}%)
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white/90 p-5">
            <h2 className="text-lg font-semibold mb-3">다가오는 일정</h2>
            {filteredUpcomingSchedules.length === 0 ? (
              <p className="text-sm text-slate-500">다가오는 일정이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {filteredUpcomingSchedules.map((s) => (
                  <li key={s.id}>
                    <Link
                      href="/coach/schedule"
                      className="block rounded-lg bg-sky-50/90 px-3 py-2 hover:bg-sky-100 transition-colors text-sm"
                    >
                      <span className="text-slate-900 font-medium">{s.title}</span>
                      <span className="ml-2 text-slate-400 text-xs">
                        {s.date ? new Date(s.date).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          weekday: "short",
                        }) : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/coach/schedule"
              className="mt-3 inline-block text-sm text-sky-400 hover:text-sky-300"
            >
              일정 전체 보기 →
            </Link>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-white/90 p-5">
            <h2 className="text-lg font-semibold mb-3">바로가기</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link
                href="/coach/schedule"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">일정</p>
                <p className="text-xs text-slate-400 mt-0.5">{scheduleCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/tasks"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">과제</p>
                <p className="text-xs text-slate-400 mt-0.5">{taskCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/announcements"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">공지</p>
                <p className="text-xs text-slate-400 mt-0.5">{announcementCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/analysis/data"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">전술 데이터</p>
                <p className="text-xs text-slate-400 mt-0.5">{analysisCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/analysis/archive"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">기록관</p>
                <p className="text-xs text-slate-400 mt-0.5">경기 목록</p>
              </Link>
              <Link
                href="/coach/teams"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">팀</p>
                <p className="text-xs text-slate-400 mt-0.5">{teamCount ?? 0}개</p>
              </Link>
              <Link
                href="/coach/players"
                className="rounded-xl border border-sky-200 bg-white/95 px-4 py-3 hover:bg-sky-50 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-900">선수</p>
                <p className="text-xs text-slate-400 mt-0.5">{playerCount ?? 0}명</p>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

