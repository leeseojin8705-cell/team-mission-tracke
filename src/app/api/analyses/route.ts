import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const scheduleId = searchParams.get("scheduleId");

  const where: { teamId?: string; scheduleId?: string } = {};
  if (teamId) where.teamId = teamId;
  if (scheduleId) where.scheduleId = scheduleId;

  const list = await prisma.matchAnalysis.findMany({
    where,
    orderBy: [{ matchDate: "desc" }, { updatedAt: "desc" }],
    include: {
      schedule: { select: { id: true, title: true, date: true } },
      team: { select: { id: true, name: true } },
    },
  });

  const items = list.map((a) => ({
    id: a.id,
    scheduleId: a.scheduleId ?? null,
    teamId: a.teamId ?? null,
    opponent: a.opponent ?? null,
    matchDate: a.matchDate?.toISOString() ?? null,
    matchName: a.matchName ?? null,
    result: a.result ?? null,
    events: JSON.parse(a.events) as { atk: unknown[]; def: unknown[]; pass: unknown[]; gk: unknown[] },
    playerEvents: a.playerEvents ? (JSON.parse(a.playerEvents) as Record<string, unknown>) : null,
    updatedAt: a.updatedAt.toISOString(),
    schedule: a.schedule,
    team: a.team,
  }));

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();

  const eventsJson = JSON.stringify(body.events ?? { atk: [], def: [], pass: [], gk: [] });

  const data: {
    scheduleId?: string;
    teamId?: string;
    opponent?: string;
    matchDate?: Date;
    matchName?: string;
    result?: string;
    events: string;
  } = { events: eventsJson };

  if (body.matchDate) data.matchDate = new Date(body.matchDate);
  if (body.matchName != null) data.matchName = String(body.matchName).trim() || undefined;
  if (body.result != null) data.result = String(body.result).trim() || undefined;
  if (body.scheduleId) data.scheduleId = body.scheduleId;
  if (body.teamId) data.teamId = body.teamId;
  if (body.opponent != null) data.opponent = String(body.opponent).trim() || undefined;

  try {
    const created = await prisma.matchAnalysis.create({
      data,
      include: {
        schedule: { select: { id: true, title: true, date: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
    {
      id: created.id,
      scheduleId: created.scheduleId ?? null,
      teamId: created.teamId ?? null,
      opponent: created.opponent ?? null,
      matchDate: created.matchDate?.toISOString() ?? null,
      matchName: created.matchName ?? null,
      result: created.result ?? null,
      events: JSON.parse(created.events),
      playerEvents: created.playerEvents ? JSON.parse(created.playerEvents) : null,
      updatedAt: created.updatedAt.toISOString(),
      schedule: created.schedule,
      team: created.team,
    },
    { status: 201 },
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
