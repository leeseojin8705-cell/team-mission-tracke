import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

/** GET: scheduleId 또는 playerId로 불참 목록 조회 */
export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("scheduleId");
  const playerId = searchParams.get("playerId");

  if (!scheduleId && !playerId) {
    return NextResponse.json(
      { error: "scheduleId 또는 playerId가 필요합니다." },
      { status: 400 },
    );
  }

  if (playerId && session?.role === "player" && session.playerId !== playerId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  if (playerId && (session?.role === "coach" || session?.role === "owner")) {
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    const ids = await getAccessibleTeamIds(session);
    if (!target?.teamId || !ids.includes(target.teamId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  if (scheduleId && session?.role === "player" && session.playerId) {
    const sch = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { teamId: true },
    });
    const me = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (!sch?.teamId || sch.teamId !== me?.teamId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  if (scheduleId && (session?.role === "coach" || session?.role === "owner")) {
    const sch = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { teamId: true },
    });
    const ids = await getAccessibleTeamIds(session);
    if (!sch?.teamId || !ids.includes(sch.teamId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  if (!session) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const where: { scheduleId?: string; playerId?: string } = {};
  if (scheduleId) where.scheduleId = scheduleId;
  if (playerId) where.playerId = playerId;

  const list = await prisma.scheduleAbsence.findMany({
    where,
    include: {
      schedule: { select: { id: true, title: true, date: true, teamId: true } },
      player: { select: { id: true, name: true, position: true } },
    },
  });

  return NextResponse.json(mapAbsences(list));
}

function mapAbsences(
  list: {
    id: string;
    scheduleId: string;
    playerId: string;
    reasons: string;
    reasonText: string | null;
    createdAt: Date;
    updatedAt: Date;
    schedule: {
      id: string;
      title: string;
      date: Date;
      teamId: string;
    };
    player: { id: string; name: string; position: string | null };
  }[],
) {
  return list.map((a) => ({
    id: a.id,
    scheduleId: a.scheduleId,
    playerId: a.playerId,
    reasons: parseJsonArray(a.reasons),
    reasonText: a.reasonText,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    schedule: a.schedule,
    player: a.player,
  }));
}

function parseJsonArray(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

/** POST: 불참 신청/수정 (upsert) */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    if (!body.scheduleId || !body.playerId) {
      return NextResponse.json(
        { error: "scheduleId, playerId는 필수입니다." },
        { status: 400 },
      );
    }

    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (session.role === "player" && session.playerId !== body.playerId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (session.role === "coach" || session.role === "owner") {
      const target = await prisma.player.findUnique({
        where: { id: body.playerId },
        select: { teamId: true },
      });
      const ids = await getAccessibleTeamIds(session);
      if (!target?.teamId || !ids.includes(target.teamId)) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    const sch = await prisma.schedule.findUnique({
      where: { id: body.scheduleId },
      select: { teamId: true },
    });
    const pl = await prisma.player.findUnique({
      where: { id: body.playerId },
      select: { teamId: true },
    });
    if (!sch?.teamId || sch.teamId !== pl?.teamId) {
      return NextResponse.json({ error: "일정과 선수 팀이 일치하지 않습니다." }, { status: 400 });
    }

    const reasons = Array.isArray(body.reasons)
      ? body.reasons.map(String)
      : [];
    const reasonText =
      body.reasonText != null ? String(body.reasonText).trim() : null;

    const created = await prisma.scheduleAbsence.upsert({
      where: {
        scheduleId_playerId: {
          scheduleId: body.scheduleId,
          playerId: body.playerId,
        },
      },
      update: {
        reasons: JSON.stringify(reasons),
        reasonText,
      },
      create: {
        scheduleId: body.scheduleId,
        playerId: body.playerId,
        reasons: JSON.stringify(reasons),
        reasonText,
      },
    });

    return NextResponse.json({
      id: created.id,
      scheduleId: created.scheduleId,
      playerId: created.playerId,
      reasons: parseJsonArray(created.reasons),
      reasonText: created.reasonText,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error("POST /api/schedule-absence error", e);
    const message =
      e instanceof Error ? e.message : "불참 신청 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
