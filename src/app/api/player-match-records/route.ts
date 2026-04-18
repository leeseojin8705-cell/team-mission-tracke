import { prisma } from "@/lib/prisma";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { getSession } from "@/lib/session";
import { isAdminApiRequest } from "@/lib/adminApiRequest";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams;
    const playerId = search.get("playerId");
    if (!playerId) {
      return NextResponse.json({ error: "playerId가 필요합니다." }, { status: 400 });
    }

    const session = await getSession();
    const adminOk = isAdminApiRequest(req);
    if (!session && !adminOk) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!target?.teamId) {
      return NextResponse.json([]);
    }
    if (!adminOk) {
      if (session!.role === "player") {
        if (session!.playerId !== playerId) {
          return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
        }
      } else if (session!.role === "coach" || session!.role === "owner") {
        const ids = await getAccessibleTeamIds(session!);
        if (!ids.includes(target.teamId)) {
          return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    const records = await prisma.playerMatchRecord.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      include: {
        matchAnalysis: {
          select: {
            id: true,
            matchName: true,
            opponent: true,
            matchDate: true,
            result: true,
          },
        },
      },
    });

    return NextResponse.json(
      records.map((r) => ({
        id: r.id,
        playerId: r.playerId,
        matchAnalysisId: r.matchAnalysisId,
        goals: r.goals,
        assists: r.assists,
        starterType: r.starterType,
        injured: r.injured,
        matchResult: r.matchResult,
        events: r.events ? JSON.parse(r.events) : null,
        createdAt: r.createdAt.toISOString(),
        match: r.matchAnalysis
          ? {
              id: r.matchAnalysis.id,
              name: r.matchAnalysis.matchName ?? r.matchAnalysis.opponent ?? null,
              date: r.matchAnalysis.matchDate
                ? r.matchAnalysis.matchDate.toISOString()
                : null,
              result: r.matchAnalysis.result ?? null,
            }
          : null,
      })),
    );
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return NextResponse.json(
      {
        error: "개인 경기 기록 조회 중 오류가 발생했습니다.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      matchAnalysisId,
      playerId,
      goals = 0,
      assists = 0,
      starterType,
      injured = false,
      matchResult,
      events,
    } = body ?? {};

    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json({ error: "playerId가 필요합니다." }, { status: 400 });
    }

    const session = await getSession();
    const adminOk = isAdminApiRequest(req);
    if (!session && !adminOk) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const target = await prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!target?.teamId) {
      return NextResponse.json({ error: "선수를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!adminOk) {
      if (session!.role === "player") {
        if (session!.playerId !== playerId) {
          return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
        }
      } else if (session!.role === "coach" || session!.role === "owner") {
        const ids = await getAccessibleTeamIds(session!);
        if (!ids.includes(target.teamId)) {
          return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    const parsedGoals = Number.isFinite(Number(goals)) ? Number(goals) : 0;
    const parsedAssists = Number.isFinite(Number(assists)) ? Number(assists) : 0;

    const record = await prisma.playerMatchRecord.create({
      data: {
        playerId,
        matchAnalysisId: typeof matchAnalysisId === "string" ? matchAnalysisId : null,
        goals: parsedGoals,
        assists: parsedAssists,
        starterType: typeof starterType === "string" ? starterType : null,
        injured: Boolean(injured),
        matchResult: typeof matchResult === "string" ? matchResult : null,
        events: events ? JSON.stringify(events) : null,
      },
    });

    return NextResponse.json({ id: record.id }, { status: 201 });
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return NextResponse.json(
      {
        error: "개인 경기 기록 저장 중 오류가 발생했습니다.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

