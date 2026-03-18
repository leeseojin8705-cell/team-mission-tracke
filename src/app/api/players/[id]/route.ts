import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다. (id 없음)" }, { status: 400 });
  }
  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teamId: true,
      position: true,
      height: true,
      weight: true,
      dateOfBirth: true,
      gender: true,
      photo: true,
      phone: true,
      loginId: true,
    },
  });
  if (!player) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(player);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다. (id 없음)" }, { status: 400 });
  }
  try {
    const body = await req.json();

    const name = body.name != null ? String(body.name) : null;
    const position = body.position != null ? String(body.position) : null;
    const height = body.height != null ? String(body.height) : null;
    const weight = body.weight != null ? String(body.weight) : null;
    const dateOfBirth = body.dateOfBirth != null ? String(body.dateOfBirth) : null;
    const gender = body.gender != null ? String(body.gender) : null;
    const photo = body.photo != null ? String(body.photo) : null;
    const phone = body.phone != null ? String(body.phone) : null;
    const parentPhone = body.parentPhone != null ? String(body.parentPhone) : null;
    const address = body.address != null ? String(body.address) : null;
    const school = body.school != null ? String(body.school) : null;

    await prisma.$executeRawUnsafe(
      `UPDATE Player
       SET name = ?, position = ?, height = ?, weight = ?, dateOfBirth = ?, gender = ?, photo = ?, phone = ?, parentPhone = ?, address = ?, school = ?
       WHERE id = ?`,
      name,
      position,
      height,
      weight,
      dateOfBirth,
      gender,
      photo,
      phone,
      parentPhone,
      address,
      school,
      id,
    );

    const updated = await prisma.player.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        teamId: true,
        position: true,
        height: true,
        weight: true,
        dateOfBirth: true,
        gender: true,
        photo: true,
        phone: true,
      parentPhone: true,
      address: true,
      school: true,
        loginId: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/players/[id] error", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "선수 정보를 저장하는 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

