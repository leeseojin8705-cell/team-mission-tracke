"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const roles = [
  {
    id: "coach",
    label: "코치",
    description: "팀·선수·일정·과제·공지·전술을 관리합니다.",
    href: "/coach",
  },
  {
    id: "player",
    label: "선수",
    description: "개인 번호·비밀번호로 로그인 후 내 일정·과제를 확인합니다.",
    href: "/login",
  },
];

export default function Home() {
  const [adminMode, setAdminMode] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tmt:adminMode");
      setAdminMode(v === "on");
    } catch {
      // ignore
    }
  }, []);

  function toggleAdmin() {
    setAdminMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("tmt:adminMode", next ? "on" : "off");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl p-8 md:p-10 space-y-8">
        <header className="text-center space-y-2">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="text-2xl md:text-3xl font-bold">
            역할을 선택하세요
          </h1>
          <p className="text-sm text-slate-400">
            코치로 들어갈지, 선수로 들어갈지 선택합니다.
          </p>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={toggleAdmin}
              className={`rounded-full border px-2 py-0.5 ${
                adminMode
                  ? "border-amber-500 bg-amber-500/15 text-amber-300"
                  : "border-slate-600 bg-slate-900 text-slate-400"
              }`}
            >
              관리자 모드 {adminMode ? "ON" : "OFF"}
            </button>
            <span className="hidden sm:inline">
              (개발/수정용 – 이 브라우저에서만 적용)
            </span>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {roles.map((role) => (
            <Link
              key={role.id}
              href={role.href}
              className="group rounded-xl border-2 border-slate-700 bg-slate-900/80 px-6 py-5 flex flex-col gap-2 transition hover:border-emerald-400 hover:bg-slate-800/60"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-emerald-400">
                {role.id === "coach" ? "Coach" : "Player"}
              </span>
              <span className="text-xl font-bold text-slate-100">{role.label}</span>
              <span className="text-sm text-slate-400">{role.description}</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
