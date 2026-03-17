import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const players = await prisma.player.findMany({
    where: teamId ? { teamId } : undefined,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(players);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!body.name || !body.teamId) {
    return NextResponse.json(
      { error: "name과 teamId는 필수입니다." },
      { status: 400 },
    );
  }

  const player = await prisma.player.create({
    data: {
      name: body.name,
      teamId: body.teamId,
      position: body.position || null,
      height: body.height ?? null,
      weight: body.weight ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      gender: body.gender ?? null,
      photo: body.photo ?? null,
      phone: body.phone ?? null,
    },
  });

  return NextResponse.json(player, { status: 201 });
}

