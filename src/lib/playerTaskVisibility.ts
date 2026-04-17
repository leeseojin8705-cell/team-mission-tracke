import type { Task, TaskDetails } from "@/lib/types";

export function parseTaskDetailsLoose(raw: unknown): TaskDetails | null {
  if (raw == null) return null;
  if (typeof raw === "object" && raw !== null) return raw as TaskDetails;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TaskDetails;
    } catch {
      return null;
    }
  }
  return null;
}

/** 선수에게 아직 세부 내용을 공개하지 않아야 하는지 (서버 시각 기준) */
export function shouldRedactTaskDetailsForPlayer(
  details: TaskDetails | null,
  now: Date,
): boolean {
  if (!details?.publicAt) return false;
  const t = new Date(details.publicAt);
  if (Number.isNaN(t.getTime())) return false;
  return now < t;
}

function buildRedactedDetails(src: TaskDetails | null): TaskDetails {
  const publicAt = src?.publicAt;
  return {
    publicAt,
    playerLocked: true,
    htmlTaskType: src?.htmlTaskType,
    htmlCategory: src?.htmlCategory,
  };
}

/** 선수용 응답: 공개 전이면 상세 필드 제거(유출 방지) */
export function applyPlayerTaskVisibility<T extends Task>(task: T, now: Date): T {
  const parsed = parseTaskDetailsLoose(task.details);
  if (!shouldRedactTaskDetailsForPlayer(parsed, now)) {
    return task;
  }
  return {
    ...task,
    details: buildRedactedDetails(parsed),
  };
}
