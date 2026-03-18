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
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
  const [scheduleSortOrder, setScheduleSortOrder] = useState<"dateAsc" | "dateDesc">("dateAsc");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [teamId, setTeamId] = useState("");

  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null);
  const [detailAnnouncements, setDetailAnnouncements] = useState<{ id: string; title: string; type: string; startAt: string; content: string | null }[]>([]);
  const [detailAbsences, setDetailAbsences] = useState<{ playerId: string; playerName: string; reasons: string[]; reasonText: string | null }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [announcements, setAnnouncements] = useState<{ id: string; teamId: string; title: string; type: string; startAt: string; endAt: string | null; content: string | null }[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

        const [teamsRes, schedulesRes, annRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/schedules"),
          fetch("/api/announcements"),
        ]);

        if (!teamsRes.ok || !schedulesRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, schedulesData, annData]: [Team[], Schedule[], unknown] =
          await Promise.all([
            teamsRes.json(),
            schedulesRes.json(),
            annRes.ok ? annRes.json() : Promise.resolve([]),
          ]);

        if (!cancelled) {
          setTeams(teamsData);
          setAnnouncements(Array.isArray(annData) ? annData : []);
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

  useEffect(() => {
    if (!detailSchedule) {
      setDetailAnnouncements([]);
      setDetailAbsences([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    const scheduleDate = new Date(
      typeof detailSchedule.date === "string"
        ? detailSchedule.date
        : (detailSchedule.date as unknown as string),
    );
    const dayStart = new Date(scheduleDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduleDate);
    dayEnd.setHours(23, 59, 59, 999);

    Promise.all([
      fetch(`/api/announcements?teamId=${encodeURIComponent(detailSchedule.teamId)}`),
      fetch(`/api/schedule-absence?scheduleId=${encodeURIComponent(detailSchedule.id)}`),
    ])
      .then(async ([annRes, absRes]) => {
        const [annJson, absJson] = await Promise.all([
          annRes.ok ? annRes.json() : [],
          absRes.ok ? absRes.json() : [],
        ]);
        const announcements = Array.isArray(annJson) ? annJson : [];
        const absences = Array.isArray(absJson) ? absJson : [];
        const onSameDay = announcements.filter((a: { startAt: string }) => {
          const d = new Date(a.startAt);
          return d >= dayStart && d <= dayEnd;
        });
        if (!cancelled) {
          setDetailAnnouncements(
            onSameDay.map((a: { id: string; title: string; type: string; startAt: string; content: string | null }) => ({
              id: a.id,
              title: a.title,
              type: a.type,
              startAt: a.startAt,
              content: a.content,
            })),
          );
          setDetailAbsences(
            absences.map((a: { player?: { name: string }; playerId: string; reasons: string[]; reasonText: string | null }) => ({
              playerId: a.playerId,
              playerName: a.player?.name ?? a.playerId,
              reasons: a.reasons ?? [],
              reasonText: a.reasonText,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailAnnouncements([]);
          setDetailAbsences([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [detailSchedule]);

  const visibleItems = useMemo(() => {
    let list =
      filterTeamId === "all"
        ? items
        : items.filter((s) => s.teamId === filterTeamId);
    const q = scheduleSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => (s.title ?? "").toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      const dateA = (a.date ?? "").toString();
      const dateB = (b.date ?? "").toString();
      const cmp = dateA.localeCompare(dateB);
      return scheduleSortOrder === "dateAsc" ? cmp : -cmp;
    });
    return sorted;
  }, [items, filterTeamId, scheduleSearchQuery, scheduleSortOrder]);

  const visibleAnnouncements = useMemo(() => {
    if (filterTeamId === "all") return announcements;
    return announcements.filter((a) => a.teamId === filterTeamId);
  }, [announcements, filterTeamId]);

  const byDaySchedules = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of visibleItems) {
      const dateStr = (typeof s.date === "string" ? s.date : (s.date as unknown as string)).slice(0, 10);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(s);
    }
    return map;
  }, [visibleItems]);

  const byDayAnnouncements = useMemo(() => {
    const map: Record<string, typeof announcements> = {};
    for (const a of visibleAnnouncements) {
      const dateStr = a.startAt.slice(0, 10);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(a);
    }
    return map;
  }, [visibleAnnouncements]);

  const selectedDaySchedules = useMemo(() => (selectedDay ? byDaySchedules[selectedDay] ?? [] : []), [selectedDay, byDaySchedules]);
  const selectedDayAnnouncements = useMemo(() => (selectedDay ? byDayAnnouncements[selectedDay] ?? [] : []), [selectedDay, byDayAnnouncements]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">팀 일정 관리</h2>
        <p className="text-sm text-slate-300">
          Prisma + SQLite DB에 실제로 저장되는 팀 일정입니다.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-300 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
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
          <input
            type="text"
            value={scheduleSearchQuery}
            onChange={(e) => setScheduleSearchQuery(e.target.value)}
            placeholder="제목 검색"
            className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400 placeholder:text-slate-500"
          />
          <select
            value={scheduleSortOrder}
            onChange={(e) => setScheduleSortOrder(e.target.value as "dateAsc" | "dateDesc")}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
          >
            <option value="dateAsc">날짜 빠른 순</option>
            <option value="dateDesc">날짜 늦은 순</option>
          </select>
          <span className="text-slate-500">|</span>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-md border px-2 py-1 text-xs ${viewMode === "list" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
          >
            목록
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`rounded-md border px-2 py-1 text-xs ${viewMode === "calendar" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
          >
            캘린더
          </button>
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

      {viewMode === "list" && (
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
                          onClick={() => setDetailSchedule(item)}
                          className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                        >
                          자세히 보기
                        </button>
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
      )}

      {viewMode === "calendar" && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                )
              }
              className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
            >
              이전 달
            </button>
            <span className="text-lg font-semibold text-slate-100">
              {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                )
              }
              className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
            >
              다음 달
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className="py-1 text-xs font-medium text-slate-400">
                {d}
              </div>
            ))}
            {(() => {
              const y = calendarMonth.getFullYear();
              const m = calendarMonth.getMonth();
              const first = new Date(y, m, 1);
              const last = new Date(y, m + 1, 0);
              const startPad = first.getDay();
              const daysInMonth = last.getDate();
              const cells: { dateStr: string | null; day: number }[] = [];
              for (let i = 0; i < startPad; i++) cells.push({ dateStr: null, day: 0 });
              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                cells.push({ dateStr, day: d });
              }
              return cells.map(({ dateStr, day }, i) => {
                if (!dateStr) {
                  return <div key={`pad-${i}`} className="min-h-[72px] rounded-lg bg-slate-800/30" />;
                }
                const sCount = byDaySchedules[dateStr]?.length ?? 0;
                const aCount = byDayAnnouncements[dateStr]?.length ?? 0;
                const total = sCount + aCount;
                const isToday =
                  dateStr ===
                  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDay(dateStr)}
                    className={`min-h-[72px] rounded-lg border p-1 text-left transition hover:bg-slate-700/50 ${
                      isToday ? "border-emerald-500/60 bg-emerald-500/10" : "border-slate-700 bg-slate-800/50"
                    }`}
                  >
                    <span className="text-slate-200">{day}</span>
                    {total > 0 && (
                      <span className="ml-1 text-[10px] text-slate-400">
                        일정 {sCount}
                        {aCount > 0 ? ` / 공지 ${aCount}` : ""}
                      </span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-100">
              {selectedDay} 일정·공지
            </h3>
            {selectedDaySchedules.length === 0 && selectedDayAnnouncements.length === 0 ? (
              <p className="text-sm text-slate-400">해당 날짜에 일정·공지가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {selectedDaySchedules.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-400">일정</p>
                    <ul className="space-y-2">
                      {selectedDaySchedules.map((s) => {
                        const team = teams.find((t) => t.id === s.teamId);
                        return (
                          <li
                            key={s.id}
                            className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm"
                          >
                            <span className="text-slate-200">{s.title}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">{team?.name ?? "-"}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDay(null);
                                  setDetailSchedule(s);
                                }}
                                className="rounded border border-slate-600 px-2 py-0.5 text-xs hover:bg-slate-700"
                              >
                                자세히
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {selectedDayAnnouncements.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-400">공지</p>
                    <ul className="space-y-2">
                      {selectedDayAnnouncements.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs"
                        >
                          <p className="font-medium text-slate-200">{a.title}</p>
                          <p className="text-slate-500">{a.type}</p>
                          {a.content && <p className="mt-1 text-slate-300">{a.content}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {detailSchedule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDetailSchedule(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-slate-100">일정 자세히 보기</h3>
            <p className="mb-1 text-sm font-medium text-slate-200">{detailSchedule.title}</p>
            <p className="mb-4 text-xs text-slate-400">
              {typeof detailSchedule.date === "string"
                ? detailSchedule.date
                : new Date(detailSchedule.date as unknown as string).toLocaleString("ko-KR")}
              {" · "}
              {teams.find((t) => t.id === detailSchedule.teamId)?.name ?? "-"}
            </p>

            {detailLoading ? (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                {detailAnnouncements.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-400">해당일 공지</p>
                    <ul className="space-y-2">
                      {detailAnnouncements.map((a) => (
                        <li key={a.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs">
                          <p className="font-medium text-slate-200">{a.title}</p>
                          <p className="text-slate-500">{a.type}</p>
                          {a.content && <p className="mt-1 text-slate-300">{a.content}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-400">불참 의사 ({detailAbsences.length}명)</p>
                  {detailAbsences.length === 0 ? (
                    <p className="text-sm text-slate-500">불참 신청이 없습니다.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detailAbsences.map((a) => (
                        <li key={a.playerId} className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-xs">
                          <p className="font-medium text-slate-200">{a.playerName}</p>
                          {a.reasons.length > 0 && (
                            <p className="text-slate-400">사유: {a.reasons.join(", ")}</p>
                          )}
                          {a.reasonText && (
                            <p className="mt-1 text-slate-300">{a.reasonText}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailSchedule(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

