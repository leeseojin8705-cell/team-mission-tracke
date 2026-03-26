"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { CoachAppChrome } from "./CoachAppChrome";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
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
