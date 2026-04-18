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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  const emailNorm = user?.email?.trim().toLowerCase() ?? "";

  /** 예전에 이메일만 넣고 userId 를 비워 둔 스태프 행 → 로그인 시 자동 연결 (DB에서 이메일로만 조회, 전체 스캔 방지) */
  if (emailNorm.length > 0) {
    const toLink = await prisma.teamStaff.findMany({
      where: {
        userId: null,
        email: { equals: emailNorm, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (toLink.length > 0) {
      await prisma.teamStaff.updateMany({
        where: { id: { in: toLink.map((x) => x.id) } },
        data: { userId: session.userId },
      });
    }
  }

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

