"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Team } from "@/lib/types";

type Category = "DAILY" | "SCHEDULE";
type AnnouncementType = "GAME" | "PRACTICE" | "REST" | "EDUCATION" | "OFFICIAL" | "OTHER";

type AnnouncementRow = {
  id: string;
  teamId: string;
  category: string;
  type: string;
  title: string;
  content: string | null;
  startAt: string;
  endAt: string | null;
  target: string | null;
  createdAt: string;
  updatedAt: string;
};

const CATEGORY_LABELS: Record<Category, string> = {
  DAILY: "일상 등록",
  SCHEDULE: "일정 등록",
};

const TYPE_LABELS: Record<AnnouncementType, string> = {
  GAME: "경기",
  PRACTICE: "연습",
  REST: "휴식",
  EDUCATION: "교육",
  OFFICIAL: "공식",
  OTHER: "기타",
};

function formatDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CoachAnnouncementsPage() {
  const searchParams = useSearchParams();
  const paramTeamId = (searchParams.get("teamId") ?? "").trim();

  const [teams, setTeams] = useState<Team[]>([]);
  const [list, setList] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<Category>("DAILY");
  const [type, setType] = useState<AnnouncementType>("OTHER");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [periodKind, setPeriodKind] = useState<"single" | "range">("single");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [teamId, setTeamId] = useState("");

  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const teamOptions = useMemo(
    () => teams.map((t) => ({ id: t.id, name: t.name })),
    [teams],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const teamQs = paramTeamId
          ? `?contextTeamId=${encodeURIComponent(paramTeamId)}`
          : "";
        const annQs = paramTeamId
          ? `?teamId=${encodeURIComponent(paramTeamId)}`
          : "";
        const [teamsRes, annRes] = await Promise.all([
          fetch(`/api/teams${teamQs}`),
          fetch(`/api/announcements${annQs}`),
        ]);

        const teamsData = await teamsRes.json();
        const annData = await annRes.json();

        if (!teamsRes.ok) {
          const msg = (teamsData as { error?: string })?.error ?? "팀 목록을 불러오지 못했습니다.";
          throw new Error(msg);
        }
        if (!annRes.ok) {
          const msg = (annData as { error?: string })?.error ?? "공지 목록을 불러오지 못했습니다.";
          throw new Error(msg);
        }

        if (!cancelled) {
          const raw = Array.isArray(teamsData) ? (teamsData as Team[]) : [];
          const scoped = paramTeamId
            ? raw.filter((t) => t.id === paramTeamId)
            : raw;
          setTeams(scoped);
          setList(Array.isArray(annData) ? annData : []);
          setTeamId(() => {
            if (paramTeamId && scoped.some((t) => t.id === paramTeamId)) {
              return paramTeamId;
            }
            return scoped[0]?.id ?? "";
          });
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [paramTeamId]);

  const visibleList = useMemo(() => {
    if (filterTeamId === "all") return list;
    return list.filter((a) => a.teamId === filterTeamId);
  }, [list, filterTeamId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !teamId) {
      setError("제목과 대상 팀을 입력해 주세요.");
      return;
    }
    const start = startAt ? new Date(startAt).toISOString() : new Date().toISOString();
    const end = periodKind === "range" && endAt ? new Date(endAt).toISOString() : null;

    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/announcements/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            type,
            title: title.trim(),
            content: content.trim() || null,
            startAt: start,
            endAt: end,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "수정에 실패했습니다.");
        }
        const updated = (await res.json()) as AnnouncementRow;
        setList((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setEditingId(null);
      } else {
        const res = await fetch("/api/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            category,
            type,
            title: title.trim(),
            content: content.trim() || null,
            startAt: start,
            endAt: end,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "등록에 실패했습니다.");
        }
        const created = (await res.json()) as AnnouncementRow;
        setList((prev) => [created, ...prev]);
      }
      setTitle("");
      setContent("");
      setStartAt("");
      setEndAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(a: AnnouncementRow) {
    setEditingId(a.id);
    setCategory(a.category as Category);
    setType(a.type as AnnouncementType);
    setTitle(a.title);
    setContent(a.content ?? "");
    setTeamId(a.teamId);
    setStartAt(a.startAt.slice(0, 16));
    setEndAt(a.endAt ? a.endAt.slice(0, 16) : "");
    setPeriodKind(a.endAt ? "range" : "single");
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setStartAt("");
    setEndAt("");
  }

  async function handleDelete(id: string) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제에 실패했습니다.");
      setList((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">공지 등록</h2>
        <p className="text-sm text-slate-300">
          일상 등록은 게시판에, 일정 등록은 캘린더에 반영됩니다. 공지 유형과 기간을 선택한 뒤 등록하세요.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-600/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm"
      >
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            공지 분류
          </div>
          <div className="flex gap-2">
            {(["DAILY", "SCHEDULE"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  category === c
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            공지 유형
          </div>
          <div className="flex flex-wrap gap-2">
            {(["GAME", "PRACTICE", "REST", "EDUCATION", "OFFICIAL", "OTHER"] as const).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    type === t
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ),
            )}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">공지 제목 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              placeholder="공지 제목"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">공지 대상 (팀) *</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              disabled={!!editingId}
            >
              <option value="">팀 선택</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">공지 내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            placeholder="일정 등록은 캘린더에, 일상 등록은 게시판에 등록됩니다."
          />
        </div>

        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            기간 등록
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriodKind("single")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                periodKind === "single"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-800 text-slate-300"
              }`}
            >
              하루 선택
            </button>
            <button
              type="button"
              onClick={() => setPeriodKind("range")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                periodKind === "range"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-800 text-slate-300"
              }`}
            >
              기간 선택
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">
                {periodKind === "single" ? "날짜·시간" : "시작일시"}
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
            {periodKind === "range" && (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">종료일시</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || teamOptions.length === 0}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting ? "저장 중…" : editingId ? "공지 수정" : "공지 등록"}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>팀 필터</span>
        <select
          value={filterTeamId}
          onChange={(e) => setFilterTeamId(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 outline-none focus:border-emerald-400"
        >
          <option value="all">전체</option>
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span>표시: {visibleList.length}개 / 총 {list.length}개</span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      ) : visibleList.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-500">
          등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleList.map((a) => {
            const team = teams.find((t) => t.id === a.teamId);
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-100">{a.title}</p>
                  <p className="text-xs text-slate-400">
                    {CATEGORY_LABELS[a.category as Category]} · {TYPE_LABELS[a.type as AnnouncementType]}
                    {team && ` · ${team.name}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDatetime(a.startAt)}
                    {a.endAt && ` ~ ${formatDatetime(a.endAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="rounded-md border border-rose-600 px-2 py-1 text-xs text-rose-200 hover:bg-rose-950"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
