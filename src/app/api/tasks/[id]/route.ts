import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { applyPlayerTaskVisibility } from "@/lib/playerTaskVisibility";
import { playerCanAccessTeamScopedTask } from "@/lib/taskAssignees";
import type { Task } from "@/lib/types";

async function coachCanAccessTaskRow(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  task: { teamId: string | null; playerId: string | null },
): Promise<boolean> {
  if (session.role !== "coach" && session.role !== "owner") return false;
  let teamId = task.teamId;
  if (!teamId && task.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: task.playerId },
      select: { teamId: true },
    });
    teamId = player?.teamId ?? null;
  }
  if (!teamId) return false;
  const ids = await getAccessibleTeamIds(session);
  return ids.includes(teamId);
}

async function canPlayerAccessTask(
  playerId: string,
  task: { teamId: string | null; playerId: string | null; details?: unknown },
): Promise<boolean> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { teamId: true },
  });
  return playerCanAccessTeamScopedTask(playerId, player?.teamId, {
    teamId: task.teamId,
    playerId: task.playerId,
    details: task.details,
  });
}

async function canAccessTask(taskId: string): Promise<boolean> {
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return false;
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, teamId: true, playerId: true },
  });
  if (!task) return false;

  let teamId = task.teamId;
  if (!teamId && task.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: task.playerId },
      select: { teamId: true },
    });
    teamId = player?.teamId ?? null;
  }
  if (!teamId) return false;

  const ids = await getAccessibleTeamIds(session);
  return ids.includes(teamId);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
  });
  if (!task) {
    return NextResponse.json({ error: "과제를 찾을 수 없습니다." }, { status: 404 });
  }

  const session = await getSession();

  if (session && (session.role === "coach" || session.role === "owner")) {
    const ok = await coachCanAccessTaskRow(session, task);
    if (!ok) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    return NextResponse.json(task);
  }

  const playerId =
    session?.role === "player" && session.playerId ? session.playerId : null;

  if (playerId && (await canPlayerAccessTask(playerId, task as { teamId: string | null; playerId: string | null; details: unknown }))) {
    return NextResponse.json(
      applyPlayerTaskVisibility(task as unknown as Task, new Date()),
    );
  }

  return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await canAccessTask(id))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json();

  const targetIds: string[] =
    body.targetType === "player"
      ? Array.isArray(body.targetIds)
        ? body.targetIds.filter((x: unknown) => typeof x === "string" && x.length > 0)
        : typeof body.targetId === "string" && body.targetId
          ? [body.targetId]
          : []
      : [];

  let nextTeamId: string | null =
    body.targetType === "team" ? (body.targetId as string) : null;
  let nextPlayerId: string | null = null;
  let detailsPayload: unknown = body.details ?? null;

  if (body.targetType === "player" && targetIds.length > 1) {
    const pls = await prisma.player.findMany({
      where: { id: { in: targetIds } },
      select: { teamId: true },
    });
    const tset = new Set(
      pls.map((p) => p.teamId).filter((t): t is string => Boolean(t)),
    );
    if (tset.size !== 1) {
      return NextResponse.json(
        { error: "같은 팀 선수만 한 과제로 묶을 수 있습니다." },
        { status: 400 },
      );
    }
    nextTeamId = [...tset][0]!;
    nextPlayerId = null;
    const base =
      body.details && typeof body.details === "object"
        ? { ...(body.details as Record<string, unknown>) }
        : {};
    base.assigneePlayerIds = targetIds;
    detailsPayload = base;
  } else if (body.targetType === "player" && targetIds.length === 1) {
    nextPlayerId = targetIds[0]!;
    const p = await prisma.player.findUnique({
      where: { id: nextPlayerId },
      select: { teamId: true },
    });
    nextTeamId = p?.teamId ?? null;
    if (body.details && typeof body.details === "object") {
      const d = { ...(body.details as Record<string, unknown>) };
      delete d.assigneePlayerIds;
      detailsPayload = d;
    }
  } else if (body.targetType === "team") {
    if (body.details && typeof body.details === "object") {
      const d = { ...(body.details as Record<string, unknown>) };
      delete d.assigneePlayerIds;
      detailsPayload = d;
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: body.title,
      category: body.category,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      teamId: nextTeamId,
      playerId: nextPlayerId,
      details: detailsPayload ? JSON.stringify(detailsPayload) : null,
    },
  });

  return NextResponse.json(task);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await canAccessTask(id))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.taskProgress.deleteMany({ where: { taskId: id } });
      await tx.playerEvaluation.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });
  } catch (e) {
    console.error("[DELETE /api/tasks/:id]", e);
    const message = e instanceof Error ? e.message : "과제 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

