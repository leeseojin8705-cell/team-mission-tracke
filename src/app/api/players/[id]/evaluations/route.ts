import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { getSession } from "@/lib/session";

function parseScores(raw: string): Record<string, number[]> {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) out[k] = v.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
    }
    return out;
  } catch {
    return {};
  }
}

/** GET: 해당 선수가 받은 평가 목록 (팀 내 코치들의 평가) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { teamId: true },
  });
  if (!player?.teamId) {
    return NextResponse.json([], { status: 200 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (session.role === "player") {
    if (session.playerId !== playerId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  } else if (session.role === "coach" || session.role === "owner") {
    const ids = await getAccessibleTeamIds(session);
    if (!ids.includes(player.teamId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const list = await prisma.playerEvaluation.findMany({
    where: { teamId: player.teamId, subjectPlayerId: playerId },
    orderBy: { createdAt: "desc" },
  });
  const body = list.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    evaluatorStaffId: row.evaluatorStaffId,
    subjectPlayerId: row.subjectPlayerId,
    phase: row.phase,
    scores: parseScores(row.scores),
    createdAt: row.createdAt?.toISOString?.(),
  }));
  return NextResponse.json(body);
}
