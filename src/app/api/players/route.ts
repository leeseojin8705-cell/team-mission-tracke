import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const session = await getSession();

  let where: { teamId?: string | { in: string[] } } = {};

  if (session && (session.role === "coach" || session.role === "owner")) {
    const ids = await getAccessibleTeamIds(session);
    if (teamId) {
      if (!ids.includes(teamId)) {
        return NextResponse.json([]);
      }
      where.teamId = teamId;
    } else {
      where.teamId = { in: ids };
    }
  } else if (teamId) {
    where.teamId = teamId;
  }

  const players = await prisma.player.findMany({
    where,
    orderBy: { name: "asc" },
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

