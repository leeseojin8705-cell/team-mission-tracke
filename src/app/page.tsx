"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const roles = [
  {
    id: "coach",
    label: "코치로 시작하기",
    description: "팀·선수·일정·과제를 관리하는 코치 대시보드로 이동합니다.",
    href: "/coach",
  },
  {
    id: "player",
    label: "선수로 시작하기",
    description: "오늘 일정과 내 과제를 확인하는 선수 대시보드로 이동합니다.",
    href: "/player",
  },
];

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    try {
      const storedRole = window.localStorage.getItem("tmt:lastRole");
      const storedPlayer = window.localStorage.getItem("tmt:lastPlayerId");

      if (storedRole === "coach") {
        router.replace("/coach");
      } else if (storedRole === "player") {
        // 선수일 때는 우선 /player로 보내고, 내부에서 lastPlayerId를 활용
        router.replace("/player");
      }
    } catch {
      // localStorage가 없어도 조용히 무시
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl p-8 md:p-10 space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="text-2xl md:text-3xl font-bold">
            어떤 역할로 사용할까요?
          </h1>
          <p className="text-sm md:text-base text-slate-300">
            지금은 로그인 없이 역할만 선택해서 들어가는 1차 버전입니다. 이후에
            계정/권한 시스템을 추가해도 이 구조를 그대로 확장할 수 있습니다.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <a
              key={role.id}
              href={role.href}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 flex flex-col gap-2 transition hover:border-emerald-400/80 hover:bg-slate-900"
            >
              <span className="text-sm font-semibold text-emerald-300 group-hover:text-emerald-200">
                {role.id === "coach" ? "Coach" : "Player"}
              </span>
              <span className="text-lg font-semibold">{role.label}</span>
              <span className="text-sm text-slate-300">{role.description}</span>
            </a>
          ))}
        </section>

        <p className="text-xs text-slate-400">
          2차 버전에서는 여기에서 이메일/비밀번호 또는 소셜 로그인을 붙이고,
          역할은 계정에 따라 자동으로 선택되도록 확장할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
