import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";
import {
  getTeamTaskTargetPlayerIds,
  normalizeTaskDetails,
} from "@/lib/taskDashboardCounts";
type TeamRow = Awaited<ReturnType<typeof prisma.team.findMany>>[number];
type PlayerRow = Awaited<ReturnType<typeof prisma.player.findMany>>[number];
type TaskRow = Awaited<ReturnType<typeof prisma.task.findMany>>[number];
type ProgressRow = Awaited<ReturnType<typeof prisma.taskProgress.findMany>>[number];

function buildDashboardSummary(
  teams: TeamRow[],
  players: PlayerRow[],
  tasks: TaskRow[],
  progresses: ProgressRow[],
) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const playersByTeam = new Map<string, string[]>();
  for (const pl of players) {
    if (!pl.teamId) continue;
    const arr = playersByTeam.get(pl.teamId) ?? [];
    arr.push(pl.id);
    playersByTeam.set(pl.teamId, arr);
  }

  const teamTaskCounts: Record<
    string,
    { total: number; completed: number; name: string }
  > = {};

  for (const task of tasks) {
    if (!task.teamId || task.playerId) continue;
    const key = task.teamId;
    if (!teamTaskCounts[key]) {
      teamTaskCounts[key] = {
        total: 0,
        completed: 0,
        name: teamMap.get(key)?.name ?? "알 수 없는 팀",
      };
    }
    const teamPids = playersByTeam.get(key) ?? [];
    const d = normalizeTaskDetails(task.details);
    const targets = getTeamTaskTargetPlayerIds(d, teamPids);
    teamTaskCounts[key].total += targets.length > 0 ? targets.length : 0;
  }

  for (const p of progresses) {
    if (!p.completed) continue;
    const task = tasks.find((t) => t.id === p.taskId);
    if (!task?.teamId || task.playerId || !teamTaskCounts[task.teamId]) continue;
    const teamPids = playersByTeam.get(task.teamId) ?? [];
    const d = normalizeTaskDetails(task.details);
    const targets = new Set(getTeamTaskTargetPlayerIds(d, teamPids));
    if (targets.size > 0 && targets.has(p.playerId)) {
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

  for (const player of players) {
    playerTaskCounts[player.id] = {
      total: 0,
      completed: 0,
      name: player.name,
      teamName: player.teamId ? teamMap.get(player.teamId)?.name ?? null : null,
      teamId: player.teamId,
    };
  }

  for (const task of tasks) {
    if (task.playerId) {
      const key = task.playerId;
      if (playerTaskCounts[key]) playerTaskCounts[key].total += 1;
      continue;
    }
    if (!task.teamId) continue;
    const teamPids = playersByTeam.get(task.teamId) ?? [];
    const d = normalizeTaskDetails(task.details);
    const targets = getTeamTaskTargetPlayerIds(d, teamPids);
    for (const pid of targets) {
      if (playerTaskCounts[pid]) playerTaskCounts[pid].total += 1;
    }
  }

  for (const pr of progresses) {
    if (!pr.completed) continue;
    const task = tasks.find((t) => t.id === pr.taskId);
    if (!task) continue;
    if (task.playerId) {
      if (playerTaskCounts[task.playerId]) {
        playerTaskCounts[task.playerId].completed += 1;
      }
    } else if (task.teamId) {
      const teamPids = playersByTeam.get(task.teamId) ?? [];
      const d = normalizeTaskDetails(task.details);
      const targets = new Set(getTeamTaskTargetPlayerIds(d, teamPids));
      if (targets.size > 0 && targets.has(pr.playerId) && playerTaskCounts[pr.playerId]) {
        playerTaskCounts[pr.playerId].completed += 1;
      }
    }
  }

  return { teamTaskCounts, playerTaskCounts };
}

/** GET /api/tasks 와 동일한 범위로 과제만 집계 (코치는 접근 가능한 팀만) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamIdParam = searchParams.get("teamId");

  const filterByTeam = (
    input: {
      teamTaskCounts: Record<string, { total: number; completed: number; name: string }>;
      playerTaskCounts: Record<
        string,
        {
          total: number;
          completed: number;
          name: string;
          teamName: string | null;
          teamId: string | null;
        }
      >;
    },
  ) => {
    if (!teamIdParam) return input;
    const teamTaskCounts = input.teamTaskCounts[teamIdParam]
      ? { [teamIdParam]: input.teamTaskCounts[teamIdParam] }
      : {};
    const playerTaskCounts = Object.fromEntries(
      Object.entries(input.playerTaskCounts).filter(([, v]) => v.teamId === teamIdParam),
    );
    return { teamTaskCounts, playerTaskCounts };
  };

  const session = await getSession();
  let taskWhere: Prisma.TaskWhereInput | undefined;
  let teamWhere: Prisma.TeamWhereInput | undefined;
  let playerWhere: Prisma.PlayerWhereInput | undefined;

  if (isAdminApiRequest(req)) {
    if (teamIdParam) {
      const teamPlayers = await prisma.player.findMany({
        where: { teamId: teamIdParam },
        select: { id: true },
      });
      const playerIds = teamPlayers.map((p) => p.id);
      taskWhere = {
        OR: [{ teamId: teamIdParam }, { playerId: { in: playerIds } }],
      };
      teamWhere = { id: teamIdParam };
      playerWhere = { teamId: teamIdParam };
    }
    const [teams, players, tasks, progresses] = await Promise.all([
      prisma.team.findMany({ where: teamWhere }),
      prisma.player.findMany({ where: playerWhere }),
      prisma.task.findMany({ where: taskWhere }),
      prisma.taskProgress.findMany(),
    ]);
    return NextResponse.json(
      filterByTeam(buildDashboardSummary(teams, players, tasks, progresses)),
    );
  }

  if (!session) {
    return NextResponse.json({ teamTaskCounts: {}, playerTaskCounts: {} });
  }

  if (session.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (teamIdParam && player?.teamId !== teamIdParam) {
      return NextResponse.json({ teamTaskCounts: {}, playerTaskCounts: {} });
    }
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
    if (teamIdParam && !ids.includes(teamIdParam)) {
      return NextResponse.json({ teamTaskCounts: {}, playerTaskCounts: {} });
    }
    if (ids.length === 0) {
      taskWhere = { teamId: null };
      teamWhere = { id: { in: [] } };
      playerWhere = { teamId: { in: [] } };
    } else if (teamIdParam) {
      const teamPlayers = await prisma.player.findMany({
        where: { teamId: teamIdParam },
        select: { id: true },
      });
      const playerIds = teamPlayers.map((p) => p.id);
      taskWhere = {
        OR: [{ teamId: teamIdParam }, { playerId: { in: playerIds } }],
      };
      teamWhere = { id: teamIdParam };
      playerWhere = { teamId: teamIdParam };
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

  return NextResponse.json(
    filterByTeam(buildDashboardSummary(teams, players, tasks, progresses)),
  );
}
