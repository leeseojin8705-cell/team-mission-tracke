import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const schedules = await prisma.schedule.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json(schedules);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!body.title || !body.date || !body.teamId) {
    return NextResponse.json(
      { error: "title, date, teamId는 필수입니다." },
      { status: 400 },
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

