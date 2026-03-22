import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
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

    const data: Prisma.PlayerUpdateInput = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.position !== undefined) {
      data.position = body.position != null ? String(body.position) : null;
    }
    if (body.height !== undefined) {
      data.height = body.height != null ? String(body.height) : null;
    }
    if (body.weight !== undefined) {
      data.weight = body.weight != null ? String(body.weight) : null;
    }
    if (body.dateOfBirth !== undefined) {
      data.dateOfBirth = body.dateOfBirth != null ? String(body.dateOfBirth) : null;
    }
    if (body.gender !== undefined) {
      data.gender = body.gender != null ? String(body.gender) : null;
    }
    if (body.photo !== undefined) {
      data.photo = body.photo != null ? String(body.photo) : null;
    }
    if (body.phone !== undefined) {
      data.phone = body.phone != null ? String(body.phone) : null;
    }
    if (body.parentPhone !== undefined) {
      data.parentPhone = body.parentPhone != null ? String(body.parentPhone) : null;
    }
    if (body.address !== undefined) {
      data.address = body.address != null ? String(body.address) : null;
    }
    if (body.school !== undefined) {
      data.school = body.school != null ? String(body.school) : null;
    }

    const updated = await prisma.player.update({
      where: { id },
      data,
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

