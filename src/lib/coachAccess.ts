import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

/**
 * 코치/오너가 앱에서 다룰 수 있는 팀 id.
 * - 본인이 생성한 팀
 * - TeamStaff에 본인 userId가 연결된 팀(조직 초대·배정)
 * - 오너인 경우, 소유 조직 소속 팀 전체
 */
export async function getAccessibleTeamIds(session: SessionPayload): Promise<string[]> {
  if (session.role !== "coach" && session.role !== "owner") return [];
  if (typeof session.userId !== "string" || session.userId.length === 0) return [];

  const [created, staffed, ownedOrgTeams] = await Promise.all([
    prisma.team.findMany({
      where: { createdByUserId: session.userId },
      select: { id: true },
    }),
    prisma.teamStaff.findMany({
      where: { userId: session.userId },
      select: { teamId: true },
    }),
    session.role === "owner"
      ? prisma.team.findMany({
          where: { organizationRef: { ownerId: session.userId } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);

  const ids = new Set<string>();
  for (const t of created) ids.add(t.id);
  for (const s of staffed) ids.add(s.teamId);
  for (const t of ownedOrgTeams) ids.add(t.id);

  return Array.from(ids);
}

