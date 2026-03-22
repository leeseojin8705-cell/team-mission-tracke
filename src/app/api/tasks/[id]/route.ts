import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.task.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

