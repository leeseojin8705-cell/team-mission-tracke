import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getIdFromRequest(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];
    return id || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const id = getIdFromRequest(req);
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다. (id 없음)" }, { status: 400 });
  }
  const player = await prisma.player.findUnique({
    where: { id },
  });
  if (!player) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(player);
}

export async function PATCH(req: Request) {
  const id = getIdFromRequest(req);
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다. (id 없음)" }, { status: 400 });
  }
  try {
    const body = await req.json();

    // Prisma Client가 최신 스키마를 반영하지 못하는 문제를 피하기 위해 raw SQL 사용
    await prisma.$executeRawUnsafe(
      `UPDATE Player
       SET name = ?, position = ?, height = ?, weight = ?, dateOfBirth = ?, gender = ?, photo = ?, phone = ?
       WHERE id = ?`,
      body.name ?? null,
      body.position ?? null,
      body.height ?? null,
      body.weight ?? null,
      body.dateOfBirth ?? null,
      body.gender ?? null,
      body.photo ?? null,
      body.phone ?? null,
      id,
    );

    const updated = await prisma.player.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/players/[id] error", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
    return NextResponse.json(
      { error: message || "선수 정보를 저장하는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
) {
  const id = getIdFromRequest(req);
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다. (id 없음)" }, { status: 400 });
  }
  // 선수와 해당 선수에게만 걸린 과제를 함께 삭제
  await prisma.task.deleteMany({
    where: { playerId: id },
  });

  await prisma.player.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

