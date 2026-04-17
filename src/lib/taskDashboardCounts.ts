import type { TaskDetails } from "@/lib/types";

/** API/Prisma 문자열 또는 클라이언트 객체 모두 허용 */
export function normalizeTaskDetails(raw: unknown): TaskDetails | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TaskDetails;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as TaskDetails;
  return null;
}

/**
 * 팀 과제(teamId, playerId 없음)의 대상 선수 id 목록.
 * `details.assigneePlayerIds`만 사용(선수 API·`taskAssignees`와 동일). 비어 있으면 팀 전체.
 * `details.players`는 명단/포메이션 표시용이라 집계에 포함하지 않음.
 */
export function getTeamTaskTargetPlayerIds(
  details: TaskDetails | null,
  teamPlayerIds: string[],
): string[] {
  const assignee = details?.assigneePlayerIds;
  if (Array.isArray(assignee) && assignee.length > 0) {
    const ids = assignee.filter((x): x is string => typeof x === "string");
    const filtered = [...new Set(ids.filter((id) => teamPlayerIds.includes(id)))];
    if (filtered.length > 0) return filtered;
  }
  return [...teamPlayerIds];
}

/**
 * 대시보드·요약용 ‘과제 슬롯’ 수: 개인 과제 1, 팀 과제는 대상 선수 수.
 */
export function countDashboardTaskSlots(
  task: {
    teamId?: string | null;
    playerId?: string | null;
    details?: unknown;
  },
  teamPlayerIds: string[],
): number {
  if (task.playerId) return 1;
  if (!task.teamId) return 1;
  const d = normalizeTaskDetails(task.details);
  const targets = getTeamTaskTargetPlayerIds(d, teamPlayerIds);
  return targets.length;
}
