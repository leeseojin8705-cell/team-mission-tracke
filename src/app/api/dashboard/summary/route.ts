import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

/** GET /api/tasks 와 동일한 범위로 과제만 집계 (코치는 접근 가능한 팀만) */
export async function GET() {
  const session = await getSession();
  let taskWhere: Prisma.TaskWhereInput | undefined;
  let teamWhere: Prisma.TeamWhereInput | undefined;
  let playerWhere: Prisma.PlayerWhereInput | undefined;

  if (!session) {
    return NextResponse.json({ teamTaskCounts: {}, playerTaskCounts: {} });
  }

  if (session.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (!player?.teamId) {
      taskWhere = { playerId: session.playerId };
      teamWhere = { id: { in: [] } };
    } else {
      taskWhere = {
        OR: [
          { playerId: session.playerId },
          { teamId: player.teamId, playerId: null },
        ],
      };
      teamWhere = { id: player.teamId };
    }
    playerWhere = { id: session.playerId };
  } else if (session.role === "coach" || session.role === "owner") {
    const ids = await getAccessibleTeamIds(session);
    if (ids.length === 0) {
      taskWhere = { teamId: null };
      teamWhere = { id: { in: [] } };
      playerWhere = { teamId: { in: [] } };
    } else {
      taskWhere = {
        OR: [{ teamId: { in: ids } }, { teamId: null }],
      };
      teamWhere = { id: { in: ids } };
      playerWhere = { teamId: { in: ids } };
    }
  } else {
    return NextResponse.json({ teamTaskCounts: {}, playerTaskCounts: {} });
  }

  const [teams, players, tasks, progresses] = await Promise.all([
    prisma.team.findMany({ where: teamWhere }),
    prisma.player.findMany({ where: playerWhere }),
    prisma.task.findMany({ where: taskWhere }),
    prisma.taskProgress.findMany(),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const teamTaskCounts: Record<
    string,
    { total: number; completed: number; name: string }
  > = {};

  for (const task of tasks) {
    if (!task.teamId) continue;
    const key = task.teamId;
    if (!teamTaskCounts[key]) {
      teamTaskCounts[key] = {
        total: 0,
        completed: 0,
        name: teamMap.get(key)?.name ?? "알 수 없는 팀",
      };
    }
    teamTaskCounts[key].total += 1;
  }

  for (const p of progresses) {
    if (!p.completed) continue;
    const task = tasks.find((t) => t.id === p.taskId);
    if (task?.teamId && teamTaskCounts[task.teamId]) {
      teamTaskCounts[task.teamId].completed += 1;
    }
  }

  const playerTaskCounts: Record<
    string,
    {
      total: number;
      completed: number;
      name: string;
      teamName: string | null;
      teamId: string | null;
    }
  > = {};

  for (const task of tasks) {
    if (!task.playerId) continue;
    const key = task.playerId;
    const player = playerMap.get(key);
    if (!player) continue;
    if (!playerTaskCounts[key]) {
      playerTaskCounts[key] = {
        total: 0,
        completed: 0,
        name: player.name,
        teamName: teamMap.get(player.teamId)?.name ?? null,
        teamId: player.teamId,
      };
    }
    playerTaskCounts[key].total += 1;
  }

  for (const p of progresses) {
    if (!p.completed) continue;
    const task = tasks.find((t) => t.id === p.taskId);
    if (task?.playerId && playerTaskCounts[task.playerId]) {
      playerTaskCounts[task.playerId].completed += 1;
    }
  }

  return NextResponse.json({
    teamTaskCounts,
    playerTaskCounts,
  });
}

