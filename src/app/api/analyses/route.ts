import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import {
  getTeamIdsForMatchAnalysisSession,
  matchAnalysisWhereForTeams,
} from "@/lib/matchAnalysisAccess";

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const teamIdParam = searchParams.get("teamId");
  const scheduleIdParam = searchParams.get("scheduleId");

  const scopedIds = await getTeamIdsForMatchAnalysisSession(session);

  let teamIdsForQuery: string[];

  if (scopedIds !== null) {
    if (scopedIds.length === 0) {
      return NextResponse.json([]);
    }
    if (teamIdParam) {
      if (!scopedIds.includes(teamIdParam)) {
        return NextResponse.json([]);
      }
      teamIdsForQuery = [teamIdParam];
    } else {
      teamIdsForQuery = scopedIds;
    }
  } else {
    if (!teamIdParam) {
      return NextResponse.json([]);
    }
    teamIdsForQuery = [teamIdParam];
  }

  let where: Prisma.MatchAnalysisWhereInput =
    matchAnalysisWhereForTeams(teamIdsForQuery);

  if (scheduleIdParam) {
    const sch = await prisma.schedule.findUnique({
      where: { id: scheduleIdParam },
      select: { teamId: true },
    });
    if (!sch?.teamId || !teamIdsForQuery.includes(sch.teamId)) {
      return NextResponse.json([]);
    }
    where = { AND: [where, { scheduleId: scheduleIdParam }] };
  }

  const list = await prisma.matchAnalysis.findMany({
    where,
    orderBy: [{ matchDate: "desc" }, { updatedAt: "desc" }],
    include: {
      schedule: { select: { id: true, title: true, date: true } },
      team: { select: { id: true, name: true } },
    },
  });

  const items = list.map((a: (typeof list)[number]) => ({
    id: a.id,
    scheduleId: a.scheduleId ?? null,
    teamId: a.teamId ?? null,
    opponent: a.opponent ?? null,
    matchDate: a.matchDate?.toISOString() ?? null,
    matchName: a.matchName ?? null,
    result: a.result ?? null,
    events: JSON.parse(a.events) as {
      atk: unknown[];
      def: unknown[];
      pass: unknown[];
      gk: unknown[];
    },
    playerEvents: a.playerEvents ? (JSON.parse(a.playerEvents) as Record<string, unknown>) : null,
    updatedAt: a.updatedAt.toISOString(),
    schedule: a.schedule,
    team: a.team,
  }));

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "coach" && session.role !== "owner")) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const eventsJson = JSON.stringify(body.events ?? { atk: [], def: [], pass: [], gk: [] });

    const accessible = await getAccessibleTeamIds(session);
    if (accessible.length === 0) {
      return NextResponse.json({ error: "접근 가능한 팀이 없습니다." }, { status: 403 });
    }

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
    if (body.opponent != null) data.opponent = String(body.opponent).trim() || undefined;

    if (body.scheduleId) {
      const sch = await prisma.schedule.findUnique({
        where: { id: body.scheduleId },
        select: { teamId: true },
      });
      if (!sch?.teamId || !accessible.includes(sch.teamId)) {
        return NextResponse.json(
          { error: "해당 일정에 분석을 등록할 수 없습니다." },
          { status: 403 },
        );
      }
      data.scheduleId = body.scheduleId;
      data.teamId = sch.teamId;
    } else {
      const tid = typeof body.teamId === "string" ? body.teamId.trim() : "";
      if (!tid) {
        return NextResponse.json(
          { error: "teamId는 필수입니다. (팀을 선택한 뒤 저장하세요.)" },
          { status: 400 },
        );
      }
      if (!accessible.includes(tid)) {
        return NextResponse.json(
          { error: "해당 팀에 분석을 등록할 수 없습니다." },
          { status: 403 },
        );
      }
      data.teamId = tid;
    }

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
