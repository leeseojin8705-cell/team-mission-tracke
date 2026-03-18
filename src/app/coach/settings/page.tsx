"use client";

import { useEffect, useState } from "react";

type OrgTeam = { id: string; name: string; season: string };
type Org = { id: string; name: string; teams: OrgTeam[] };

export default function CoachSettingsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/coach/organizations/me", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "조직 정보를 불러오지 못했습니다.");
          return;
        }
        if (!cancelled) setOrgs(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("조직 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">조직 / 팀 설정</h1>
          <p className="text-sm text-slate-400">
            현재 계정으로 생성한 조직과 팀 정보를 한눈에 볼 수 있습니다. 지금은 읽기 전용
            요약만 제공하며, 추후 플랜/결제에 맞춰 팀 추가/수정 기능을 확장할 수 있습니다.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-slate-400">
            아직 이 계정으로 생성된 조직이 없습니다. `/signup` 에서 조직을 먼저 생성해 주세요.
          </p>
        ) : (
          orgs.map((org) => (
            <section
              key={org.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-sm"
            >
              <div>
                <p className="text-xs text-slate-400">조직 이름</p>
                <p className="text-lg font-semibold text-slate-100">{org.name}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-400">소속 팀</p>
                {org.teams.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    아직 등록된 팀이 없습니다. (기본 1개 팀 생성 정책에 맞춰 추후 UI를
                    확장합니다.)
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {org.teams.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                      >
                        <span className="font-medium text-slate-100">{t.name}</span>
                        <span className="text-slate-400 text-[11px]">{t.season}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

