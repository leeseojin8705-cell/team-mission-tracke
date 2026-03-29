import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

/**
 * 코치/오너가 앱에서 다룰 수 있는 팀 id.
 * 본인이 생성한 팀만 포함한다. (조직 소속·스태프 배정만으로는 다른 계정이 만든 팀이 섞이지 않게)
 */
export async function getAccessibleTeamIds(session: SessionPayload): Promise<string[]> {
  if (session.role !== "coach" && session.role !== "owner") return [];
  if (typeof session.userId !== "string" || session.userId.length === 0) return [];

  const rows = await prisma.team.findMany({
    where: { createdByUserId: session.userId },
    select: { id: true },
  });
  return rows.map((t) => t.id);
}

