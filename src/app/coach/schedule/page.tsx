"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Schedule, Team } from "@/lib/types";

export default function CoachSchedulePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [teamId, setTeamId] = useState("");

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

        const [teamsRes, schedulesRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/schedules"),
        ]);

        if (!teamsRes.ok || !schedulesRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, schedulesData]: [Team[], Schedule[]] =
          await Promise.all([teamsRes.json(), schedulesRes.json()]);

        if (!cancelled) {
          setTeams(teamsData);
          setItems(
            schedulesData.map((s) => ({
              ...s,
              // DateTime을 문자열로 변환해서 UI에 표시
              date:
                typeof s.date === "string"
                  ? s.date
                  : new Date(s.date as unknown as string).toISOString(),
            })),
          );
          if (!teamId && teamsData[0]) {
            setTeamId(teamsData[0].id);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDate("");
    setTeamId(teams[0]?.id ?? "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !teamId) return;

    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`/api/schedules/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            date,
            teamId,
          }),
        });

        if (!res.ok) {
          throw new Error("일정을 수정하지 못했습니다.");
        }

        const updated: Schedule = await res.json();
        setItems((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
      } else {
        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            date,
            teamId,
          }),
        });

        if (!res.ok) {
          throw new Error("일정을 저장하지 못했습니다.");
        }

        const created: Schedule = await res.json();
        setItems((prev) => [...prev, created]);
      }

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(item: Schedule) {
    setEditingId(item.id);
    setTitle(item.title);
    setDate(
      typeof item.date === "string"
        ? item.date
        : new Date(item.date as unknown as string).toISOString(),
    );
    setTeamId(item.teamId);
  }

  async function handleDelete(id: string) {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("일정을 삭제하지 못했습니다.");
      }

      setItems((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleItems = useMemo(
    () =>
      filterTeamId === "all"
        ? items
        : items.filter((s) => s.teamId === filterTeamId),
    [items, filterTeamId],
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">팀 일정 관리</h2>
        <p className="text-sm text-slate-300">
          Prisma + SQLite DB에 실제로 저장되는 팀 일정입니다.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="text-[11px]">팀 필터</span>
          <select
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
          >
            <option value="all">전체 팀</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[11px] text-slate-400">
          표시: {visibleItems.length}개 / 총 {items.length}개
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid md:grid-cols-[2fr,2fr,2fr,auto]"
      >
        <div className="space-y-1">
          <label className="text-xs text-slate-300">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            placeholder="예: 전술 훈련 / 연습 경기 vs ○○중"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">날짜/시간</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
          <p className="text-[10px] text-slate-400">
            브라우저에서 제공하는 달력/시간 선택기를 사용합니다.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">팀</label>
          {teamOptions.length === 0 ? (
            <div className="text-xs text-slate-400">
              먼저 팀 관리 화면에서 팀을 한 개 이상 등록해 주세요.
            </div>
          ) : (
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            >
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={submitting || teamOptions.length === 0}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting
              ? "저장 중..."
              : editingId
                ? "일정 수정"
                : "일정 추가"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            {editingId ? "취소" : "초기화"}
          </button>
        </div>
      </form>

      {error && (
        <p className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">날짜/시간</th>
              <th className="px-4 py-2 text-left">제목</th>
              <th className="px-4 py-2 text-left">팀</th>
              <th className="px-4 py-2 text-right">동작</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  일정 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  등록된 일정이 없습니다. 위 폼에서 일정을 추가해 보세요.
                </td>
              </tr>
            ) : (
              visibleItems.map((item) => {
                const team = teams.find((t) => t.id === item.teamId);
                return (
                  <tr key={item.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">
                      {typeof item.date === "string"
                        ? item.date
                        : new Date(item.date as unknown as string).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{item.title}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {team?.name ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="rounded-md border border-rose-600 px-2 py-1 text-rose-200 hover:bg-rose-950"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

