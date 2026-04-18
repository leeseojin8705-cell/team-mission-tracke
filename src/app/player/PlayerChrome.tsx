"use client";

import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import {
  installCoachAdminFetchInterceptor,
  syncAdminPinCookieFromSession,
} from "@/lib/coachAdminFetch";

export function PlayerChrome({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    syncAdminPinCookieFromSession();
    return installCoachAdminFetchInterceptor();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-400 via-sky-300 to-cyan-200 text-slate-900">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-white/50 bg-white/90 px-4 py-2.5 text-slate-800 shadow-sm shadow-sky-900/5 backdrop-blur-md">
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Team Mission Tracker · 선수
        </span>
        <LogoutButton variant="player" />
      </header>
      {children}
    </div>
  );
}
