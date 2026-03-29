// src/app/api/teams/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const contextTeamId = url.searchParams.get("contextTeamId");

    let session: Awaited<ReturnType<typeof getSession>> = null;
    try {
      session = await getSession();
    } catch (sessionError) {
      // Keep public team listing available even when cookie parsing fails.
      console.warn("[GET /api/teams] session read failed, fallback to public scope", sessionError);
      session = null;
    }
    if (!prisma?.team) {
      console.error("[GET /api/teams] prisma or prisma.team is undefined");
      return NextResponse.json(
        { error: "데이터베이스 연결을 사용할 수 없습니다. Prisma 클라이언트를 재생성한 뒤 서버를 재시작해 주세요." },
        { status: 500 },
      );
    }

    const listAll = url.searchParams.get("listAll") === "1";
    const myTeamsOnly = url.searchParams.get("myTeamsOnly") === "1";
    /** 조직 소속 전체 팀(다른 코치가 만든 팀 포함) — 기본은 내가 생성한 팀만 */
    const allAccessible = url.searchParams.get("allAccessible") === "1";
    const coachOrOwner = session?.role === "coach" || session?.role === "owner";

    /** 관리자 PIN 전체 목록 (선수 세션은 제외 — PIN이 있어도 본인 팀만) */
    if (
      isAdminApiRequest(req) &&
      session?.role !== "player" &&
      (!coachOrOwner || listAll)
    ) {
      const teams = await prisma.team.findMany({
        orderBy: { name: "asc" },
      });
      return NextResponse.json(
        teams.map((t) => {
          const rawOrg = (t as { organization?: string | null }).organization;
          const rawStat = (t as { statDefinition?: string | null }).statDefinition;
          return {
            id: t.id,
            name: t.name,
            season: t.season,
            organizationId: t.organizationId ?? null,
            organization: parseOrganization(rawOrg ?? null),
            statDefinition: parseStatDefinition(rawStat ?? null),
          };
        }),
      );
    }

    const singleTeamIdParam = url.searchParams.get("teamId");

    if (session?.role === "player" && session.playerId) {
      const player = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      if (!player?.teamId) {
        return NextResponse.json([]);
      }
      if (singleTeamIdParam && singleTeamIdParam !== player.teamId) {
        return NextResponse.json([]);
      }
      const teams = await prisma.team.findMany({
        where: { id: player.teamId },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(
        teams.map((t) => {
          const rawOrg = (t as { organization?: string | null }).organization;
          const rawStat = (t as { statDefinition?: string | null }).statDefinition;
          return {
            id: t.id,
            name: t.name,
            season: t.season,
            organizationId: t.organizationId ?? null,
            organization: parseOrganization(rawOrg ?? null),
            statDefinition: parseStatDefinition(rawStat ?? null),
          };
        }),
      );
    }

    if (!session) {
      if (singleTeamIdParam) {
        const teams = await prisma.team.findMany({
          where: { id: singleTeamIdParam },
          orderBy: { name: "asc" },
        });
        return NextResponse.json(
          teams.map((t) => {
            const rawOrg = (t as { organization?: string | null }).organization;
            const rawStat = (t as { statDefinition?: string | null }).statDefinition;
            return {
              id: t.id,
              name: t.name,
              season: t.season,
              organizationId: t.organizationId ?? null,
              organization: parseOrganization(rawOrg ?? null),
              statDefinition: parseStatDefinition(rawStat ?? null),
            };
          }),
        );
      }
      return NextResponse.json([]);
    }

    let accessibleIds: string[] = [];
    if (session && (session.role === "coach" || session.role === "owner")) {
      /** 기본: 본인이 생성한 팀만. 조직·스태프로 접근 가능한 전체 팀은 ?allAccessible=1 */
      const useCreatedOnly = !allAccessible || myTeamsOnly;
      if (useCreatedOnly) {
        // Prisma는 where에 undefined가 있으면 해당 조건을 빼버림 → userId 없을 때 전체 팀이 노출되는 버그 방지
        const creatorId =
          typeof session.userId === "string" && session.userId.length > 0
            ? session.userId
            : null;
        if (!creatorId) {
          return NextResponse.json([]);
        }
        const mineWhere: { createdByUserId: string; id?: { in: string[] } } = {
          createdByUserId: creatorId,
        };
        if (contextTeamId) {
          const ctx = await prisma.team.findUnique({
            where: { id: contextTeamId },
            select: { organizationId: true, id: true },
          });
          if (!ctx) {
            return NextResponse.json([]);
          }
          const inScope =
            ctx.organizationId != null
              ? (
                  await prisma.team.findMany({
                    where: { organizationId: ctx.organizationId },
                    select: { id: true },
                  })
                ).map((t) => t.id)
              : [ctx.id];
          mineWhere.id = { in: inScope };
        }
        const mine = await prisma.team.findMany({
          where: mineWhere,
          orderBy: { name: "asc" },
        });
        return NextResponse.json(
          mine.map((t) => {
            const rawOrg = (t as { organization?: string | null }).organization;
            const rawStat = (t as { statDefinition?: string | null }).statDefinition;
            return {
              id: t.id,
              name: t.name,
              season: t.season,
              organizationId: t.organizationId ?? null,
              organization: parseOrganization(rawOrg ?? null),
              statDefinition: parseStatDefinition(rawStat ?? null),
            };
          }),
        );
      }

      try {
        accessibleIds = await getAccessibleTeamIds(session);
      } catch (accessError) {
        console.warn("[GET /api/teams] access scope resolution failed", accessError);
        return NextResponse.json([]);
      }
      if (accessibleIds.length === 0) {
        return NextResponse.json([]);
      }
    } else if (session) {
      return NextResponse.json([]);
    }

    let scopeIds: string[] | null = null;
    if (contextTeamId) {
      const ctx = await prisma.team.findUnique({
        where: { id: contextTeamId },
        select: { organizationId: true, id: true },
      });
      if (!ctx) {
        return NextResponse.json([]);
      }
      if (ctx.organizationId) {
        const inOrg = await prisma.team.findMany({
          where: { organizationId: ctx.organizationId },
          select: { id: true },
        });
        scopeIds = inOrg.map((t) => t.id);
      } else {
        scopeIds = [ctx.id];
      }
    }

    const intersectIds: string[] =
      contextTeamId && scopeIds
        ? scopeIds.filter((id) => accessibleIds.includes(id))
        : accessibleIds;

    if (intersectIds.length === 0) {
      return NextResponse.json([]);
    }

    const teams = await prisma.team.findMany({
      where: { id: { in: intersectIds } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      teams.map((t) => {
        const rawOrg = (t as { organization?: string | null }).organization;
        const rawStat = (t as { statDefinition?: string | null }).statDefinition;
        return {
          id: t.id,
          name: t.name,
          season: t.season,
          organizationId: t.organizationId ?? null,
          organization: parseOrganization(rawOrg ?? null),
          statDefinition: parseStatDefinition(rawStat ?? null),
        };
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "팀 목록 조회 실패";
    console.error("[GET /api/teams]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (
      !isAdminApiRequest(req) &&
      (!session || (session.role !== "coach" && session.role !== "owner"))
    ) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
    }

    const body = await req.json();
    const organizationJson = body.organization != null ? JSON.stringify(body.organization) : null;
    const statDefinitionJson = body.statDefinition != null ? JSON.stringify(body.statDefinition) : null;

    const createdByUserId =
      session?.role === "coach" || session?.role === "owner" ? session.userId : null;

    const team = await prisma.team.create({
      data: {
        name: body.name,
        season: body.season ?? "",
        organization: organizationJson,
        statDefinition: statDefinitionJson,
        ...(createdByUserId ? { createdByUserId } : {}),
      },
    });

    return NextResponse.json(
      {
        id: team.id,
        name: team.name,
        season: team.season,
        organization: parseOrganization(team.organization ?? null),
        statDefinition: parseStatDefinition(team.statDefinition ?? null),
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "팀 생성 실패";
    console.error("[POST /api/teams]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}