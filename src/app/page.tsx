"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlowLogo } from "@/components/FlowLogo";
import { ADMIN_MODE_PINS } from "@/lib/adminModePins";
import {
  clearAdminPinCookie,
  syncAdminPinCookieFromSession,
} from "@/lib/coachAdminFetch";
import type { Player, Team } from "@/lib/types";

const ADMIN_PIN_STORAGE = "tmt:adminPin";

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
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  function getAdminPinHeaders(): HeadersInit {
    try {
      const pin = sessionStorage.getItem(ADMIN_PIN_STORAGE) ?? "";
      return pin ? { "x-admin-pin": pin } : {};
    } catch {
      return {};
    }
  }

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
        try {
          sessionStorage.setItem(ADMIN_PIN_STORAGE, pin);
        } catch {
          // ignore
        }
        syncAdminPinCookieFromSession();
      } else {
        try {
          sessionStorage.removeItem(ADMIN_PIN_STORAGE);
        } catch {
          // ignore
        }
        clearAdminPinCookie();
      }
      try {
        window.localStorage.setItem("tmt:adminMode", next ? "on" : "off");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const openAdminCoachPicker = useCallback(async (forceReload = false) => {
    setShowAdminCoachPicker(true);
    if (!forceReload && (teams.length > 0 || loadingPicker)) return;
    try {
      setLoadingPicker(true);
      setPickerError(null);
      let adminPin = "";
      try {
        adminPin = sessionStorage.getItem(ADMIN_PIN_STORAGE) ?? "";
      } catch {
        adminPin = "";
      }
      if (!adminPin) {
        const input = window.prompt(
          "등록된 전체 팀 목록을 불러오려면 관리자 PIN 4자리를 입력하세요.",
        );
        const pin = (input ?? "").trim();
        if (!pin) {
          setPickerError("관리자 PIN을 입력해야 팀 목록을 불러올 수 있습니다.");
          setLoadingPicker(false);
          return;
        }
        if (!ADMIN_MODE_PINS.has(pin)) {
          setPickerError("PIN이 올바르지 않습니다.");
          setLoadingPicker(false);
          return;
        }
        adminPin = pin;
        try {
          sessionStorage.setItem(ADMIN_PIN_STORAGE, pin);
        } catch {
          // ignore
        }
      }
      syncAdminPinCookieFromSession();
      const teamsRes = await fetch("/api/teams?listAll=1", {
        headers: { "x-admin-pin": adminPin },
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await teamsRes.json().catch(() => null);
      if (!teamsRes.ok) {
        const detail =
          body &&
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : null;
        setPickerError(
          detail
            ? `${detail} (HTTP ${teamsRes.status})`
            : `팀 목록을 불러오지 못했습니다. (HTTP ${teamsRes.status})`,
        );
        setTeams([]);
        return;
      }
      const teamsData = Array.isArray(body) ? (body as Team[]) : [];
      setTeams(teamsData);
      if (teamsData.length === 0) {
        setPickerError("DB에 등록된 팀이 없습니다.");
      } else if (teamsData[0]) {
        setSelectedTeamId(teamsData[0].id);
      }
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoadingPicker(false);
    }
  }, [teams.length, loadingPicker]);

  const openAdminCoachPickerRef = useRef(openAdminCoachPicker);
  openAdminCoachPickerRef.current = openAdminCoachPicker;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openAdminPicker") !== "1") return;
    setShowWelcome(false);
    setTeams([]);
    setSelectedTeamId("all");
    setPickerError(null);
    window.history.replaceState({}, "", "/");
    void openAdminCoachPickerRef.current(true);
  }, []);

  async function handleDeleteTeam(team: Team) {
    const ok = window.confirm(
      `「${team.name}」팀 데이터를 DB에서 삭제하시겠습니까?\n선수·일정·과제 등 팀에 묶인 정보에 영향을 줍니다.`,
    );
    if (!ok) return;

    let deleteCoachAccount = false;
    if (team.createdByUserId) {
      deleteCoachAccount = window.confirm(
        `이 팀을「팀 추가」로 만든 코치가 있으면, 코치 사이트 이메일 로그인 계정(User)도 함께 삭제할까요?\n\n· 예: 해당 코치가 만든 다른 팀이 없고, 조직 소유자가 아닌 coach 계정이면 삭제됩니다.\n· 아니오: 팀만 삭제하고 코치 계정은 유지합니다.`,
      );
    }

    try {
      setDeletingTeamId(team.id);
      setPickerError(null);

      const qs = deleteCoachAccount ? "?deleteCoachAccount=1" : "";
      const res = await fetch(`/api/teams/${encodeURIComponent(team.id)}${qs}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: getAdminPinHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "팀 삭제에 실패했습니다.",
        );
      }
      if (
        deleteCoachAccount &&
        data &&
        typeof data === "object" &&
        "coachAccountDeleted" in data &&
        (data as { coachAccountDeleted?: boolean }).coachAccountDeleted
      ) {
        window.alert("팀과 함께 해당 코치 로그인 계정도 삭제되었습니다.");
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

  async function handleDeletePlayer(player: Player) {
    const ok = window.confirm(
      `「${player.name}」선수 계정을 삭제하시겠습니까?\n개인 번호·비밀번호로 로그인할 수 없게 되며, 과제 진행 기록 등 연결 데이터도 함께 정리됩니다.`,
    );
    if (!ok) return;

    try {
      setDeletingPlayerId(player.id);
      setPickerError(null);

      const res = await fetch(`/api/players/${encodeURIComponent(player.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: getAdminPinHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "선수 삭제에 실패했습니다.",
        );
      }

      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "선수 삭제에 실패했습니다.");
    } finally {
      setDeletingPlayerId(null);
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
        className="min-h-screen cursor-pointer bg-gradient-to-br from-sky-200 via-sky-300 to-sky-400 text-slate-900 flex items-center justify-center px-4"
        onClick={() => setShowWelcome(false)}
      >
        <div className="w-full max-w-lg rounded-3xl border border-sky-200/80 bg-white/92 px-8 py-12 md:px-12 md:py-14 text-center shadow-xl shadow-sky-500/25 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <FlowLogo className="h-12 w-[min(100%,13rem)] md:h-16 text-[#00aeef]" />
            <p className="text-[10px] md:text-xs font-semibold tracking-[0.32em] text-sky-600/85">
              TEAM MISSION TRACKER
            </p>
          </div>
          <p className="mt-6 text-sm md:text-[15px] font-medium leading-relaxed text-sky-900/85">
            축구 팀 미션 · 훈련 · 과제를 한곳에서
          </p>
          <p className="mt-7 text-xs md:text-sm text-sky-700/85">
            오늘 입장 인원{" "}
            <span className="font-semibold tabular-nums text-sky-900">
              {todayEntryCount ?? "..."}명
            </span>
          </p>
          <p className="mt-9 text-[11px] text-sky-600/90">
            화면을 터치/클릭하면 역할 선택으로 이동합니다
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-400 to-sky-500 text-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/45 bg-white/92 shadow-xl shadow-sky-600/20 p-8 md:p-10 space-y-8 backdrop-blur-sm">
        <header className="text-center space-y-4">
          <div className="flex flex-col items-center gap-2">
            <FlowLogo className="h-9 w-[min(100%,11rem)] md:h-11 text-[#00aeef]" />
            <p className="text-[11px] font-semibold tracking-[0.28em] text-sky-600/80">
              TEAM MISSION TRACKER
            </p>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            역할을 선택하세요
          </h1>
          <p className="text-sm text-sky-900/78">
            코치로 들어갈지, 선수로 들어갈지 선택합니다.
          </p>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-sky-800/70">
            <button
              type="button"
              onClick={toggleAdmin}
              className={`rounded-full border px-2 py-0.5 ${
                adminMode
                  ? "border-amber-500 bg-amber-100 text-amber-900"
                  : "border-sky-300 bg-sky-50 text-sky-800"
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
              onClick={() => void openAdminCoachPicker(false)}
              className="group rounded-xl border-2 border-sky-200 bg-sky-50/80 px-6 py-5 flex flex-col gap-2 text-left transition hover:border-sky-400 hover:bg-sky-100/90"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 group-hover:text-sky-800">
                Coach
              </span>
              <span className="text-xl font-bold text-slate-900">코치</span>
              <span className="text-sm text-sky-900/70">
                관리자 PIN으로 등록된 전체 팀을 고른 뒤 입장합니다. 다른 팀을 보려면 다시 이 화면의 팀 선택으로 돌아오세요.
              </span>
            </button>
          ) : (
            <Link
              href="/coach"
              className="group rounded-xl border-2 border-sky-200 bg-sky-50/80 px-6 py-5 flex flex-col gap-2 transition hover:border-sky-500 hover:bg-white"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 group-hover:text-sky-800">
                Coach
              </span>
              <span className="text-xl font-bold text-slate-900">코치</span>
              <span className="text-sm text-sky-900/70">
                팀·선수·일정·과제·공지·전술을 관리합니다.
              </span>
            </Link>
          )}
          <Link
            href="/login"
            className="group rounded-xl border-2 border-sky-200 bg-sky-50/80 px-6 py-5 flex flex-col gap-2 transition hover:border-sky-500 hover:bg-white"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 group-hover:text-sky-800">
              Player
            </span>
            <span className="text-xl font-bold text-slate-900">선수</span>
            <span className="text-sm text-sky-900/70">
              개인 번호·비밀번호로 로그인 후 내 일정·과제를 확인합니다.
            </span>
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
            <p className="mb-3 text-[11px] text-slate-400 leading-relaxed">
              DB에 등록된 팀{" "}
              <span className="font-semibold text-slate-200">{teams.length}</span>개입니다. 팀을 고른 뒤 입장하면{" "}
              <span className="text-amber-200/90">해당 팀 데이터만</span> 대시보드·선수 화면에 표시됩니다.
              {selectedTeamId !== "all" && (
                <>
                  {" "}
                  선택 팀 선수{" "}
                  <span className="font-semibold text-slate-200">{players.length}</span>명
                </>
              )}
            </p>
            <p className="mb-3 text-[10px] text-slate-500 leading-relaxed">
              선수 행「계정 삭제」는 로그인(개인 번호·비밀번호)까지 제거합니다. 팀 행「팀 삭제」는 팀 DB를 지우며,
              필요 시 두 번째 확인에서 코치 사이트 이메일 계정을 함께 지울 수 있습니다.
            </p>

            {pickerError && (
              <p className="mb-3 rounded-md border border-rose-700/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                {pickerError}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 min-h-[220px]">
                <p className="mb-2 text-xs font-semibold text-slate-300">팀 목록 (팀 데이터 / 코치 계정)</p>
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
                            {deletingTeamId === t.id ? "삭제중..." : "팀 삭제"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 min-h-[220px]">
                <p className="mb-2 text-xs font-semibold text-slate-300">선수 목록 (계정 삭제)</p>
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
                          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-200">{p.name}</p>
                            <p className="truncate text-[10px] text-slate-400">
                              {teamName}
                              {p.position ? ` · ${p.position}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePlayer(p)}
                            disabled={deletingPlayerId === p.id}
                            className="shrink-0 rounded-md border border-rose-700/70 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingPlayerId === p.id ? "삭제중..." : "계정 삭제"}
                          </button>
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
