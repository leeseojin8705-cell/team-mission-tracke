import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { canAccessMatchAnalysis } from "@/lib/matchAnalysisAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

/** 선수가 해당 경기 분석에 자기 포인트 데이터를 제출(저장) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
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
    select: { teamId: true, scheduleId: true },
  });

  if (!analysis) {
    return NextResponse.json(
      { error: "분석을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (session?.role === "player" && session.playerId) {
    if (playerId !== session.playerId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!player?.teamId) {
      return NextResponse.json({ error: "팀 정보가 없습니다." }, { status: 403 });
    }
    const ok = await canAccessMatchAnalysis(
      { role: "player", playerId: session.playerId },
      analysis,
      req,
    );
    if (!ok) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  } else if (session?.role === "coach" || session?.role === "owner") {
    const coachOk = await canAccessMatchAnalysis(session, analysis, req);
    if (!coachOk) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!target?.teamId) {
      return NextResponse.json({ error: "선수를 찾을 수 없습니다." }, { status: 404 });
    }
    const ids = await getAccessibleTeamIds(session);
    if (!ids.includes(target.teamId)) {
      return NextResponse.json({ error: "해당 선수 팀에 접근할 수 없습니다." }, { status: 403 });
    }
  } else if (isAdminApiRequest(req)) {
    const ok = await canAccessMatchAnalysis(null, analysis, req);
    if (!ok) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!target?.teamId) {
      return NextResponse.json({ error: "선수를 찾을 수 없습니다." }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const full = await prisma.matchAnalysis.findUnique({
    where: { id: analysisId },
  });
  if (!full) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  const raw = (full as { playerEvents?: string | null }).playerEvents;
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
