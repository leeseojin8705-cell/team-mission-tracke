"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Task, Team, Player, TaskCategory, TeamStaff } from "@/lib/types";

const categories: TaskCategory[] = ["기술", "체력", "멘탈", "전술"];

type TargetType = "team" | "player";
type HtmlTaskType = "daily" | "single";
type HtmlCategory = "selfcare" | "practice" | "practice_game" | "official" | null;

function mapHtmlCategoryToTaskCategory(cat: HtmlCategory): TaskCategory {
  if (!cat) return "기술";
  if (cat === "selfcare") return "멘탈";
  if (cat === "official") return "전술";
  if (cat === "practice_game") return "체력";
  return "기술";
}

export default function CoachTasksPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<TeamStaff[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  // 공통 필드 (DB에 실제로 저장되는 값)
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("기술");
  const [dueDate, setDueDate] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("team");
  const [targetId, setTargetId] = useState<string>("");

  // 확장 UI 상태 (HTML 템플릿 반영, 현재는 미리보기/UX 용)
  const [htmlTaskType, setHtmlTaskType] = useState<HtmlTaskType>("daily");
  const [htmlCategory, setHtmlCategory] = useState<HtmlCategory>(null);
  const [taskDetail, setTaskDetail] = useState("");
  const [taskGoal, setTaskGoal] = useState("");
  const [dailyStart, setDailyStart] = useState("");
  const [dailyEnd, setDailyEnd] = useState("");
  const [singleDate, setSingleDate] = useState("");
  const [weekdaySet, setWeekdaySet] = useState<Set<string>>(new Set());
  const [contentTags, setContentTags] = useState<string[]>([]);
  const [positionSet, setPositionSet] = useState<Set<string>>(new Set(["ALL"]));
  const [positionWeights, setPositionWeights] = useState<Record<string, number>>({
    GK: 25,
    DF: 25,
    MF: 25,
    FW: 25,
  });
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(new Set());

  const teamOptions = useMemo(
    () => teams.map((t) => ({ id: t.id, name: t.name })),
    [teams],
  );
  const playerOptions = useMemo(
    () => players.map((p) => ({ id: p.id, name: p.name })),
    [players],
  );
  const currentTargetOptions =
    targetType === "team" ? teamOptions : playerOptions;

  const [filterType, setFilterType] = useState<TargetType | "all">("all");
  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [filterPlayerId, setFilterPlayerId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue">("all");
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamsRes, playersRes, tasksRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/players"),
          fetch("/api/tasks"),
        ]);

        if (!teamsRes.ok || !playersRes.ok || !tasksRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const [teamsData, playersData, tasksDataRaw]: [Team[], Player[], any[]] =
          await Promise.all([
            teamsRes.json(),
            playersRes.json(),
            tasksRes.json(),
          ]);

        if (!cancelled) {
          setTeams(teamsData);
          setPlayers(playersData);
          const tasksData: Task[] = tasksDataRaw.map((t) => ({
            ...t,
            dueDate:
              t.dueDate && typeof t.dueDate !== "string"
                ? new Date(t.dueDate as unknown as string).toISOString()
                : t.dueDate,
            details:
              typeof t.details === "string"
                ? (() => {
                    try {
                      return JSON.parse(t.details);
                    } catch {
                      return null;
                    }
                  })()
                : t.details ?? null,
          }));
          setTasks(tasksData);

          if (!targetId) {
            if (targetType === "team" && teamsData[0]) {
              setTargetId(teamsData[0].id);
            } else if (targetType === "player" && playersData[0]) {
              setTargetId(playersData[0].id);
            }
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
  }, [targetId, targetType]);

  // 현재 대상 팀 기준으로 코칭 스텝(평가자 후보) 불러오기
  useEffect(() => {
    let cancelled = false;

    async function loadStaff() {
      try {
        // 대상 팀 id 결정
        let teamIdForStaff: string | null = null;
        if (targetType === "team" && targetId) {
          teamIdForStaff = targetId;
        } else if (targetType === "player" && targetId) {
          const player = players.find((p) => p.id === targetId);
          teamIdForStaff = player?.teamId ?? null;
        }
        if (!teamIdForStaff) {
          if (!cancelled) setStaff([]);
          return;
        }

        const res = await fetch(`/api/teams/${teamIdForStaff}/staff`);
        if (!res.ok) {
          if (!cancelled) setStaff([]);
          return;
        }
        const data = (await res.json()) as TeamStaff[];
        if (!cancelled) {
          // 기본은 지도(true)로 체크된 코치들만 우선 사용,
          // 한 명도 없으면 팀 전체 스태프를 후보로 사용
          const guidance = data.filter((s) => s.guidance);
          setStaff(guidance.length > 0 ? guidance : data);
        }
      } catch {
        if (!cancelled) setStaff([]);
      }
    }

    loadStaff();

    return () => {
      cancelled = true;
    };
  }, [players, targetId, targetType]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setCategory("기술");
    setDueDate("");
    setTargetType("team");
    setTargetId(teams[0]?.id ?? "");
    setHtmlTaskType("daily");
    setHtmlCategory(null);
    setTaskDetail("");
    setTaskGoal("");
    setDailyStart("");
    setDailyEnd("");
    setSingleDate("");
    setWeekdaySet(new Set());
    setContentTags([]);
    setPositionSet(new Set(["ALL"]));
    setPositionWeights({ GK: 25, DF: 25, MF: 25, FW: 25 });
    setSelectedPlayerIds(new Set());
    setSelectedEvaluatorIds(new Set());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !targetId) return;

    // HTML 과제 유형/분류 → 기존 Task 필드로 매핑
    const mappedCategory = mapHtmlCategoryToTaskCategory(htmlCategory);
    const mappedDueDate =
      htmlTaskType === "single"
        ? singleDate || dueDate
        : dailyEnd || dueDate;

    const finalCategory = mappedCategory ?? category;
    const finalDueDate = mappedDueDate || undefined;

    const details = {
      htmlTaskType,
      htmlCategory,
      contents: contentTags.length ? contentTags : undefined,
      detailText: taskDetail || undefined,
      goalText: taskGoal || undefined,
      dailyStart: dailyStart || undefined,
      dailyEnd: dailyEnd || undefined,
      singleDate: singleDate || undefined,
      weekdays: weekdaySet.size ? Array.from(weekdaySet) : undefined,
      positions: positionSet.size ? Array.from(positionSet) : undefined,
      positionWeights,
      players:
        selectedPlayerIds.size > 0
          ? Array.from(selectedPlayerIds)
          : undefined,
      evaluators:
        selectedEvaluatorIds.size > 0
          ? Array.from(selectedEvaluatorIds)
          : undefined,
    };

    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`/api/tasks/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            category: finalCategory,
            dueDate: finalDueDate,
            targetType,
            targetId,
            details,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "과제를 수정하지 못했습니다.";
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            if (text) msg = text;
          }
          throw new Error(msg);
        }

        const updated: Task = await res.json();
        setTasks((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)),
        );
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            category: finalCategory,
            dueDate: finalDueDate,
            targetType,
            targetId,
            details,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "과제를 저장하지 못했습니다.";
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            if (text) msg = text;
          }
          throw new Error(msg);
        }

        const created: Task = await res.json();
        setTasks((prev) => [...prev, created]);
      }

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(task: Task) {
    setEditingId(task.id);
    setTitle(task.title);
    setCategory(task.category);
    setDueDate(
      task.dueDate && typeof task.dueDate === "string" ? task.dueDate : "",
    );

    if (task.details) {
      setHtmlTaskType(task.details.htmlTaskType ?? "daily");
      setHtmlCategory(task.details.htmlCategory ?? null);
      setTaskDetail(task.details.detailText ?? "");
      setTaskGoal(task.details.goalText ?? "");
      setDailyStart(task.details.dailyStart ?? "");
      setDailyEnd(task.details.dailyEnd ?? "");
      setSingleDate(task.details.singleDate ?? "");
      setWeekdaySet(
        new Set<string>(Array.isArray(task.details.weekdays) ? task.details.weekdays : []),
      );
      setContentTags(
        Array.isArray(task.details.contents)
          ? (task.details.contents as string[])
          : [],
      );
      setPositionSet(
        new Set<string>(
          Array.isArray(task.details.positions) && task.details.positions.length
            ? (task.details.positions as string[])
            : ["ALL"],
        ),
      );
      setPositionWeights((prev) => ({
        GK: task.details.positionWeights?.GK ?? prev.GK,
        DF: task.details.positionWeights?.DF ?? prev.DF,
        MF: task.details.positionWeights?.MF ?? prev.MF,
        FW: task.details.positionWeights?.FW ?? prev.FW,
      }));
      setSelectedPlayerIds(
        new Set<string>(
          Array.isArray(task.details.players)
            ? (task.details.players as string[])
            : [],
        ),
      );
      setSelectedEvaluatorIds(
        new Set<string>(
          Array.isArray(task.details.evaluators)
            ? (task.details.evaluators as string[])
            : [],
        ),
      );
    }

    if (task.teamId) {
      setTargetType("team");
      setTargetId(task.teamId);
    } else if (task.playerId) {
      setTargetType("player");
      setTargetId(task.playerId);
    }
  }

  async function handleDelete(id: string) {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("과제를 삭제하지 못했습니다.");
      }

      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter((task) => {
      if (filterType === "team") {
        if (!task.teamId) return false;
        if (filterTeamId !== "all" && task.teamId !== filterTeamId) return false;
      } else if (filterType === "player") {
        if (!task.playerId) return false;
        if (filterPlayerId !== "all" && task.playerId !== filterPlayerId)
          return false;
      }

      if (statusFilter !== "all") {
        if (!task.dueDate) return false;
        const d = new Date(task.dueDate);
        if (Number.isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);
        const isActive = d >= today;
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "overdue" && isActive) return false;
      }

      return true;
    });
  }, [tasks, filterType, filterTeamId, filterPlayerId, statusFilter]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const teamCount = tasks.filter((t) => t.teamId).length;
    const playerCount = tasks.filter((t) => t.playerId).length;
    const now = new Date();
    let active = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= new Date(now.toDateString())) active += 1;
      else overdue += 1;
    }
    return { total, teamCount, playerCount, active, overdue };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">과제 관리</h2>
        <p className="text-sm text-slate-300">
          팀 전체 공식 과제와 선수 개인 과제가 Prisma + SQLite DB에 실제로 저장됩니다.
        </p>
      </header>

      {/* 과제 현황 카드 */}
      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200 md:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setFilterType("all");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-slate-900/80 p-3 text-left hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">전체 과제</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">
            {summary.total}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("team");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-slate-900/80 p-3 text-left hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">팀 과제</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">
            {summary.teamCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">팀에 걸린 공통 과제 수</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType("player");
            setStatusFilter("all");
          }}
          className="flex flex-col justify-between rounded-xl bg-slate-900/80 p-3 text-left hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-transparent"
        >
          <div className="text-[11px] text-slate-400">개인 과제</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">
            {summary.playerCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">선수 개인별 과제 수</div>
        </button>
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) =>
              prev === "active" ? "overdue" : "active",
            )
          }
          className="flex flex-col justify-between rounded-xl bg-slate-900/80 p-3 text-left hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-transparent"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>진행 / 마감</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
              {statusFilter === "all"
                ? "전체"
                : statusFilter === "active"
                  ? "진행만"
                  : "마감만"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-lg font-semibold text-emerald-400">
              {summary.active}
            </span>
            <span className="text-sm text-slate-400">진행 중</span>
          </div>
          <div className="mt-0.5 text-[11px] text-rose-300">
            마감 지난 과제 {summary.overdue}개
          </div>
        </button>
      </div>

      {/* 선택된 조건 과제 요약 (위쪽에 바로 확인) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-200">
              {filterType === "all"
                ? "대상: 전체"
                : filterType === "team"
                  ? "대상: 팀 과제"
                  : "대상: 개인 과제"}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-200">
              상태:{" "}
              {statusFilter === "all"
                ? "전체"
                : statusFilter === "active"
                  ? "진행 중만"
                  : "마감 지난 과제만"}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            현재 조건에 해당하는 과제 {visibleTasks.length}개
          </span>
        </div>
        {visibleTasks.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            선택된 조건에 해당하는 과제가 없습니다. 위 카드나 필터를 변경해 보세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleTasks.slice(0, 6).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskForModal(task)}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-left hover:border-emerald-500"
              >
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                  {task.teamId ? "팀" : task.playerId ? "선수" : "기타"}
                </span>
                <span className="text-[12px] font-medium text-slate-100">
                  {task.title}
                </span>
                {task.dueDate && (
                  <span className="text-[10px] text-slate-400">
                    마감 {String(task.dueDate).slice(0, 10)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상단 필터 */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px]">목록 필터</span>
          <select
            value={filterType}
            onChange={(e) => {
              const value = e.target.value as typeof filterType;
              setFilterType(value);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
          >
            <option value="all">전체</option>
            <option value="team">팀 과제만</option>
            <option value="player">개인 과제만</option>
          </select>
          {filterType === "team" && (
            <select
              value={filterTeamId}
              onChange={(e) => setFilterTeamId(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
            >
              <option value="all">모든 팀</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {filterType === "player" && (
            <select
              value={filterPlayerId}
              onChange={(e) => setFilterPlayerId(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none focus:border-emerald-400"
            >
              <option value="all">모든 선수</option>
              {playerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="text-[11px] text-slate-400">
          표시: {visibleTasks.length}개 / 총 {tasks.length}개
        </span>
      </div>

      {/* 과제 등록 폼 - task_registration.html 스타일 간단 이식 */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-sm"
      >
        {/* ① 과제 유형 */}
        <section className="mb-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            과제 유형
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={() => setHtmlTaskType("daily")}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${
                htmlTaskType === "daily"
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="text-lg">📅</div>
              <div className="text-sm font-semibold text-slate-100">매일 과제</div>
              <div className="mt-1 text-xs text-slate-400">
                정해진 요일·시간에 반복 평가, 선수는 사후 평가(디폴트)
              </div>
            </button>
            <button
              type="button"
              onClick={() => setHtmlTaskType("single")}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${
                htmlTaskType === "single"
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="text-lg">📌</div>
              <div className="text-sm font-semibold text-slate-100">단일 과제</div>
              <div className="mt-1 text-xs text-slate-400">
                특정 날짜·시간 1회 평가, 선수 사전·사후 / 지도자 사후
              </div>
            </button>
          </div>
        </section>

        {/* ② 과제 기본 정보 + 분류 */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            과제 기본 정보
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-300">
                과제 제목 <span className="text-rose-400">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                placeholder="과제 제목을 입력하세요"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-300">
                과제 분류 <span className="text-rose-400">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "selfcare", label: "자기관리" },
                  { id: "practice", label: "연습 및 훈련" },
                  { id: "practice_game", label: "연습 경기" },
                  { id: "official", label: "정식 경기" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setHtmlCategory(opt.id as HtmlCategory);
                      setContentTags([]);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      htmlCategory === opt.id
                        ? "border-emerald-500 bg-emerald-500 text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 과제 내용 / 평가 항목 태그 */}
          <div>
            <label className="mb-1 block text-xs text-slate-300">
              과제 내용 / 평가 항목 <span className="text-rose-400">*</span>
            </label>
            <p className="mb-2 text-[11px] text-slate-500">
              과제 분류를 선택하면 해당 분류에 맞는 평가 항목을 여러 개 선택할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const base: { id: string; label: string; color: string }[] =
                  htmlCategory === "selfcare"
                    ? [
                        { id: "routine", label: "루틴", color: "#3563e9" },
                        { id: "nutrition", label: "식단", color: "#12b76a" },
                        { id: "sleep", label: "수면", color: "#7c5cff" },
                        { id: "recovery", label: "회복", color: "#f79009" },
                      ]
                    : htmlCategory === "practice"
                      ? [
                          { id: "skill", label: "기술", color: "#3563e9" },
                          { id: "physical", label: "신체", color: "#12b76a" },
                          { id: "tactical", label: "전술", color: "#f79009" },
                          { id: "mental", label: "심리", color: "#f04438" },
                          { id: "cognitive", label: "인지", color: "#7c5cff" },
                          { id: "attitude", label: "태도", color: "#00b8d9" },
                        ]
                      : htmlCategory === "practice_game" || htmlCategory === "official"
                        ? [
                            { id: "skill", label: "기술", color: "#3563e9" },
                            { id: "physical", label: "신체", color: "#12b76a" },
                            { id: "tactical", label: "전술", color: "#f79009" },
                            { id: "mental", label: "심리", color: "#f04438" },
                            { id: "cognitive", label: "인지", color: "#7c5cff" },
                            { id: "attitude", label: "태도", color: "#00b8d9" },
                          ]
                        : [];

                if (!htmlCategory) {
                  return (
                    <span className="text-[11px] text-slate-500">
                      먼저 위에서 과제 분류를 선택해 주세요.
                    </span>
                  );
                }

                return base.map((item) => {
                  const on = contentTags.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setContentTags((prev) =>
                          prev.includes(item.id)
                            ? prev.filter((v) => v !== item.id)
                            : [...prev, item.id],
                        )
                      }
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        on
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-300">
                세부 과제
              </label>
              <textarea
                value={taskDetail}
                onChange={(e) => setTaskDetail(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                placeholder="세부 과제 내용을 자유롭게 입력하세요"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-300">
                과제 목표
              </label>
              <textarea
                value={taskGoal}
                onChange={(e) => setTaskGoal(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                placeholder="이 과제를 통해 달성하고자 하는 목표를 입력하세요"
              />
            </div>
          </div>
        </section>

        {/* ③ 과제 일정 (간단 버전) */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            과제 일정
          </div>
          {htmlTaskType === "daily" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  시작 날짜
                </label>
                <input
                  type="date"
                  value={dailyStart}
                  onChange={(e) => setDailyStart(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  종료 날짜
                </label>
                <input
                  type="date"
                  value={dailyEnd}
                  onChange={(e) => setDailyEnd(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  날짜
                </label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  (선택) 마감일 메모
                </label>
                <input
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="예: 2026-03-31"
                />
              </div>
            </div>
          )}
        </section>

        {/* ④ 포지션 지정 + 중요도 */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            포지션 지정 / 중요도
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "ALL", label: "전부" },
                { id: "GK", label: "GK" },
                { id: "DF", label: "DF" },
                { id: "MF", label: "MF" },
                { id: "FW", label: "FW" },
              ].map((pos) => {
                const on = positionSet.has(pos.id);
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => {
                      setPositionSet((prev) => {
                        const next = new Set(prev);
                        if (pos.id === "ALL") {
                          return new Set(["ALL"]);
                        }
                        next.delete("ALL");
                        if (next.has(pos.id)) next.delete(pos.id);
                        else next.add(pos.id);
                        if (next.size === 0) return new Set(["ALL"]);
                        return next;
                      });
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "border-emerald-500 bg-emerald-500 text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {["GK", "DF", "MF", "FW"].map((pos) => (
                <div
                  key={pos}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    positionSet.has("ALL") || positionSet.has(pos)
                      ? "border-slate-700 bg-slate-900/80"
                      : "border-slate-800 bg-slate-950/40 opacity-60"
                  }`}
                >
                  <div className="mb-1 text-[11px] font-semibold text-slate-200">
                    {pos}
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={positionWeights[pos as "GK" | "DF" | "MF" | "FW"]}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setPositionWeights((prev) => ({
                          ...prev,
                          [pos]: Math.max(0, Math.min(100, val)),
                        }));
                      }}
                      className="h-7 w-16 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    />
                    <span className="text-[11px] text-slate-400">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-[11px] text-slate-400">
              포지션별 중요도는 0~100% 사이로 자유롭게 설정할 수 있습니다. (필요하면 나중에 합계 100% 검증을 추가할 수 있습니다.)
            </div>
          </div>
        </section>

        {/* ⑤ 선수 지정 (참고용 목록) */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            선수 지정
          </div>
          <p className="text-[11px] text-slate-500">
            이 과제가 적용될 선수들을 선택합니다. 실제 저장은 과제 상세 정보(`players`)에 남고, 대표 대상 한 명은 아래 팀/선수 대상에서 선택됩니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
            <span>
              전체 선수 수: {players.length}명 / 선택: {selectedPlayerIds.size}명
            </span>
          </div>
          <div className="mt-2 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
            {players.map((p) => {
              const on = selectedPlayerIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setSelectedPlayerIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                  className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                    on
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.position && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      {p.position}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ⑥ 평가자 지정 */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            평가자 지정
          </div>
          <p className="text-[11px] text-slate-500">
            현재 선택된 팀(또는 선수 소속 팀)의 코칭 스텝 중, 이 과제를 평가할 인원을 선택합니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>코칭 스텝: {staff.length}명</span>
            <span>선택: {selectedEvaluatorIds.size}명</span>
          </div>
          {staff.length === 0 ? (
            <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-[11px] text-slate-400">
              현재 선택된 팀에 등록된 코칭 스텝이 없습니다. 팀 관리에서 코칭 스텝을 먼저 추가해 주세요.
            </div>
          ) : (
            <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
              {staff.map((s) => {
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
                    className={`flex flex-col rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                      on
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-slate-400">{s.role}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ⑦ 대상 (팀 / 선수) */}
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            대상 지정
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr,2fr]">
            <div>
              <label className="mb-1 block text-xs text-slate-300">대상 종류</label>
              <select
                value={targetType}
                onChange={(e) => {
                  const value = e.target.value as TargetType;
                  setTargetType(value);
                  setTargetId(
                    value === "team"
                      ? teamOptions[0]?.id ?? ""
                      : playerOptions[0]?.id ?? "",
                  );
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              >
                <option value="team">팀</option>
                <option value="player">선수</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-300">
                대상 선택
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                disabled={currentTargetOptions.length === 0}
              >
                {currentTargetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            {editingId ? "취소" : "초기화"}
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !title.trim() ||
              !targetId ||
              (targetType === "team" && teamOptions.length === 0) ||
              (targetType === "player" && playerOptions.length === 0)
            }
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting
              ? "저장 중..."
              : editingId
                ? "과제 수정 완료"
                : "과제 등록 완료"}
          </button>
        </div>
      </form>

      {/* 과제 상세 모달 */}
      {selectedTaskForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedTaskForModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-semibold text-slate-50">
              과제 정보 — {selectedTaskForModal.title}
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              이 과제에 저장된 세부 항목과 목표를 한눈에 확인할 수 있습니다.
            </p>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">대상</div>
                  <div className="mt-1 text-slate-100">
                    {selectedTaskForModal.teamId
                      ? "팀 과제"
                      : selectedTaskForModal.playerId
                        ? "개인 과제"
                        : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">마감일</div>
                  <div className="mt-1 text-slate-100">
                    {selectedTaskForModal.dueDate
                      ? String(selectedTaskForModal.dueDate).slice(0, 10)
                      : "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">과제 유형 / 분류</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                    유형:{" "}
                    {selectedTaskForModal.details?.htmlTaskType === "single"
                      ? "단일 과제"
                      : "매일 과제"}
                  </span>
                  {selectedTaskForModal.details?.htmlCategory && (
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                      분류: {selectedTaskForModal.details.htmlCategory}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                    저장 카테고리: {selectedTaskForModal.category}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">평가 항목</div>
                {selectedTaskForModal.details?.contents &&
                selectedTaskForModal.details.contents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.contents.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-100"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-xs text-slate-400">
                    선택된 평가 항목이 없습니다.
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">세부 과제</div>
                <div className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100">
                  {selectedTaskForModal.details?.detailText?.trim()
                    ? selectedTaskForModal.details.detailText
                    : "등록된 세부 과제가 없습니다."}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">과제 목표</div>
                <div className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100">
                  {selectedTaskForModal.details?.goalText?.trim()
                    ? selectedTaskForModal.details.goalText
                    : "등록된 과제 목표가 없습니다."}
                </div>
              </div>

              {(selectedTaskForModal.details?.dailyStart ||
                selectedTaskForModal.details?.dailyEnd ||
                selectedTaskForModal.details?.singleDate) && (
                <div>
                  <div className="mb-1 text-xs text-slate-400">일정</div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-xs text-slate-100">
                    {selectedTaskForModal.details?.htmlTaskType === "single" ? (
                      <>
                        <div>단일 날짜: {selectedTaskForModal.details?.singleDate ?? "—"}</div>
                      </>
                    ) : (
                      <>
                        <div>
                          기간: {selectedTaskForModal.details?.dailyStart ?? "—"} ~{" "}
                          {selectedTaskForModal.details?.dailyEnd ?? "—"}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 text-xs text-slate-400">포지션 / 중요도</div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-xs text-slate-100">
                  <div className="mb-1">
                    대상 포지션:{" "}
                    {selectedTaskForModal.details?.positions &&
                    selectedTaskForModal.details.positions.length
                      ? selectedTaskForModal.details.positions.join(", ")
                      : "전부"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["GK", "DF", "MF", "FW"].map((pos) => (
                      <span
                        key={pos}
                        className="rounded-full bg-slate-800 px-2 py-1 text-[11px]"
                      >
                        {pos}:{" "}
                        {selectedTaskForModal.details?.positionWeights?.[
                          pos as "GK" | "DF" | "MF" | "FW"
                        ] ?? 0}
                        %
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">선수 지정</div>
                {selectedTaskForModal.details?.players &&
                selectedTaskForModal.details.players.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.players.map((pid) => {
                      const player = players.find((p) => p.id === pid);
                      return (
                        <span
                          key={pid}
                          className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-100"
                        >
                          {player?.name ?? pid}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-xs text-slate-400">
                    이 과제에 지정된 선수가 없습니다.
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-400">평가자 지정</div>
                {selectedTaskForModal.details?.evaluators &&
                selectedTaskForModal.details.evaluators.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTaskForModal.details.evaluators.map((sid) => {
                      const s = staff.find((st) => st.id === sid);
                      return (
                        <span
                          key={sid}
                          className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-100"
                        >
                          {s?.name ?? sid}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-xs text-slate-400">
                    이 과제에 지정된 평가자가 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  handleEdit(selectedTaskForModal);
                  setSelectedTaskForModal(null);
                }}
                className="rounded-lg border border-emerald-500 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
              >
                이 과제 수정
              </button>
              <button
                type="button"
                onClick={() => setSelectedTaskForModal(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">제목</th>
              <th className="px-4 py-2 text-left">대상(팀/선수)</th>
              <th className="px-4 py-2 text-left">카테고리</th>
              <th className="px-4 py-2 text-left">마감일</th>
              <th className="px-4 py-2 text-right">상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  과제 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  등록된 과제가 없습니다. 위 폼에서 과제를 추가해 보세요.
                </td>
              </tr>
            ) : (
              visibleTasks.map((task) => {
                const team = task.teamId
                  ? teams.find((t) => t.id === task.teamId)
                  : undefined;
                const player = task.playerId
                  ? players.find((p) => p.id === task.playerId)
                  : undefined;

                const targetName = team?.name ?? player?.name ?? "-";

                return (
                  <tr key={task.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">{task.title}</td>
                    <td className="px-4 py-2 text-slate-200">{targetName}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {task.category ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {task.dueDate ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(task)}
                        className="rounded-md border border-slate-600 px-2 py-1 hover:bg-slate-800"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(task.id)}
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

