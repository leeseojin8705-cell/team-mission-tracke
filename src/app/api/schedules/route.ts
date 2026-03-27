import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

export async function GET(req: Request) {
  const session = await getSession();
  let where: { teamId?: { in: string[] } } | undefined;

  if (session && (session.role === "coach" || session.role === "owner")) {
    const ids = await getAccessibleTeamIds(session);
    where = { teamId: { in: ids } };
  }

  const schedules = await prisma.schedule.findMany({
    where,
    orderBy: { date: "asc" },
  });
  return NextResponse.json(schedules);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json();

  if (!body.title || !body.date || !body.teamId) {
    return NextResponse.json(
      { error: "title, date, teamId는 필수입니다." },
      { status: 400 },
    );
  }

  const ids = await getAccessibleTeamIds(session);
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

