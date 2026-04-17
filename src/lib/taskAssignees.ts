import { parseTaskDetailsLoose } from "@/lib/playerTaskVisibility";

/** 팀 과제 중 지정된 소수 선수만 대상일 때 details.assigneePlayerIds */
export function getAssigneePlayerIdsFromTask(task: {
  details?: unknown;
}): string[] | null {
  const d = parseTaskDetailsLoose(task.details);
  const raw = d?.assigneePlayerIds;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length ? ids : null;
}

/**
 * 팀 과제 접근: 대시보드 슬롯 집계(`getTeamTaskTargetPlayerIds`)와 동일.
 * `assigneePlayerIds`가 있으면 그 목록만, 없으면 해당 팀 전원. `details.players`는 사용하지 않음.
 */
export function playerCanAccessTeamScopedTask(
  playerId: string,
  playerTeamId: string | null | undefined,
  task: { teamId: string | null; playerId: string | null; details?: unknown },
): boolean {
  if (task.playerId === playerId) return true;
  if (task.playerId != null) return false;
  if (!task.teamId || playerTeamId !== task.teamId) return false;
  const d = parseTaskDetailsLoose(task.details);
  const assignee = d?.assigneePlayerIds;
  if (Array.isArray(assignee) && assignee.length > 0) {
    const ids = assignee.filter((x): x is string => typeof x === "string" && x.length > 0);
    return ids.includes(playerId);
  }
  return true;
}
