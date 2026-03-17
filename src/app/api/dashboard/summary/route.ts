import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [teams, players, tasks, progresses] = await Promise.all([
    prisma.team.findMany(),
    prisma.player.findMany(),
    prisma.task.findMany(),
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
    { total: number; completed: number; name: string; teamName: string | null }
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

