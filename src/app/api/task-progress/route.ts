import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { playerCanAccessTeamScopedTask } from "@/lib/taskAssignees";

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId");
  const taskId = searchParams.get("taskId");

  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { teamId: true, playerId: true, details: true },
    });
    if (!task) {
      return NextResponse.json([]);
    }
    if (session?.role === "player" && session.playerId) {
      const p = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      if (
        !playerCanAccessTeamScopedTask(session.playerId, p?.teamId, {
          teamId: task.teamId,
          playerId: task.playerId,
          details: task.details,
        })
      ) {
        return NextResponse.json([]);
      }
    } else if (session?.role === "coach" || session?.role === "owner") {
      const ids = await getAccessibleTeamIds(session);
      if (task.teamId && !ids.includes(task.teamId)) {
        return NextResponse.json([]);
      }
      if (!task.teamId && task.playerId) {
        const pl = await prisma.player.findUnique({
          where: { id: task.playerId },
          select: { teamId: true },
        });
        if (!pl?.teamId || !ids.includes(pl.teamId)) {
          return NextResponse.json([]);
        }
      }
    } else {
      return NextResponse.json([]);
    }

    const items = await prisma.taskProgress.findMany({
      where: { taskId },
    });
    return NextResponse.json(items);
  }

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId 또는 taskId 중 하나는 필수입니다." },
      { status: 400 },
    );
  }

  if (session?.role === "player" && session.playerId !== playerId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  if (session?.role === "coach" || session?.role === "owner") {
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!target?.teamId) {
      return NextResponse.json([]);
    }
    const ids = await getAccessibleTeamIds(session);
    if (!ids.includes(target.teamId)) {
      return NextResponse.json([]);
    }
  } else if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const items = await prisma.taskProgress.findMany({
    where: { playerId },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await getSession();
  const body = await req.json();

  if (!body.taskId || !body.playerId) {
    return NextResponse.json(
      { error: "taskId와 playerId는 필수입니다." },
      { status: 400 },
    );
  }

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (session.role === "player" && session.playerId !== body.playerId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  if (session.role === "coach" || session.role === "owner") {
    const target = await prisma.player.findUnique({
      where: { id: body.playerId },
      select: { teamId: true },
    });
    const ids = await getAccessibleTeamIds(session);
    if (!target?.teamId || !ids.includes(target.teamId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  if (session.role === "player" && session.playerId === body.playerId) {
    const task = await prisma.task.findUnique({
      where: { id: body.taskId },
      select: { teamId: true, playerId: true, details: true },
    });
    if (!task) {
      return NextResponse.json({ error: "과제를 찾을 수 없습니다." }, { status: 404 });
    }
    const p = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (
      !playerCanAccessTeamScopedTask(session.playerId, p?.teamId, {
        teamId: task.teamId,
        playerId: task.playerId,
        details: task.details,
      })
    ) {
      return NextResponse.json(
        { error: "이 과제에 할당된 선수만 진행할 수 있습니다." },
        { status: 403 },
      );
    }
  }

  const progress = await prisma.taskProgress.upsert({
    where: {
      taskId_playerId: {
        taskId: body.taskId,
        playerId: body.playerId,
      },
    },
    update: {
      completed: body.completed ?? false,
      note: body.note ?? "",
    },
    create: {
      taskId: body.taskId,
      playerId: body.playerId,
      completed: body.completed ?? false,
      note: body.note ?? "",
    },
  });

  return NextResponse.json(progress);
}
