import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const teamIdParam = searchParams.get("teamId");

  let where: Prisma.ScheduleWhereInput | undefined;

  if (isAdminApiRequest(req)) {
    where = teamIdParam ? { teamId: teamIdParam } : undefined;
    const schedules = await prisma.schedule.findMany({
      where,
      orderBy: { date: "asc" },
    });
    return NextResponse.json(schedules);
  }

  /** 코치/오너는 접근 가능한 팀 일정만 */
  if (session?.role === "coach" || session?.role === "owner") {
    const ids = await getAccessibleTeamIds(session);
    if (ids.length === 0) {
      return NextResponse.json([]);
    }
    if (teamIdParam) {
      if (!ids.includes(teamIdParam)) {
        return NextResponse.json([]);
      }
      where = { teamId: teamIdParam };
    } else {
      where = { teamId: { in: ids } };
    }
  } else if (session?.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (!player?.teamId) {
      return NextResponse.json([]);
    }
    if (teamIdParam && teamIdParam !== player.teamId) {
      return NextResponse.json([]);
    }
    where = { teamId: player.teamId };
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
  const adminOk = isAdminApiRequest(req);
  if (
    (!session || (session.role !== "coach" && session.role !== "owner")) &&
    !adminOk
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

  if (adminOk) {
    const team = await prisma.team.findUnique({
      where: { id: body.teamId },
      select: { id: true },
    });
    if (!team) {
      return NextResponse.json({ error: "팀을 찾을 수 없습니다." }, { status: 400 });
    }
  } else {
    const ids = await getAccessibleTeamIds(session!);
    if (!ids.includes(body.teamId)) {
      return NextResponse.json(
        { error: "해당 팀에 일정을 등록할 수 없습니다." },
        { status: 403 },
      );
    }
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

