import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 선수가 해당 경기 분석에 자기 포인트 데이터를 제출(저장) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: analysisId } = await params;
  const body = await req.json();
  const playerId = body.playerId as string | undefined;
  const events = body.events;

  if (!playerId || !events) {
    return NextResponse.json(
      { error: "playerId와 events가 필요합니다." },
      { status: 400 },
    );
  }

  const analysis = await prisma.matchAnalysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis) {
    return NextResponse.json(
      { error: "분석을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const raw = (analysis as { playerEvents?: string | null }).playerEvents;
  const current = raw
    ? (JSON.parse(raw) as Record<string, unknown>)
    : {};
  const next = { ...current, [playerId]: events };
  const playerEventsJson = JSON.stringify(next);

  await prisma.matchAnalysis.update({
    where: { id: analysisId },
    data: { playerEvents: playerEventsJson },
  });

  return NextResponse.json({ ok: true });
}
