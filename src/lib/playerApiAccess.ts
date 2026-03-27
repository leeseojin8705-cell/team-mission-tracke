import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

export type PlayerReadAccess = "full" | "redacted" | "deny" | "missing";

export async function getPlayerReadAccess(
  targetId: string,
  session: SessionPayload | null,
): Promise<PlayerReadAccess> {
  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { teamId: true },
  });
  if (!target) return "missing";
  if (!session) return "redacted";
  if (session.role === "coach" || session.role === "owner") {
    if (!target.teamId) return "deny";
    const ids = await getAccessibleTeamIds(session);
    return ids.includes(target.teamId) ? "full" : "deny";
  }
  if (session.role === "player" && session.playerId) {
    if (session.playerId === targetId) return "full";
    const me = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (me?.teamId && target.teamId && me.teamId === target.teamId) return "full";
    return "deny";
  }
  return "deny";
}

export async function canPatchPlayer(session: SessionPayload | null, targetId: string): Promise<boolean> {
  if (!session) return false;
  if (session.role === "player" && session.playerId === targetId) return true;
  if (session.role === "coach" || session.role === "owner") {
    const target = await prisma.player.findUnique({
      where: { id: targetId },
      select: { teamId: true },
    });
    if (!target?.teamId) return false;
    const ids = await getAccessibleTeamIds(session);
    return ids.includes(target.teamId);
  }
  return false;
}

export async function canDeletePlayer(session: SessionPayload | null, targetId: string): Promise<boolean> {
  if (!session || (session.role !== "coach" && session.role !== "owner")) return false;
  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { teamId: true },
  });
  if (!target?.teamId) return false;
  const ids = await getAccessibleTeamIds(session);
  return ids.includes(target.teamId);
}
