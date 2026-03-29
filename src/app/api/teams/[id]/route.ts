import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";
import { Prisma } from "@/generated/prisma/client";

function parseOrganization(raw: string | null): { front: string[]; coaching: string[]; player: string[] } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { front?: string[]; coaching?: string[]; player?: string[] };
    return {
      front: Array.isArray(o.front) ? o.front : [],
      coaching: Array.isArray(o.coaching) ? o.coaching : [],
      player: Array.isArray(o.player) ? o.player : [],
    };
  } catch {
    return null;
  }
}

function parseStatDefinition(raw: string | null): import("@/lib/types").StatDefinition | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as import("@/lib/types").StatDefinition;
    if (!o || !Array.isArray(o.categories) || typeof o.items !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (session?.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (player?.teamId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = team as { organization?: string | null; statDefinition?: string | null };
  return NextResponse.json({
    id: team.id,
    name: team.name,
    season: team.season,
    organization: parseOrganization(t.organization ?? null),
    statDefinition: parseStatDefinition(t.statDefinition ?? null),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const ids = await getAccessibleTeamIds(session);
  if (!ids.includes(id)) {
    return NextResponse.json({ error: "접근 가능한 팀이 아닙니다." }, { status: 403 });
  }
  const body = await req.json();

  const data: {
    name?: string;
    season?: string;
    organization?: string | null;
    statDefinition?: string | null;
  } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.season !== undefined) data.season = body.season;
  if (body.organization !== undefined) {
    data.organization = JSON.stringify(body.organization);
  }
  if (body.statDefinition !== undefined) {
    data.statDefinition =
      body.statDefinition == null ? null : JSON.stringify(body.statDefinition);
  }

  const team = await prisma.team.update({
    where: { id },
    data,
  });

  const rawDb = team as { organization?: string | null; statDefinition?: string | null };
  const rawOrg = rawDb.organization ?? null;
  const rawStat = rawDb.statDefinition ?? null;

  return NextResponse.json({
    id: team.id,
    name: team.name,
    season: team.season,
    organization: parseOrganization(rawOrg ?? null),
    statDefinition: parseStatDefinition(rawStat ?? null),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (isAdminApiRequest(req)) {
    const url = new URL(req.url);
    const deleteCoachAccount = url.searchParams.get("deleteCoachAccount") === "1";

    const existing = await prisma.team.findUnique({
      where: { id },
      select: { id: true, createdByUserId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "팀을 찾을 수 없습니다." }, { status: 404 });
    }
    const creatorId = existing.createdByUserId;

    try {
      await prisma.team.delete({
        where: { id },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2003") {
          return NextResponse.json(
            {
              error:
                "연결된 데이터(일정·과제 등)가 있어 삭제할 수 없습니다. 데이터 정리 후 다시 시도해 주세요.",
            },
            { status: 409 },
          );
        }
        if (e.code === "P2025") {
          return NextResponse.json({ error: "팀을 찾을 수 없습니다." }, { status: 404 });
        }
      }
      console.error("[DELETE /api/teams/[id]] admin", e);
      return NextResponse.json({ error: "팀 삭제 처리 중 오류가 발생했습니다." }, { status: 500 });
    }

    /** 팀 생성 코치 계정: 다른 팀을 더 만들지 않은 coach User 만 (조직 소유자 제외) */
    let coachAccountDeleted = false;
    if (deleteCoachAccount && creatorId) {
      const remainingTeams = await prisma.team.count({
        where: { createdByUserId: creatorId },
      });
      if (remainingTeams === 0) {
        const u = await prisma.user.findUnique({
          where: { id: creatorId },
          select: {
            role: true,
            organizations: { select: { id: true }, take: 1 },
          },
        });
        if (u?.role === "coach" && u.organizations.length === 0) {
          try {
            await prisma.user.delete({ where: { id: creatorId } });
            coachAccountDeleted = true;
          } catch (err) {
            console.error("[DELETE /api/teams/[id]] admin user delete", err);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, coachAccountDeleted });
  }

  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const ids = await getAccessibleTeamIds(session);
  if (!ids.includes(id)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    await prisma.team.delete({
      where: { id },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "연결된 데이터(일정·과제 등)가 있어 삭제할 수 없습니다. 데이터 정리 후 다시 시도해 주세요.",
          },
          { status: 409 },
        );
      }
      if (e.code === "P2025") {
        return NextResponse.json({ error: "팀을 찾을 수 없습니다." }, { status: 404 });
      }
    }
    console.error("[DELETE /api/teams/[id]]", e);
    return NextResponse.json({ error: "팀 삭제 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

