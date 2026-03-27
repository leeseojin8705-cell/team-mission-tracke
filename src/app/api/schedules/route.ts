import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

export async function GET(req: Request) {
  if (isAdminApiRequest(req)) {
    const schedules = await prisma.schedule.findMany({
      orderBy: { date: "asc" },
    });
    return NextResponse.json(schedules);
  }
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const teamIdParam = searchParams.get("teamId");

  let where: { teamId?: string | { in: string[] } } | undefined;

  if (session?.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (!player?.teamId) {
      return NextResponse.json([]);
    }
    where = { teamId: player.teamId };
  } else if (session && (session.role === "coach" || session.role === "owner")) {
    const ids = await getAccessibleTeamIds(session);
    where = { teamId: { in: ids } };
  } else if (!session && teamIdParam) {
    where = { teamId: teamIdParam };
  } else {
    return NextResponse.json([]);
  }

  const schedules = await prisma.schedule.findMany({
    where,
    orderBy: { date: "asc" },
  });
  return NextResponse.json(schedules);
}

export async function POST(req: Request) {
  const session = await getSession();
  const admin = isAdminApiRequest(req);
  if (
    !admin &&
    (!session || (session.role !== "coach" && session.role !== "owner"))
  ) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json();

  if (!body.title || !body.date || !body.teamId) {
    return NextResponse.json(
      { error: "title, date, teamId는 필수입니다." },
      { status: 400 },
    );
  }

  const ids = admin
    ? (await prisma.team.findMany({ select: { id: true } })).map((t) => t.id)
    : await getAccessibleTeamIds(session!);
  if (!ids.includes(body.teamId)) {
    return NextResponse.json(
      { error: "해당 팀에 일정을 등록할 수 없습니다." },
      { status: 403 },
    );
  }

  const schedule = await prisma.schedule.create({
    data: {
      title: body.title,
      date: new Date(body.date),
      teamId: body.teamId,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}

