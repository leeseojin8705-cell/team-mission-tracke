// src/app/api/teams/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

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
    const session = await getSession();
    if (!prisma?.team) {
      console.error("[GET /api/teams] prisma or prisma.team is undefined");
      return NextResponse.json(
        { error: "데이터베이스 연결을 사용할 수 없습니다. Prisma 클라이언트를 재생성한 뒤 서버를 재시작해 주세요." },
        { status: 500 },
      );
    }
    let where: { id?: { in: string[] } } | undefined;
    if (session && session.role === "coach") {
      const ids = await getAccessibleTeamIds(session);
      where = { id: { in: ids } };
    }
    const teams = await prisma.team.findMany({
      where,
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
  const body = await req.json();
  const organizationJson =
    body.organization != null ? JSON.stringify(body.organization) : null;
  const team = await prisma.team.create({
    data: {
      name: body.name,
      season: body.season ?? "",
    },
  });
  if (organizationJson !== null) {
    await (prisma as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
      "UPDATE Team SET organization = ? WHERE id = ?",
      organizationJson,
      team.id,
    );
  }
  const raw = organizationJson;
  return NextResponse.json(
    {
      id: team.id,
      name: team.name,
      season: team.season,
      organization: parseOrganization(raw),
    },
    { status: 201 },
  );
}