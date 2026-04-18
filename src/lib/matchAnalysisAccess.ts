import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

/** 세션 기준으로 볼 수 있는 팀 id 목록 (빈 배열 = 없음, null = 비로그인 등으로 범위 없음) */
export async function getTeamIdsForMatchAnalysisSession(
  session: SessionPayload | null,
): Promise<string[] | null> {
  if (!session) return null;
  if (session.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    return player?.teamId ? [player.teamId] : [];
  }
  if (session.role === "coach" || session.role === "owner") {
    return getAccessibleTeamIds(session);
  }
  return [];
}

/** 팀 id들에 속한 경기 분석만 (teamId 직접 연결 또는 일정 경유) */
export function matchAnalysisWhereForTeams(
  teamIds: string[],
): Prisma.MatchAnalysisWhereInput {
  if (teamIds.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { teamId: { in: teamIds } },
      { schedule: { teamId: { in: teamIds } } },
    ],
  };
}

type AnalysisRow = {
  teamId: string | null;
  scheduleId: string | null;
};

export async function canAccessMatchAnalysis(
  session: SessionPayload | null,
  analysis: AnalysisRow,
  req?: Request,
): Promise<boolean> {
  if (req && isAdminApiRequest(req)) return true;
  const ids = await getTeamIdsForMatchAnalysisSession(session);
  if (ids === null) return false;
  if (ids.length === 0) return false;

  if (analysis.teamId && ids.includes(analysis.teamId)) return true;

  if (analysis.scheduleId) {
    const sch = await prisma.schedule.findUnique({
      where: { id: analysis.scheduleId },
      select: { teamId: true },
    });
    if (sch?.teamId && ids.includes(sch.teamId)) return true;
  }

  return false;
}
