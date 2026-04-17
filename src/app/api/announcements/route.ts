import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AnnouncementCategory, AnnouncementType } from "@/generated/prisma/enums";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
const CATEGORIES = ["DAILY", "SCHEDULE"] as const;
const TYPES = ["GAME", "PRACTICE", "REST", "EDUCATION", "OFFICIAL", "OTHER"] as const;

export async function GET(req: Request) {
  try {
    if (!prisma?.announcement) {
      console.error("[GET /api/announcements] prisma or prisma.announcement is undefined");
      return NextResponse.json(
        {
          error:
            "데이터베이스 연결을 사용할 수 없습니다. Prisma 클라이언트를 재생성한 뒤 서버를 재시작해 주세요.",
        },
        { status: 500 },
      );
    }

    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const teamIdParam = searchParams.get("teamId");
    const category = searchParams.get("category");

    const where: Prisma.AnnouncementWhereInput = {};

    /** 코치/오너는 관리자 PIN이 있어도 접근 가능한 팀만 (전체 DB 공지 노출 방지) */
    if (session?.role === "coach" || session?.role === "owner") {
      const ids = await getAccessibleTeamIds(session);
      if (ids.length === 0) {
        return NextResponse.json([]);
      }
      if (teamIdParam) {
        if (!ids.includes(teamIdParam)) {
          return NextResponse.json([]);
        }
        where.teamId = teamIdParam;
      } else {
        where.teamId = { in: ids };
      }
    } else if (session?.role === "player" && session.playerId) {
      const player = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      if (!player?.teamId) {
        return NextResponse.json([]);
      }
      if (teamIdParam && teamIdParam !== player.teamId) {
        return NextResponse.json([]);
      }
      where.teamId = player.teamId;
    } else if (teamIdParam) {
      // 비로그인: 해당 팀 공지만 (URL로 팀 한정)
      where.teamId = teamIdParam;
    } else {
      return NextResponse.json([]);
    }

    if (category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      where.category = category as AnnouncementCategory;
    }

    const list = await prisma.announcement.findMany({
      where,
      orderBy: { startAt: "desc" },
    });

    return NextResponse.json(
      list.map((a: (typeof list)[number]) => ({
        id: a.id,
        teamId: a.teamId,
        category: a.category,
        type: a.type,
        title: a.title,
        content: a.content,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt?.toISOString() ?? null,
        target: a.target,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    );
  } catch (e) {
    console.error("[GET /api/announcements]", e);
    const message = e instanceof Error ? e.message : "공지 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "coach" && session.role !== "owner")) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
    }

    const body = await req.json();

    if (!body.teamId || !body.title || !body.startAt) {
      return NextResponse.json(
        { error: "teamId, title, startAt은 필수입니다." },
        { status: 400 },
      );
    }

    const ids = await getAccessibleTeamIds(session);
    if (!ids.includes(body.teamId)) {
      return NextResponse.json({ error: "해당 팀에 공지를 등록할 수 없습니다." }, { status: 403 });
    }

    const category: AnnouncementCategory =
      body.category && CATEGORIES.includes(body.category)
        ? (body.category as AnnouncementCategory)
        : AnnouncementCategory.DAILY;
    const type: AnnouncementType =
      body.type && TYPES.includes(body.type)
        ? (body.type as AnnouncementType)
        : AnnouncementType.OTHER;

    const startAt = new Date(body.startAt);
    const endAt = body.endAt ? new Date(body.endAt) : null;

    const created = await prisma.announcement.create({
      data: {
        teamId: body.teamId,
        category,
        type,
        title: String(body.title).trim(),
        content: body.content != null ? String(body.content).trim() : null,
        startAt,
        endAt,
        target: body.target != null ? JSON.stringify(body.target) : null,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        teamId: created.teamId,
        category: created.category,
        type: created.type,
        title: created.title,
        content: created.content,
        startAt: created.startAt.toISOString(),
        endAt: created.endAt?.toISOString() ?? null,
        target: created.target,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/announcements error", e);
    const message =
      e instanceof Error ? e.message : "공지 등록 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
