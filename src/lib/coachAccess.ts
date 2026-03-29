import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export async function getAccessibleTeamIds(session: SessionPayload): Promise<string[]> {
  if (session.role !== "coach" && session.role !== "owner") return [];

  // 오너가 가진 조직의 팀들
  const orgs = await prisma.organization.findMany({
    where: { ownerId: session.userId },
    include: { teams: { select: { id: true } } },
  });
  const ownerTeamIds = orgs.flatMap((o) => o.teams.map((t) => t.id));

  // TeamStaff 로 연결된 팀들
  const staffTeams = await prisma.teamStaff.findMany({
    where: { userId: session.userId },
    select: { teamId: true },
  });
  const staffTeamIds = staffTeams.map((s) => s.teamId);

  const createdTeams = await prisma.team.findMany({
    where: { createdByUserId: session.userId },
    select: { id: true },
  });
  const createdTeamIds = createdTeams.map((t) => t.id);

  return Array.from(new Set([...ownerTeamIds, ...staffTeamIds, ...createdTeamIds]));
}

