"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/coach", label: "대시보드" },
  { href: "/coach/teams", label: "팀" },
  { href: "/coach/players", label: "선수" },
  { href: "/coach/schedule", label: "일정" },
  { href: "/coach/tasks", label: "과제" },
  { href: "/coach/analysis/data", label: "전술 데이터" },
  { href: "/coach/analysis/archive", label: "기록관" },
];

export default function CoachLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("tmt:lastRole", "coach");
      const saved = window.localStorage.getItem("tmt:coachCode") ?? "";
      const expected = process.env.NEXT_PUBLIC_COACH_ACCESS_CODE;

      if (!expected) {
        // 환경변수가 없으면 코드 없이 통과
        setAuthorized(true);
        return;
      }

      if (saved && saved === expected) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
      }
    } catch {
      // localStorage 실패는 무시
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_COACH_ACCESS_CODE;

    if (!expected) {
      setAuthorized(true);
      setError(null);
      return;
    }

    if (codeInput.trim() === expected) {
      try {
        window.localStorage.setItem("tmt:coachCode", codeInput.trim());
      } catch {
        // 저장 실패는 무시
      }
      setAuthorized(true);
      setError(null);
    } else {
      setError("접속 코드가 올바르지 않습니다.");
    }
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-emerald-400">
              TEAM MISSION TRACKER
            </p>
            <h1 className="text-lg font-semibold">코치 전용 화면</h1>
            <p className="text-xs text-slate-300">
              코치 접속 코드를 입력하면 팀 관리 화면에 접근할 수 있습니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-300">접속 코드</label>
              <input
                type="password"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              입장하기
            </button>
          </form>

          <Link
            href="/"
            className="block text-xs text-slate-400 hover:text-slate-200 text-center"
          >
            ← 역할 선택으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="w-48 shrink-0 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="space-y-0.5 border-b border-slate-800 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Team Mission Tracker
            </p>
            <h1 className="text-lg font-semibold text-slate-100">코치</h1>
          </div>

          <nav className="space-y-0.5 text-sm">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/coach" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 transition ${
                    isActive
                      ? "bg-emerald-500/15 font-medium text-emerald-300"
                      : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          >
            ← 역할 선택
          </Link>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

