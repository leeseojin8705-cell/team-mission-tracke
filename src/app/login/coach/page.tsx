"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CoachLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "로그인에 실패했습니다.");
        return;
      }
      setDone(true);

      // URL 에 초대 토큰이 있으면 수락 API 호출
      try {
        const params = new URLSearchParams(window.location.search);
        const invite = params.get("invite");
        if (invite) {
          await fetch("/api/coach/invitations/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: invite }),
          });
        }
      } catch {
        // 초대 수락 실패는 로그인 자체를 막지 않음
      }

      router.replace("/coach");
      router.refresh();
    } catch {
      setError("로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl p-8 space-y-6">
        <header className="text-center space-y-1">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="text-xl font-bold">코치 / 구단 로그인</h1>
          <p className="text-sm text-slate-400">
            회원가입에서 만든 이메일과 비밀번호로 로그인합니다.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              required
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {done && !error && (
            <p className="text-sm text-emerald-300">
              코치 로그인에 성공했습니다. 필요한 경우 초대가 자동으로 적용됩니다.
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>

        <div className="flex flex-col items-center gap-2 text-sm">
          <Link
            href="/signup"
            className="text-sky-400 hover:text-sky-300"
          >
            아직 계정이 없나요? 조직 생성 →
          </Link>
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-300"
          >
            ← 역할 선택으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}

