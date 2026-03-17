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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  const body = await req.json();

  const data: { name?: string; season?: string } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.season !== undefined) data.season = body.season;

  const team = await prisma.team.update({
    where: { id },
    data,
  });

  const rawDb = team as { organization?: string | null; statDefinition?: string | null };

  if (body.organization !== undefined) {
    const organizationJson = JSON.stringify(body.organization);
    await (prisma as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
      "UPDATE Team SET organization = ? WHERE id = ?",
      organizationJson,
      id,
    );
  }

  if (body.statDefinition !== undefined) {
    const statJson = body.statDefinition == null ? null : JSON.stringify(body.statDefinition);
    await (prisma as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
      "UPDATE Team SET statDefinition = ? WHERE id = ?",
      statJson,
      id,
    );
  }

  const rawOrg = body.organization !== undefined ? JSON.stringify(body.organization) : rawDb.organization;
  const rawStat = body.statDefinition !== undefined
    ? (body.statDefinition == null ? null : JSON.stringify(body.statDefinition))
    : rawDb.statDefinition;

  return NextResponse.json({
    id: team.id,
    name: team.name,
    season: team.season,
    organization: parseOrganization(rawOrg ?? null),
    statDefinition: parseStatDefinition(rawStat ?? null),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.team.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

