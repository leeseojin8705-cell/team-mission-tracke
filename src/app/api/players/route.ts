import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    let session: Awaited<ReturnType<typeof getSession>> = null;
    try {
      session = await getSession();
    } catch (sessionError) {
      console.warn("[GET /api/players] session read failed, fallback to public scope", sessionError);
      session = null;
    }

    const coachOrOwner = session?.role === "coach" || session?.role === "owner";

    /**
     * 관리자 PIN: 비로그인(코치/오너 아님)일 때만 teamId 없으면 전체 선수(관리용).
     * 코치/오너 로그인 중이면 아래에서 접근 가능 팀만.
     */
    if (isAdminApiRequest(req) && session?.role !== "player" && !coachOrOwner) {
      const players = await prisma.player.findMany({
        where: teamId ? { teamId } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          teamId: true,
          position: true,
          height: true,
          weight: true,
          dateOfBirth: true,
          gender: true,
          photo: true,
          phone: true,
          parentPhone: true,
          address: true,
          school: true,
          loginId: true,
        },
      });
      return NextResponse.json(players);
    }

    const where: { teamId?: string | { in: string[] }; id?: string } = {};

    if (session && (session.role === "coach" || session.role === "owner")) {
      try {
        const ids = await getAccessibleTeamIds(session);
        if (ids.length === 0) {
          return NextResponse.json([]);
        }
        if (teamId) {
          if (!ids.includes(teamId)) {
            return NextResponse.json([]);
          }
          where.teamId = teamId;
        } else {
          where.teamId = { in: ids };
        }
      } catch (accessError) {
        console.warn("[GET /api/players] access scope resolution failed, fallback to public scope", accessError);
        if (teamId) {
          where.teamId = teamId;
        }
      }
    } else if (session?.role === "player" && session.playerId) {
      const me = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      if (!me?.teamId) {
        where.id = session.playerId;
      } else {
        if (teamId && teamId !== me.teamId) {
          return NextResponse.json([]);
        }
        where.teamId = teamId ?? me.teamId;
      }
    } else if (!session) {
      if (!teamId) {
        return NextResponse.json([]);
      }
      where.teamId = teamId;
    } else {
      return NextResponse.json([]);
    }

    const players = await prisma.player.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      teamId: true,
      position: true,
      height: true,
      weight: true,
      dateOfBirth: true,
      gender: true,
      photo: true,
      phone: true,
      parentPhone: true,
      address: true,
      school: true,
      loginId: true,
    },
  });
    return NextResponse.json(players);
  } catch (e) {
    console.error("[GET /api/players]", e);
    const message = e instanceof Error ? e.message : "선수 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name || !body.teamId) {
    return NextResponse.json(
      { error: "name과 teamId는 필수입니다." },
      { status: 400 },
    );
  }

  const ids = await getAccessibleTeamIds(session);
  if (!ids.includes(body.teamId)) {
    return NextResponse.json({ error: "접근 가능한 팀이 아닙니다." }, { status: 403 });
  }

  const player = await prisma.player.create({
    data: {
      name: body.name,
      teamId: body.teamId,
      position: body.position || null,
      height: body.height ?? null,
      weight: body.weight ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      gender: body.gender ?? null,
      photo: body.photo ?? null,
      phone: body.phone ?? null,
    },
  });

  return NextResponse.json(player, { status: 201 });
}

