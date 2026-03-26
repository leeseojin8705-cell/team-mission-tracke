"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TaskBlueprintEditor,
  type TaskBlueprintDraft,
} from "@/components/TaskBlueprintEditor";
import type { Player, TaskCategory, TeamStaff } from "@/lib/types";

type PlayerSession = {
  session?: {
    role: "player" | "coach";
    playerId?: string;
  };
};

const categoryOptions: TaskCategory[] = ["기술", "체력", "멘탈", "전술"];

export default function NewPlayerTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("멘탈");
  const [contentTags, setContentTags] = useState<string[]>([]);
  const [detailText, setDetailText] = useState("");
  const [goalText, setGoalText] = useState("");
  const [htmlTaskType, setHtmlTaskType] = useState<"single" | "daily">("single");
  const [singleDate, setSingleDate] = useState("");
  const [dailyStart, setDailyStart] = useState("");
  const [dailyEnd, setDailyEnd] = useState("");
  const [weekdaySet, setWeekdaySet] = useState<Set<string>>(new Set());
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamStaff, setTeamStaff] = useState<TeamStaff[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [affiliationName, setAffiliationName] = useState<string | null>(null);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(
    new Set(),
  );

  const blueprintDraftRef = useRef<TaskBlueprintDraft>({});
  const onBlueprintDraft = useCallback((d: TaskBlueprintDraft) => {
    blueprintDraftRef.current = d;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      try {
        setError(null);
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
        const playerId =
          sessionData.session?.role === "player" ? sessionData.session.playerId ?? null : null;
        if (!playerId) return;

        const playerRes = await fetch(`/api/players/${encodeURIComponent(playerId)}`);
        if (!playerRes.ok) return;
        const player = (await playerRes.json()) as { teamId?: string | null };
        const teamId = player.teamId;
        if (!teamId) {
          setAffiliationName(null);
          return;
        }

        const teamMetaRes = await fetch(`/api/teams/${encodeURIComponent(teamId)}`);
        if (teamMetaRes.ok) {
          const tm = (await teamMetaRes.json()) as { name?: string };
          if (!cancelled && tm?.name) setAffiliationName(tm.name);
        }

        const staffRes = await fetch(`/api/teams/${encodeURIComponent(teamId)}/staff`);
        const playersRes = await fetch(`/api/players?teamId=${encodeURIComponent(teamId)}`);
        if (!staffRes.ok) return;
        const staffList = (await staffRes.json()) as TeamStaff[];
        const playersList = playersRes.ok
          ? ((await playersRes.json()) as Player[])
          : [];
        if (!cancelled) {
          setTeamStaff(staffList);
          setTeamPlayers(playersList);
        }
      } catch {
        if (!cancelled) {
          setTeamStaff([]);
          setTeamPlayers([]);
        }
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setSaving(true);
      setError(null);

      const sessionRes = await fetch("/api/auth/session");
      const sessionData = (await sessionRes.json().catch(() => ({}))) as PlayerSession;
      const playerId =
        sessionData.session?.role === "player" ? sessionData.session.playerId ?? null : null;
      if (!playerId) throw new Error("선수 로그인 정보가 없습니다. 다시 로그인해 주세요.");

      const bp = blueprintDraftRef.current;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          dueDate:
            htmlTaskType === "single"
              ? singleDate || undefined
              : dailyEnd || singleDate || undefined,
          targetType: "player",
          targetId: playerId,
          details: {
            htmlTaskType,
            htmlCategory: "selfcare",
            // 개인 과제도 코치 과제와 동일한 축을 사용해 나중에 분석 가능하도록 저장
            contentCategory:
              (contentTags[0] as
                | "기술"
                | "신체"
                | "전술"
                | "심리"
                | "인지"
                | "태도") ?? undefined,
            contents: contentTags.length ? contentTags : undefined,
            detailText: detailText || undefined,
            goalText: goalText || undefined,
            singleDate: htmlTaskType === "single" ? singleDate || undefined : undefined,
            dailyStart: htmlTaskType === "daily" ? dailyStart || undefined : undefined,
            dailyEnd: htmlTaskType === "daily" ? dailyEnd || undefined : undefined,
            weekdays:
              htmlTaskType === "daily" && weekdaySet.size
                ? Array.from(weekdaySet)
                : undefined,
            timeStart: timeStart || undefined,
            timeEnd: timeEnd || undefined,
            evaluators:
              selectedEvaluatorIds.size > 0
                ? Array.from(selectedEvaluatorIds)
                : undefined,
            // 전술·포메이션·미니 필드·과제 줄 (코치 과제와 동일 스키마)
            ...bp,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "과제를 생성하지 못했습니다.");
      }

      router.push("/player/tasks");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/player/tasks"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 내 과제
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-slate-100">개인 과제 만들기</h1>
        {affiliationName && (
          <p className="text-sm font-medium text-emerald-200/90">
            소속: <span className="text-emerald-100">{affiliationName}</span>
          </p>
        )}
        <p className="text-sm text-slate-400">
          코치와 관계없이 나만의 개인 과제를 만들어 관리할 수 있습니다. 반복 과제(루틴)와
          특정 하루짜리 과제 둘 중에서 선택할 수 있어요.
        </p>

        {error && (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-sm"
        >
          {/* 과제 유형: 단일 / 매일 */}
          <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              과제 유형
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setHtmlTaskType("single")}
                className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                  htmlTaskType === "single"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-950"
                }`}
              >
                <div className="text-sm font-semibold text-slate-100">단일 과제</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  시험, 경기, 특정 하루에만 하는 과제
                </p>
              </button>
              <button
                type="button"
                onClick={() => setHtmlTaskType("daily")}
                className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                  htmlTaskType === "daily"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-950"
                }`}
              >
                <div className="text-sm font-semibold text-slate-100">매일/반복 과제</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  일정 기간 동안 매일/특정 요일에 반복하는 루틴
                </p>
              </button>
            </div>
          </section>

          <div>
            <label className="mb-1 block text-xs text-slate-300">
              과제 제목 <span className="text-rose-400">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              placeholder="예: 하루 물 2리터 마시기"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">과제 분류</label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    category === cat
                      ? "border-emerald-500 bg-emerald-500 text-slate-950"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-400"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">
              과제 내용 / 태그 <span className="text-slate-500">(중복 선택 가능)</span>
            </label>
            <p className="mb-1 text-[11px] text-slate-500">
              이 과제가 어떤 성격에 가까운지 선택해 두면, 나중에 코치 과제와 함께 분석할 때
              도움이 됩니다.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {["기술", "신체", "전술", "심리", "인지", "태도"].map((label) => {
                const id = label;
                const on = contentTags.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setContentTags((prev) =>
                        prev.includes(id)
                          ? prev.filter((v) => v !== id)
                          : [...prev, id],
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 font-medium transition ${
                      on
                        ? "border-emerald-500 bg-emerald-500 text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 이 과제를 평가/점검해 줄 코치 선택 */}
          <div>
            <label className="mb-1 block text-xs text-slate-300">
              개인 평가 요청할 코치/스태프{" "}
              <span className="text-slate-500">(선택 사항, 중복 선택 가능)</span>
            </label>
            <p className="mb-1 text-[11px] text-slate-500">
              이 과제에 대해 피드백이나 점검을 받고 싶은 코치·프론트 스태프를 선택하세요. 선택된
              인원은 코치 화면에서 이 개인 과제를 함께 볼 수 있습니다.
            </p>
            {teamStaff.length === 0 ? (
              <p className="text-[11px] text-slate-600">
                아직 소속 팀 정보나 코칭 스태프가 등록되지 않았습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {teamStaff.map((s) => {
                  const on = selectedEvaluatorIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedEvaluatorIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 transition ${
                        on
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.role && (
                        <span className="ml-1 text-[10px] text-slate-400">{s.role}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {htmlTaskType === "single" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">일자</label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">시작 시간</label>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">종료 시간</label>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </div>
          ) : (
            <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                기간 · 요일 · 시간
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">시작 날짜</label>
                  <input
                    type="date"
                    value={dailyStart}
                    onChange={(e) => setDailyStart(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">종료 날짜</label>
                  <input
                    type="date"
                    value={dailyEnd}
                    onChange={(e) => setDailyEnd(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <span>요일</span>
                {["일", "월", "화", "수", "목", "금", "토"].map((label, idx) => {
                  const key = String(idx);
                  const on = weekdaySet.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setWeekdaySet((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className={`min-w-[2rem] rounded-full border px-2 py-0.5 text-center ${
                        on
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-400"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">시작 시간</label>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">종료 시간</label>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </section>
          )}

          <div>
            <label className="mb-1 block text-xs text-slate-300">세부 과제</label>
            <textarea
              value={detailText}
              onChange={(e) => setDetailText(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              placeholder="무엇을 어떻게 할지 구체적으로 적어 보세요."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">과제 목표</label>
            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              placeholder="이 과제를 통해 달성하고 싶은 목표를 적어 보세요."
            />
          </div>

          <TaskBlueprintEditor
            onDraftChange={onBlueprintDraft}
            candidatePlayers={teamPlayers}
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "생성 중…" : "개인 과제 만들기"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

