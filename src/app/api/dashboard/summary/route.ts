import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

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

  const sessionEarly = await getSession();
  const coachOrOwnerEarly =
    sessionEarly?.role === "coach" || sessionEarly?.role === "owner";

  /** PIN만 있는 비로그인 관리자만 DB 전체 집계 — 코치/오너 로그인 시 본인 스코프로 아래 처리 */
  if (isAdminApiRequest(req) && !coachOrOwnerEarly) {
    const [teams, players, tasks, progresses] = await Promise.all([
      prisma.team.findMany(),
      prisma.player.findMany(),
      prisma.task.findMany(),
      prisma.taskProgress.findMany(),
    ]);
    return NextResponse.json(
      filterByTeam(buildDashboardSummary(teams, players, tasks, progresses)),
    );
  }

  const session = sessionEarly;
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
