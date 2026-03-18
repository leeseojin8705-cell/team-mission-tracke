"use client";

import { useEffect, useState } from "react";

type Invitation = {
  id: string;
  token: string;
  email?: string | null;
  roleLabel: string;
  teamId?: string | null;
  createdAt: string;
  usedAt?: string | null;
};

export default function CoachInvitationsPage() {
  const [list, setList] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [roleLabel, setRoleLabel] = useState("coach");
  const [teamId, setTeamId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/coach/invitations", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "초대 목록을 불러오지 못했습니다.");
          return;
        }
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("초대 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/coach/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          roleLabel: roleLabel.trim() || "coach",
          teamId: teamId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "초대 생성에 실패했습니다.");
        return;
      }
      setList((prev) => [data as Invitation, ...prev]);
      setEmail("");
    } catch {
      setError("초대 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login/coach?invite=`
      : "/login/coach?invite=";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">코치 / 스태프 초대</h1>
          <p className="text-sm text-slate-400">
            초대 링크를 생성해 코치나 스태프에게 전달할 수 있습니다. 지금은 토큰 발급과
            관리까지만 지원하며, 실제 계정 연결 로직은 이후 단계에서 확장할 수 있습니다.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-slate-100">새 초대 링크 생성</h2>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,auto]">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">이메일 (선택)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="초대할 코치 이메일"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">역할 라벨</label>
              <input
                type="text"
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">팀 ID (선택)</label>
              <input
                type="text"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="특정 팀에만 연결할 경우"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {creating ? "생성 중…" : "초대 생성"}
              </button>
            </div>
          </form>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">초대 링크 목록</h2>
          {loading ? (
            <p className="text-sm text-slate-400">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-400">아직 생성된 초대가 없습니다.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {list.map((inv) => {
                const url = `${baseUrl}${encodeURIComponent(inv.token)}`;
                return (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-100">
                          {inv.email || "이메일 미지정"} · {inv.roleLabel}
                        </p>
                        <p className="text-slate-400">
                          링크: <span className="text-slate-300 break-all">{url}</span>
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        생성: {inv.createdAt.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

