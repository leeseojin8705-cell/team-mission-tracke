"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Player, StatCategory, StatDefinition, Team } from "@/lib/types";
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
    { id: string; name: string; teamName: string | null; total: number; completed: number }[]
  >([]);
  const [teamsForStats, setTeamsForStats] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [latestTeamId, setLatestTeamId] = useState<string | null>(null);
  const [teamStatDef, setTeamStatDef] = useState<StatDefinition | null>(null);
  const [teamRadarValues, setTeamRadarValues] = useState<Record<string, number> | null>(null);
  const [myOrgName, setMyOrgName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes, schedulesRes, tasksRes, annRes, analysesRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/players"),
          fetch("/api/schedules"),
          fetch("/api/tasks"),
          fetch("/api/announcements"),
          fetch("/api/analyses"),
        ]);

        const teams = teamsRes.ok ? await teamsRes.json() : [];
        const playersData = playersRes.ok ? await playersRes.json() : [];
        const schedules = schedulesRes.ok ? await schedulesRes.json() : [];
        const tasks = tasksRes.ok ? await tasksRes.json() : [];

        const anyFailed =
          !teamsRes.ok || !playersRes.ok || !schedulesRes.ok || !tasksRes.ok;

        if (!cancelled) {
          const teamList: Team[] = Array.isArray(teams) ? teams : [];
          const playerList: Player[] = Array.isArray(playersData) ? playersData : [];
          setTeamCount(teamList.length);
          setPlayerCount(playerList.length);
          setScheduleCount(Array.isArray(schedules) ? schedules.length : 0);
          setTaskCount(Array.isArray(tasks) ? tasks.length : 0);
          setAnnouncementCount(annRes.ok ? (await annRes.json()).length : 0);
          setAnalysisCount(analysesRes.ok ? (await analysesRes.json()).length : 0);
          setTeamsForStats(teamList);
          setPlayers(playerList);

          const scheduleList = Array.isArray(schedules) ? schedules : [];
          const withDate = scheduleList
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
            setError("일부 데이터를 불러오지 못했습니다. 팀·선수·일정·과제를 먼저 등록해 보세요.");
          }
        }

        const summaryRes = await fetch("/api/dashboard/summary");
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          if (!cancelled) {
            const teamEntries = Object.entries(
              summary.teamTaskCounts as Record<string, { total: number; completed: number; name: string }>,
            ).map(([id, v]) => ({ id, name: v.name, total: v.total, completed: v.completed }));
            const playerEntries = Object.entries(
              summary.playerTaskCounts as Record<
                string,
                { total: number; completed: number; name: string; teamName: string | null }
              >,
            ).map(([id, v]) => ({
              id,
              name: v.name,
              teamName: v.teamName,
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

  // 팀 스탯 레이더: 가장 최근 시즌 팀 + 최근 30일 평가 기준
  useEffect(() => {
    let cancelled = false;
    async function loadTeamRadar() {
      if (!teamsForStats.length) return;
      // 시즌/생성일 기준으로 마지막 팀 하나 선택 (단순히 마지막 요소)
      const team = teamsForStats[teamsForStats.length - 1];
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
          (teamData as any).statDefinition ?? DEFAULT_STAT_DEFINITION;
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
  }, [teamsForStats]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <aside className="w-full max-w-xs space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h1 className="text-xl font-semibold">코치 대시보드</h1>
          <p className="text-sm text-slate-300">
            현재 DB 기준으로 팀, 선수, 일정, 과제 현황을 한눈에 볼 수 있습니다.
          </p>
          {myOrgName && (
            <p className="text-xs text-slate-400">
              소속 조직: <span className="font-medium text-slate-100">{myOrgName}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">팀</p>
              <p className="text-lg font-semibold">{teamCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">선수</p>
              <p className="text-lg font-semibold">{playerCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">일정</p>
              <p className="text-lg font-semibold">{scheduleCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">과제</p>
              <p className="text-lg font-semibold">{taskCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">공지</p>
              <p className="text-lg font-semibold">{announcementCount ?? (loading ? "…" : 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">전술 기록</p>
              <p className="text-lg font-semibold">{analysisCount ?? (loading ? "…" : 0)}</p>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-300">
              {error}
            </p>
          )}
        </aside>

        <section className="flex-1 space-y-4">
          {teamStatDef && teamRadarValues && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
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
                      className="rounded-full border border-slate-600 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                    >
                      스탯 상세
                    </Link>
                    <Link
                      href={`/coach/teams/${encodeURIComponent(latestTeamId)}/report`}
                      className="rounded-full border border-emerald-500 px-3 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
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
                <div className="md:w-1/2 space-y-1 text-xs text-slate-300">
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
                          <span className="text-slate-100">{v.toFixed(1)} / 5.0</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h2 className="text-lg font-semibold mb-1">팀 / 선수 과제 요약</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  팀별 과제 완료율
                </p>
                {teamSummary.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    팀 대상 과제가 아직 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {teamSummary.map((t) => {
                      const rate =
                        t.total === 0
                          ? 0
                          : Math.round((t.completed / t.total) * 100);
                      return (
                        <li key={t.id}>
                          <Link
                            href="/coach/tasks"
                            className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 hover:bg-slate-800/50 transition-colors"
                          >
                            <span className="text-slate-100">{t.name}</span>
                            <span className="text-slate-300">
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
                {playerSummary.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    선수 개인 과제가 아직 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {playerSummary.map((p) => {
                      const rate =
                        p.total === 0
                          ? 0
                          : Math.round((p.completed / p.total) * 100);
                      return (
                        <li key={p.id}>
                          <Link
                            href="/coach/players"
                            className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 hover:bg-slate-800/50 transition-colors"
                          >
                            <div>
                              <p className="text-slate-100">{p.name}</p>
                              {p.teamName && (
                                <p className="text-[10px] text-slate-400">{p.teamName}</p>
                              )}
                            </div>
                            <span className="text-slate-300">
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold mb-3">다가오는 일정</h2>
            {upcomingSchedules.length === 0 ? (
              <p className="text-sm text-slate-500">다가오는 일정이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingSchedules.map((s) => (
                  <li key={s.id}>
                    <Link
                      href="/coach/schedule"
                      className="block rounded-lg bg-slate-950/50 px-3 py-2 hover:bg-slate-800/50 transition-colors text-sm"
                    >
                      <span className="text-slate-100 font-medium">{s.title}</span>
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

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold mb-3">바로가기</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link
                href="/coach/schedule"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">일정</p>
                <p className="text-xs text-slate-400 mt-0.5">{scheduleCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/tasks"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">과제</p>
                <p className="text-xs text-slate-400 mt-0.5">{taskCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/announcements"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">공지</p>
                <p className="text-xs text-slate-400 mt-0.5">{announcementCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/analysis/data"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">전술 데이터</p>
                <p className="text-xs text-slate-400 mt-0.5">{analysisCount ?? 0}건</p>
              </Link>
              <Link
                href="/coach/analysis/archive"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">기록관</p>
                <p className="text-xs text-slate-400 mt-0.5">경기 목록</p>
              </Link>
              <Link
                href="/coach/teams"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">팀</p>
                <p className="text-xs text-slate-400 mt-0.5">{teamCount ?? 0}개</p>
              </Link>
              <Link
                href="/coach/players"
                className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 hover:bg-slate-800/60 transition-colors text-center"
              >
                <p className="text-sm font-medium text-slate-100">선수</p>
                <p className="text-xs text-slate-400 mt-0.5">{playerCount ?? 0}명</p>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

