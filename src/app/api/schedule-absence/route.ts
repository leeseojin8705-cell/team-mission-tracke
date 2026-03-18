import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET: scheduleId 또는 playerId로 불참 목록 조회 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("scheduleId");
  const playerId = searchParams.get("playerId");

  if (!scheduleId && !playerId) {
    return NextResponse.json(
      { error: "scheduleId 또는 playerId가 필요합니다." },
      { status: 400 },
    );
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

  return NextResponse.json(
    list.map((a) => ({
      id: a.id,
      scheduleId: a.scheduleId,
      playerId: a.playerId,
      reasons: parseJsonArray(a.reasons),
      reasonText: a.reasonText,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      schedule: a.schedule,
      player: a.player,
    })),
  );
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
    const body = await req.json();
    if (!body.scheduleId || !body.playerId) {
      return NextResponse.json(
        { error: "scheduleId, playerId는 필수입니다." },
        { status: 400 },
      );
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
