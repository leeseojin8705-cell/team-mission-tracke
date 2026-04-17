"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import {
  installCoachAdminFetchInterceptor,
  syncAdminPinCookieFromSession,
} from "@/lib/coachAdminFetch";
import { CoachAppChrome } from "./CoachAppChrome";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

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

  // 관리자 모드일 때는 자식 페이지 fetch보다 먼저 인터셉터를 설치한다.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("tmt:adminMode") !== "on") return;
    } catch {
      return;
    }
    syncAdminPinCookieFromSession();
    return installCoachAdminFetchInterceptor();
  }, []);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-400 via-sky-300 to-cyan-200 text-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/60 bg-white/95 p-6 text-center shadow-lg shadow-sky-900/10">
          <p className="text-xs font-semibold text-[#00aeef]">
            TEAM MISSION TRACKER
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">코치 전용 화면</h1>
          <p className="text-xs text-slate-600">
            코치/구단 계정으로 로그인하면 팀 관리 화면에 접근할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login/coach")}
            className="w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            코치 로그인으로 이동
          </button>
          <Link
            href="/"
            className="block text-xs text-slate-500 hover:text-sky-800 text-center"
          >
            ← 역할 선택으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-sky-300 to-cyan-100 text-slate-600 flex items-center justify-center text-sm">
          로딩…
        </div>
      }
    >
      <CoachAppChrome isOwner={isOwner}>
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
              로딩…
            </div>
          }
        >
          {children}
        </Suspense>
      </CoachAppChrome>
    </Suspense>
  );
}
