"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Player, Team } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [adminMode, setAdminMode] = useState(false);
  const [showAdminCoachPicker, setShowAdminCoachPicker] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tmt:adminMode");
      setAdminMode(v === "on");
    } catch {
      // ignore
    }
  }, []);

  function toggleAdmin() {
    setAdminMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("tmt:adminMode", next ? "on" : "off");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function openAdminCoachPicker() {
    setShowAdminCoachPicker(true);
    if (teams.length > 0 || loadingPicker) return;
    try {
      setLoadingPicker(true);
      setPickerError(null);
      const [teamsRes, playersRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/players"),
      ]);
      const teamsData: Team[] = teamsRes.ok ? await teamsRes.json() : [];
      const playersData: Player[] = playersRes.ok ? await playersRes.json() : [];
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      setPlayers(Array.isArray(playersData) ? playersData : []);
      if (teamsData[0]) {
        setSelectedTeamId(teamsData[0].id);
      }
      if (!teamsRes.ok || !playersRes.ok) {
        setPickerError("팀/선수 목록을 일부 불러오지 못했습니다.");
      }
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoadingPicker(false);
    }
  }

  const filteredPlayers = useMemo(() => {
    if (selectedTeamId === "all") return players;
    return players.filter((p) => p.teamId === selectedTeamId);
  }, [players, selectedTeamId]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl p-8 md:p-10 space-y-8">
        <header className="text-center space-y-2">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="text-2xl md:text-3xl font-bold">
            역할을 선택하세요
          </h1>
          <p className="text-sm text-slate-400">
            코치로 들어갈지, 선수로 들어갈지 선택합니다.
          </p>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={toggleAdmin}
              className={`rounded-full border px-2 py-0.5 ${
                adminMode
                  ? "border-amber-500 bg-amber-500/15 text-amber-300"
                  : "border-slate-600 bg-slate-900 text-slate-400"
              }`}
            >
              관리자 모드 {adminMode ? "ON" : "OFF"}
            </button>
            <span className="hidden sm:inline">
              (개발/수정용 – 이 브라우저에서만 적용)
            </span>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {adminMode ? (
            <button
              type="button"
              onClick={openAdminCoachPicker}
              className="group rounded-xl border-2 border-slate-700 bg-slate-900/80 px-6 py-5 flex flex-col gap-2 text-left transition hover:border-amber-400 hover:bg-slate-800/60"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-amber-300">
                Coach
              </span>
              <span className="text-xl font-bold text-slate-100">코치</span>
              <span className="text-sm text-slate-400">
                관리자 모드: 팀을 선택하고 선수 목록을 확인한 뒤 이동합니다.
              </span>
            </button>
          ) : (
            <Link
              href="/coach"
              className="group rounded-xl border-2 border-slate-700 bg-slate-900/80 px-6 py-5 flex flex-col gap-2 transition hover:border-emerald-400 hover:bg-slate-800/60"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-emerald-400">
                Coach
              </span>
              <span className="text-xl font-bold text-slate-100">코치</span>
              <span className="text-sm text-slate-400">팀·선수·일정·과제·공지·전술을 관리합니다.</span>
            </Link>
          )}
          <Link
            href="/login"
            className="group rounded-xl border-2 border-slate-700 bg-slate-900/80 px-6 py-5 flex flex-col gap-2 transition hover:border-emerald-400 hover:bg-slate-800/60"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-emerald-400">
              Player
            </span>
            <span className="text-xl font-bold text-slate-100">선수</span>
            <span className="text-sm text-slate-400">개인 번호·비밀번호로 로그인 후 내 일정·과제를 확인합니다.</span>
          </Link>
        </section>
      </div>

      {showAdminCoachPicker && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 px-4 py-6">
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-amber-300">관리자 팀 선택</h2>
              <button
                type="button"
                onClick={() => setShowAdminCoachPicker(false)}
                className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                닫기
              </button>
            </div>

            {pickerError && (
              <p className="mb-3 rounded-md border border-rose-700/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                {pickerError}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-300">팀 목록</p>
                {loadingPicker ? (
                  <p className="text-xs text-slate-500">불러오는 중...</p>
                ) : teams.length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 팀이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {teams.map((t) => (
                      <div
                        key={t.id}
                        className={`rounded-md border px-2 py-2 ${
                          selectedTeamId === t.id
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeamId(t.id);
                            router.push(`/coach/players?teamId=${encodeURIComponent(t.id)}`);
                          }}
                          className="w-full text-left text-sm font-medium text-slate-100"
                        >
                          {t.name}
                        </button>
                        <div className="mt-2 flex gap-2">
                          <Link
                            href={`/coach?teamId=${encodeURIComponent(t.id)}`}
                            className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                          >
                            팀 대시보드
                          </Link>
                          <Link
                            href={`/coach/players?teamId=${encodeURIComponent(t.id)}`}
                            className="rounded-md border border-emerald-600/70 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                          >
                            선수 개인 항목
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-300">선수 목록</p>
                {loadingPicker ? (
                  <p className="text-xs text-slate-500">불러오는 중...</p>
                ) : filteredPlayers.length === 0 ? (
                  <p className="text-xs text-slate-500">선수 데이터가 없습니다.</p>
                ) : (
                  <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                    {filteredPlayers.map((p) => {
                      const teamName = teams.find((t) => t.id === p.teamId)?.name ?? "-";
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs"
                        >
                          <span className="font-medium text-slate-200">{p.name}</span>
                          <span className="text-slate-400">
                            {teamName}
                            {p.position ? ` · ${p.position}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
