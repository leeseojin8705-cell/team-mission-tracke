"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TeamStaff, Player } from "@/lib/types";

type TaskWithDetails = Task & {
  details?: Task["details"] | null;
};

export default function CoachPersonalTasksPage() {
  const searchParams = useSearchParams();
  const staffIdFromUrl = searchParams.get("staffId") ?? "";
  const staffIdFromUrlRef = useRef(staffIdFromUrl);
  staffIdFromUrlRef.current = staffIdFromUrl;
  const [staff, setStaff] = useState<TeamStaff[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffIdFromUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [staffRes, playersRes, tasksRes] = await Promise.all([
          fetch("/api/teams/staff-all").catch(() => null),
          fetch("/api/players"),
          fetch("/api/tasks"),
        ]);

        if (!playersRes.ok || !tasksRes.ok) {
          throw new Error("데이터를 불러오지 못했습니다.");
        }

        const playersData = (await playersRes.json()) as Player[];
        const tasksRaw = (await tasksRes.json()) as Record<string, unknown>[];

        if (cancelled) return;

        setPlayers(playersData);

        const parsedTasks: TaskWithDetails[] = tasksRaw.map((t) => {
          const detailsRaw = t.details;
          const details =
            typeof detailsRaw === "string"
              ? (() => {
                  try {
                    return JSON.parse(detailsRaw) as Task["details"];
                  } catch {
                    return null;
                  }
                })()
              : ((detailsRaw as Task["details"]) ?? null);
          return { ...t, details } as TaskWithDetails;
        });
        setTasks(parsedTasks);

        if (staffRes && staffRes.ok) {
          const staffData = (await staffRes.json()) as TeamStaff[];
          setStaff(staffData);
          const urlId = staffIdFromUrlRef.current;
          setSelectedStaffId((prev) => {
            if (urlId && staffData.some((s) => s.id === urlId)) {
              return urlId;
            }
            if (prev && staffData.some((s) => s.id === prev)) {
              return prev;
            }
            return staffData[0]?.id ?? "";
          });
        } else {
          setStaff([]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!staffIdFromUrl) return;
    setSelectedStaffId(staffIdFromUrl);
  }, [staffIdFromUrl]);

  const visible = useMemo(() => {
    // 선수 개인 과제 중, 어떤 코치에게라도 평가를 요청한 과제만 대상으로 삼는다.
    const personalRequested = tasks.filter(
      (t) =>
        t.playerId &&
        Array.isArray(t.details?.evaluators) &&
        t.details!.evaluators!.length > 0,
    );
    // 아직 코치를 선택하지 않았다면 아무 것도 보여주지 않는다.
    if (!selectedStaffId) return [];
    // 선택된 코치(본인)가 evaluators 에 포함된 과제만 보여준다.
    return personalRequested.filter((t) =>
      (t.details?.evaluators as string[] | undefined)?.includes(selectedStaffId),
    );
  }, [tasks, selectedStaffId]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-4">
          <Link
            href="/coach"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← 코치 대시보드
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-slate-100">선수 개인 과제 검토</h1>
        <p className="text-sm text-slate-400">
          선수가 스스로 만든 개인 과제 중에서, 특정 코치/프론트 스태프에게 검증이나 피드백을
          요청한 과제만 모아서 볼 수 있습니다.
        </p>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs">
          <span className="text-[11px] text-slate-400">내 계정(코치/스태프)</span>
          {staff.length === 0 ? (
            <span className="text-[11px] text-slate-600">
              등록된 팀 스태프가 없어 개인 평가 요청 과제를 불러올 수 없습니다.
            </span>
          ) : staffIdFromUrl ? (
            <>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] text-slate-100">
                {
                  staff.find((s) => s.id === staffIdFromUrl)?.name ??
                  staffIdFromUrl
                }
              </span>
              <span className="text-[11px] text-slate-500">
                이 코치에게 요청된 개인 평가 과제 {visible.length}개
              </span>
            </>
          ) : (
            <>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="min-w-[180px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.role ? ` (${s.role})` : ""}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">
                이 코치에게 요청된 개인 평가 과제 {visible.length}개
              </span>
            </>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-400">
            선택된 코치/스태프에게 요청된 개인 과제가 없습니다.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">선수</th>
                  <th className="px-3 py-2 text-left">제목</th>
                  <th className="px-3 py-2 text-left">내용</th>
                  <th className="px-3 py-2 text-left">기간/일자</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => {
                  const d = task.details;
                  const player = players.find((p) => p.id === task.playerId);
                  const labelDate =
                    d?.htmlTaskType === "single"
                      ? d.singleDate
                      : d?.dailyStart && d?.dailyEnd
                        ? `${d.dailyStart} ~ ${d.dailyEnd}`
                        : task.dueDate ?? "";
                  const contentLabel =
                    Array.isArray(d?.contents) && d!.contents!.length > 0
                      ? d!.contents!.join(", ")
                      : d?.contentCategory;
                  return (
                    <tr key={task.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-100">
                        {player?.name ?? task.playerId}
                      </td>
                      <td className="px-3 py-2 text-slate-100">
                        <Link
                          href={`/player/tasks/${encodeURIComponent(task.id)}`}
                          className="text-emerald-300 hover:underline"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {contentLabel ?? "–"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {labelDate || "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

