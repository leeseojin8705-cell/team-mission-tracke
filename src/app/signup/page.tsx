"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [season, setSeason] = useState("2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, organizationName, season }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        setError(
          "서버에 연결되지 않았습니다. 사이트 주소와 호스팅 설정을 확인해 주세요.",
        );
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "회원가입에 실패했습니다.");
        return;
      }

      const loginRes = await fetch("/api/auth/login-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (loginRes.ok) {
        router.replace("/coach");
        return;
      }
      setDone(true);
    } catch {
      setError("회원가입 처리 중 오류가 발생했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl p-8 space-y-6">
        <header className="space-y-1 text-center">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="text-xl font-bold">구단 / 팀 소유자 회원가입</h1>
          <p className="text-sm text-slate-400">
            가입이 완료되면 바로 코치 화면으로 이동합니다. 테스트용으로 만든 팀은 홈의
            관리자 모드에서 삭제할 수 있습니다.
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
            <label className="text-xs text-slate-400">비밀번호 (6자 이상)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">조직 / 팀 이름</label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="예: FC 예시 아카데미"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">시즌 이름</label>
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="예: 2026 시즌"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}
          {done && (
            <p className="text-sm text-emerald-300">
              조직과 팀이 생성되었습니다.{" "}
              <Link href="/login/coach" className="underline underline-offset-2">
                코치 로그인
              </Link>
              에서 같은 이메일로 로그인해 주세요.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "처리 중…" : "가입하고 시작하기"}
          </button>
        </form>
      </div>
    </main>
  );
}

