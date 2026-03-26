"use client";

export default function GlobalLoading() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-emerald-400">
            TEAM MISSION TRACKER
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-100">로딩 중</h1>
        </div>
        <div className="relative h-12 w-12">
          <span className="absolute inset-0 rounded-full border-2 border-slate-700" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
        </div>
      </div>
    </main>
  );
}
