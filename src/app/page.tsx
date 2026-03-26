"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Player, Team } from "@/lib/types";

const ADMIN_MODE_PINS = new Set(["3932", "0513"]);

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [todayEntryCount, setTodayEntryCount] = useState<number | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [showAdminCoachPicker, setShowAdminCoachPicker] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tmt:adminMode");
      setAdminMode(v === "on");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function recordTodayEntry() {
      try {
        const keyName = "tmt:visitorKey";
        let visitorKey = window.localStorage.getItem(keyName);
        if (!visitorKey) {
          visitorKey =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `vk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          window.localStorage.setItem(keyName, visitorKey);
        }
        const res = await fetch("/api/entry/today", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorKey }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (typeof data.count === "number") {
          setTodayEntryCount(data.count);
        }
      } catch {
        // ignore
      }
    }
    recordTodayEntry();
  }, []);

  function toggleAdmin() {
    setAdminMode((prev) => {
      const next = !prev;
      if (next) {
        const input = window.prompt("관리자 모드 비밀번호 4자리를 입력하세요.");
        const pin = (input ?? "").trim();
        if (!ADMIN_MODE_PINS.has(pin)) {
          window.alert("비밀번호가 올바르지 않습니다.");
          return prev;
        }
      }
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
      const teamsRes = await fetch("/api/teams");
      const teamsData: Team[] = teamsRes.ok ? await teamsRes.json() : [];
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      if (teamsData[0]) {
        setSelectedTeamId(teamsData[0].id);
      }
      if (!teamsRes.ok) {
        setPickerError("팀 목록을 불러오지 못했습니다.");
      }
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoadingPicker(false);
    }
  }

  async function handleDeleteTeam(team: Team) {
    const ok = window.confirm(
      `정말 "${team.name}" 팀을 삭제하시겠습니까?\n팀에 연결된 선수/일정/과제 데이터도 영향받을 수 있습니다.`,
    );
    if (!ok) return;

    try {
      setDeletingTeamId(team.id);
      setPickerError(null);
      const res = await fetch(`/api/teams/${encodeURIComponent(team.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("팀 삭제에 실패했습니다.");
      }

      setTeams((prev) => {
        const next = prev.filter((t) => t.id !== team.id);
        if (selectedTeamId === team.id) {
          setSelectedTeamId(next[0]?.id ?? "all");
        }
        return next;
      });
      setPlayers((prev) => prev.filter((p) => p.teamId !== team.id));
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "팀 삭제에 실패했습니다.");
    } finally {
      setDeletingTeamId(null);
    }
  }

  useEffect(() => {
    if (!showAdminCoachPicker || selectedTeamId === "all") {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    async function loadTeamPlayers() {
      try {
        const res = await fetch(`/api/players?teamId=${encodeURIComponent(selectedTeamId)}`);
        const data: Player[] = res.ok ? await res.json() : [];
        if (!cancelled) {
          setPlayers(Array.isArray(data) ? data : []);
          if (!res.ok) {
            setPickerError("선수 목록을 불러오지 못했습니다.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setPlayers([]);
          setPickerError(e instanceof Error ? e.message : "선수 목록을 불러오지 못했습니다.");
        }
      }
    }
    loadTeamPlayers();
    return () => {
      cancelled = true;
    };
  }, [showAdminCoachPicker, selectedTeamId]);

  if (showWelcome) {
    return (
      <main
        className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 cursor-pointer"
        onClick={() => setShowWelcome(false)}
      >
        <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-16 md:px-10 text-center">
          <p className="text-xs md:text-sm tracking-[0.2em] text-slate-400">COMPANY</p>
          <h1 className="mt-3 text-4xl md:text-6xl font-black tracking-tight text-emerald-400">
            러너스 하이
          </h1>
          <p className="mt-4 text-sm md:text-base text-slate-300">
            TEAM MISSION TRACKER
          </p>
          <p className="mt-6 text-xs md:text-sm text-slate-400">
            오늘 입장 인원{" "}
            <span className="font-semibold text-slate-100">
              {todayEntryCount ?? "..."}명
            </span>
          </p>
          <p className="mt-8 text-xs text-slate-500">화면을 터치/클릭하면 역할 선택으로 이동합니다</p>
        </div>
      </main>
    );
  }

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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-6">
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-5 max-h-[90vh] overflow-y-auto">
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
            <p className="mb-3 text-[11px] text-slate-400">
              총 등록 팀 <span className="font-semibold text-slate-200">{teams.length}</span> · 총 등록 선수{" "}
              <span className="font-semibold text-slate-200">{players.length}</span>
            </p>

            {pickerError && (
              <p className="mb-3 rounded-md border border-rose-700/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                {pickerError}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 min-h-[220px]">
                <p className="mb-2 text-xs font-semibold text-slate-300">팀 목록</p>
                {loadingPicker ? (
                  <p className="text-xs text-slate-500">불러오는 중...</p>
                ) : teams.length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 팀이 없습니다.</p>
                ) : (
                  <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                    {teams.map((t) => (
                      <div
                        key={t.id}
                        className={`rounded-md border px-2 py-2 ${
                          selectedTeamId === t.id
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedTeamId(t.id)}
                            className="flex-1 text-left text-sm font-medium text-slate-100"
                          >
                            {t.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTeam(t)}
                            disabled={deletingTeamId === t.id}
                            className="rounded-md border border-rose-700/70 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingTeamId === t.id ? "삭제중..." : "삭제"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 min-h-[220px]">
                <p className="mb-2 text-xs font-semibold text-slate-300">선수 목록</p>
                {loadingPicker ? (
                  <p className="text-xs text-slate-500">불러오는 중...</p>
                ) : players.length === 0 ? (
                  <p className="text-xs text-slate-500">선수 데이터가 없습니다.</p>
                ) : (
                  <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                    {players.map((p) => {
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

            {selectedTeamId !== "all" && (
              <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2 border-t border-slate-700 pt-3">
                <Link
                  href={`/coach?teamId=${encodeURIComponent(selectedTeamId)}`}
                  className="w-full sm:w-auto rounded-md border border-slate-600 px-3 py-1.5 text-center text-xs text-slate-200 hover:bg-slate-800"
                >
                  선택 팀 대시보드 입장
                </Link>
                <Link
                  href={`/coach/players?teamId=${encodeURIComponent(selectedTeamId)}`}
                  className="w-full sm:w-auto rounded-md border border-emerald-600/70 px-3 py-1.5 text-center text-xs text-emerald-300 hover:bg-emerald-500/10"
                >
                  선택 팀 선수 개인 항목 입장
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
