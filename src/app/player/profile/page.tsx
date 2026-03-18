"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Player, Team } from "@/lib/types";

export default function PlayerProfilePage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [form, setForm] = useState({
    photo: "",
    height: "",
    weight: "",
    phone: "",
    parentPhone: "",
    address: "",
    school: "",
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [newLoginId, setNewLoginId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setSaveError(null);
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json().catch(() => ({}));
        const playerId: string | null =
          sessionData?.session?.role === "player" ? sessionData.session.playerId : null;
        if (!playerId) {
          setSaveError("로그인 정보가 없습니다. 다시 로그인해 주세요.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/players/${playerId}`);
        if (!res.ok) {
          setSaveError("선수 정보를 불러오지 못했습니다.");
          setLoading(false);
          return;
        }
        const p: Player & {
          parentPhone?: string | null;
          address?: string | null;
          school?: string | null;
        } = await res.json();

        if (!cancelled) {
          setPlayer(p);
          setForm({
            photo: p.photo ?? "",
            height: p.height ?? "",
            weight: p.weight ?? "",
            phone: p.phone ?? "",
            parentPhone: p.parentPhone ?? "",
            address: p.address ?? "",
            school: p.school ?? "",
          });
          setNewLoginId(p.loginId ?? "");

          fetch(`/api/teams?teamId=${encodeURIComponent(p.teamId)}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((ts: Team[]) => {
              if (!cancelled) setTeam(ts[0] ?? null);
            })
            .catch(() => {});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo: form.photo || null,
          height: form.height || null,
          weight: form.weight || null,
          phone: form.phone || null,
          parentPhone: form.parentPhone || null,
          address: form.address || null,
          school: form.school || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword !== newPassword2) {
      setPwError("새 비밀번호가 서로 다릅니다.");
      return;
    }
    setPwSaving(true);
    setPwError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, newLoginId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "비밀번호 변경에 실패했습니다.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <p className="text-xs text-emerald-400">PLAYER</p>
          <h1 className="text-2xl font-semibold">내 정보</h1>
          {player && (
            <p className="text-sm text-slate-400">
              {player.name} / {team?.name ?? "팀 정보 없음"}
            </p>
          )}
        </header>

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중입니다...</p>
        ) : !player ? (
          <p className="text-sm text-rose-300">{saveError ?? "선수 정보를 찾을 수 없습니다."}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
              <h2 className="text-lg font-semibold">개인 정보</h2>
              {saveError && <p className="text-sm text-rose-300">{saveError}</p>}
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">키 (cm)</label>
                    <input
                      value={form.height}
                      onChange={(e) => setForm((p) => ({ ...p, height: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">체중 (kg)</label>
                    <input
                      value={form.weight}
                      onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">내 전화번호</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">학부모 전화번호</label>
                    <input
                      value={form.parentPhone}
                      onChange={(e) => setForm((p) => ({ ...p, parentPhone: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-slate-400">주소</label>
                    <input
                      value={form.address}
                      onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-slate-400">학교 / 소속</label>
                    <input
                      value={form.school}
                      onChange={(e) => setForm((p) => ({ ...p, school: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">사진 업로드</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setSaveError(null);
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch("/api/upload/player-photo", {
                          method: "POST",
                          body: fd,
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || !data.url) {
                          throw new Error(data.error ?? "업로드에 실패했습니다.");
                        }
                        setForm((p) => ({ ...p, photo: data.url as string }));
                      } catch (err) {
                        setSaveError(
                          err instanceof Error ? err.message : "사진 업로드에 실패했습니다.",
                        );
                      }
                    }}
                    className="w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-600"
                  />
                  {form.photo && (
                    <div className="mt-2 flex justify-center">
                      <img
                        src={form.photo}
                        alt=""
                        className="max-h-32 rounded-lg border border-slate-600 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "개인 정보 저장"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
              <h2 className="text-lg font-semibold">로그인 정보</h2>
              {pwError && <p className="text-sm text-rose-300">{pwError}</p>}
              <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">개인 번호 (아이디)</label>
                  <input
                    type="text"
                    value={newLoginId}
                    onChange={(e) => setNewLoginId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                  <p className="text-[11px] text-slate-500">
                    아이디를 비워두면 현재 아이디를 그대로 사용합니다.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">현재 비밀번호</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">새 비밀번호</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="mt-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-slate-600 disabled:opacity-50"
                >
                  {pwSaving ? "변경 중…" : "비밀번호 변경"}
                </button>
              </form>
            </section>

            <Link href="/player" className="text-sm text-slate-400 hover:text-slate-200">
              ← 대시보드로 돌아가기
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

