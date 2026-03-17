"use client";

import { useEffect, useState } from "react";

const sections = [
  {
    title: "대시보드",
    items: ["오늘/이번 주 일정", "팀별 출석률 요약", "과제 완료율 요약"],
  },
  {
    title: "팀 / 선수",
    items: ["내 팀 목록", "팀별 선수 목록", "선수 기본 정보 등록"],
  },
  {
    title: "일정",
    items: ["팀 일정 목록", "일정 생성·수정", "일정별 출석 체크"],
  },
  {
    title: "과제",
    items: ["공식 과제(팀 전체)", "개인 과제(선수별)", "수행 결과·피드백 기록"],
  },
];

export default function CoachHome() {
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [scheduleCount, setScheduleCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamSummary, setTeamSummary] = useState<
    { id: string; name: string; total: number; completed: number }[]
  >([]);
  const [playerSummary, setPlayerSummary] = useState<
    { id: string; name: string; teamName: string | null; total: number; completed: number }[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes, schedulesRes, tasksRes] = await Promise.all(
          [
            fetch("/api/teams"),
            fetch("/api/players"),
            fetch("/api/schedules"),
            fetch("/api/tasks"),
          ],
        );

        if (
          !teamsRes.ok ||
          !playersRes.ok ||
          !schedulesRes.ok ||
          !tasksRes.ok
        ) {
          throw new Error("대시보드 데이터를 불러오지 못했습니다.");
        }

        const [teams, players, schedules, tasks] = await Promise.all([
          teamsRes.json(),
          playersRes.json(),
          schedulesRes.json(),
          tasksRes.json(),
        ]);
        const summaryRes = await fetch("/api/dashboard/summary");
        if (!summaryRes.ok) {
          throw new Error("요약 데이터를 불러오지 못했습니다.");
        }
        const summary = await summaryRes.json();

        if (!cancelled) {
          setTeamCount(teams.length ?? 0);
          setPlayerCount(players.length ?? 0);
          setScheduleCount(schedules.length ?? 0);
          setTaskCount(tasks.length ?? 0);
          const teamEntries = Object.entries(
            summary.teamTaskCounts as Record<
              string,
              { total: number; completed: number; name: string }
            >,
          ).map(([id, v]) => ({
            id,
            name: v.name,
            total: v.total,
            completed: v.completed,
          }));
          const playerEntries = Object.entries(
            summary.playerTaskCounts as Record<
              string,
              {
                total: number;
                completed: number;
                name: string;
                teamName: string | null;
              }
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
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.",
          );
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
        <aside className="w-full max-w-xs space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h1 className="text-xl font-semibold">코치 대시보드</h1>
          <p className="text-sm text-slate-300">
            현재 DB 기준으로 팀, 선수, 일정, 과제 현황을 한눈에 볼 수 있습니다.
          </p>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">팀</p>
              <p className="text-lg font-semibold">
                {teamCount ?? (loading ? "…" : 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">선수</p>
              <p className="text-lg font-semibold">
                {playerCount ?? (loading ? "…" : 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">일정</p>
              <p className="text-lg font-semibold">
                {scheduleCount ?? (loading ? "…" : 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[11px] text-slate-400">과제</p>
              <p className="text-lg font-semibold">
                {taskCount ?? (loading ? "…" : 0)}
              </p>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-300">
              {error}
            </p>
          )}
        </aside>

        <section className="flex-1 space-y-4">
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
                        <li
                          key={t.id}
                          className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2"
                        >
                          <span className="text-slate-100">{t.name}</span>
                          <span className="text-slate-300">
                            {t.completed}/{t.total} ({rate}%)
                          </span>
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
                        <li
                          key={p.id}
                          className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2"
                        >
                          <div>
                            <p className="text-slate-100">{p.name}</p>
                            {p.teamName && (
                              <p className="text-[10px] text-slate-400">
                                {p.teamName}
                              </p>
                            )}
                          </div>
                          <span className="text-slate-300">
                            {p.completed}/{p.total} ({rate}%)
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <h2 className="text-lg font-semibold mb-2">{section.title}</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

