"use client";

import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";

export function PlayerChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-800/90 bg-slate-950/95 px-4 py-2.5 backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
          Team Mission Tracker · 선수
        </span>
        <LogoutButton variant="player" />
      </header>
      {children}
    </div>
  );
}
