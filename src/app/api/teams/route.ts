// src/app/api/teams/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
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