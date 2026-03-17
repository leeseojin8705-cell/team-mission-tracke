"use client";

import FootballTacticsAnalyzer, {
  type AnalysisEventsData,
} from "@/components/FootballTacticsAnalyzer";
import { useCallback, useRef, useState } from "react";

export default function CoachAnalysisDataPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [matchDate, setMatchDate] = useState("");
  const [matchName, setMatchName] = useState("");
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const eventsRef = useRef<AnalysisEventsData>({
    atk: [],
    def: [],
    pass: [],
    gk: [],
  });

  const handleAnalyzerChange = useCallback((data: AnalysisEventsData) => {
    eventsRef.current = data;
  }, []);

  const openModal = useCallback(() => {
    setError(null);
    setSaved(false);
    const today = new Date().toISOString().slice(0, 10);
    setMatchDate(today);
    setMatchName("");
    setResult("");
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!matchDate.trim()) {
      setError("날짜를 입력하세요.");
      return;
    }
    if (!matchName.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchDate: new Date(matchDate).toISOString(),
          matchName: matchName.trim(),
          result: result.trim() || undefined,
          events: eventsRef.current,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }
      setSaved(true);
      setTimeout(() => {
        setModalOpen(false);
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }, [matchDate, matchName, result]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            전술 데이터
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            경기장에서 기록한 뒤 저장 버튼으로 날짜·이름·결과를 입력해 저장하세요.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            선수 개인 데이터는 기록관에서 경기 선택 후 「선수별」로 불러와 확인할 수 있으며, 선수가 개인 전술 데이터에서 보낸 내용과 연동됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="shrink-0 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          저장
        </button>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
        <div className="min-w-0 w-full max-w-4xl">
          <FootballTacticsAnalyzer
            onChange={handleAnalyzerChange}
            showHalfToggle={true}
          />
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="save-modal-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-700/80 px-5 py-4">
              <h2 id="save-modal-title" className="text-base font-semibold text-slate-100">
                저장
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                날짜·이름·결과를 입력한 뒤 저장하세요.
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              {error && (
                <p className="rounded-lg border border-rose-800/80 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              )}
              {saved && (
                <p className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                  저장되었습니다.
                </p>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="save-date" className="mb-1.5 block text-xs font-medium text-slate-400">
                    날짜
                  </label>
                  <input
                    id="save-date"
                    type="date"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label htmlFor="save-name" className="mb-1.5 block text-xs font-medium text-slate-400">
                    이름
                  </label>
                  <input
                    id="save-name"
                    type="text"
                    value={matchName}
                    onChange={(e) => setMatchName(e.target.value)}
                    placeholder="경기명 / 상대팀"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label htmlFor="save-result" className="mb-1.5 block text-xs font-medium text-slate-400">
                    결과 <span className="font-normal text-slate-600">(선택)</span>
                  </label>
                  <input
                    id="save-result"
                    type="text"
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    placeholder="예: 2-1 승"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-slate-700/80 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !matchDate || !matchName.trim()}
                className="flex-1 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
