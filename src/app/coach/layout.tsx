"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/coach", label: "대시보드" },
  { href: "/coach/teams", label: "팀" },
  { href: "/coach/players", label: "선수" },
  { href: "/coach/schedule", label: "일정" },
  { href: "/coach/announcements", label: "공지" },
  { href: "/coach/tasks", label: "과제" },
  { href: "/coach/analysis/data", label: "전술 데이터" },
  { href: "/coach/analysis/archive", label: "기록관" },
];

const ownerNavItems = [
  { href: "/coach/settings", label: "조직 / 팀 설정" },
  { href: "/coach/invitations", label: "코치 초대" },
];

export default function CoachLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [teamIdParam, setTeamIdParam] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setTeamIdParam(q.get("teamId"));
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        window.localStorage.setItem("tmt:lastRole", "coach");

        // 관리자 모드가 켜져 있으면 세션 없이도 통과 (개발용)
        const admin = window.localStorage.getItem("tmt:adminMode");
        if (admin === "on") {
          setAuthorized(true);
          setIsOwner(true);
          return;
        }

        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          session?: { role?: string } | null;
        };
        if (cancelled) return;
        if (data.session?.role === "coach" || data.session?.role === "owner") {
          setAuthorized(true);
          const orgRes = await fetch("/api/coach/organizations/me", {
            cache: "no-store",
          });
          if (orgRes.ok) {
            const orgs = await orgRes.json();
            if (Array.isArray(orgs) && orgs.length > 0) {
              setIsOwner(true);
            }
          }
        } else {
          setAuthorized(false);
        }
      } catch {
        if (!cancelled) setAuthorized(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
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
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <p className="text-xs font-semibold text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="mt-1 text-lg font-semibold">코치 전용 화면</h1>
          <p className="text-xs text-slate-300">
            코치/구단 계정으로 로그인하면 팀 관리 화면에 접근할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login/coach")}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            코치 로그인으로 이동
          </button>
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
                  href={teamIdParam ? `${item.href}?teamId=${encodeURIComponent(teamIdParam)}` : item.href}
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
            {isOwner && (
              <>
                <div className="mt-3 border-t border-slate-800 pt-2 text-[11px] font-semibold text-slate-500">
                  조직 관리
                </div>
                {ownerNavItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/coach" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-xs transition ${
                        isActive
                          ? "bg-emerald-500/15 font-medium text-emerald-300"
                          : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}
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

