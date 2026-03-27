import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

async function canAccessTask(taskId: string, req?: Request): Promise<boolean> {
  if (req && isAdminApiRequest(req)) {
    return true;
  }
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
  });
  if (!task) {
    return NextResponse.json({ error: "과제를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await canAccessTask(id, req))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json();

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: body.title,
      category: body.category,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      teamId: body.targetType === "team" ? body.targetId : null,
      playerId: body.targetType === "player" ? body.targetId : null,
      details: body.details ? JSON.stringify(body.details) : null,
    },
  });

  return NextResponse.json(task);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await canAccessTask(id, req))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await prisma.task.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

