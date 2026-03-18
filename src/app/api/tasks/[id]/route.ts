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

  const updatedBase = await prisma.task.update({
    where: { id },
    data: {
      title: body.title,
      category: body.category,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
  });

  // teamId / playerId / details 는 raw SQL 로 업데이트 (Prisma Client 스키마 불일치 회피)
  await prisma.$executeRawUnsafe(
    `UPDATE Task
     SET teamId = ?, playerId = ?, details = ?
     WHERE id = ?`,
    body.targetType === "team" ? body.targetId : null,
    body.targetType === "player" ? body.targetId : null,
    body.details ? JSON.stringify(body.details) : null,
    id,
  );

  const task = await prisma.task.findUnique({ where: { id } });

  return NextResponse.json(task ?? updatedBase);
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

