"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";

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

export function CoachAppChrome({
  children,
  isOwner,
}: {
  children: ReactNode;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamIdParam = searchParams.get("teamId");
  const [contextTeamName, setContextTeamName] = useState<string | null>(null);

  useEffect(() => {
    if (!teamIdParam) {
      setContextTeamName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teams/${teamIdParam}`);
        if (!res.ok) {
          if (!cancelled) setContextTeamName(null);
          return;
        }
        const data = (await res.json()) as { name?: string };
        if (!cancelled && data.name) setContextTeamName(data.name);
      } catch {
        if (!cancelled) setContextTeamName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamIdParam]);

  const withTeam = (href: string) =>
    teamIdParam ? `${href}?teamId=${encodeURIComponent(teamIdParam)}` : href;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="w-48 shrink-0 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="space-y-0.5 border-b border-slate-800 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Team Mission Tracker
            </p>
            <h1 className="text-lg font-semibold leading-snug text-slate-100">
              {contextTeamName ?? "코치"}
            </h1>
            {contextTeamName && (
              <p className="text-[11px] text-slate-500">코치 화면</p>
            )}
          </div>

          <nav className="space-y-0.5 text-sm">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/coach" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={withTeam(item.href)}
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

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <LogoutButton variant="coach" />
            <Link
              href="/"
              className="block rounded-lg px-3 py-2 text-center text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            >
              ← 역할 선택
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
