import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const prismaAny = prisma as unknown as { $queryRawUnsafe: (query: string, ...args: unknown[]) => Promise<{ id: string; teamId: string; role: string; name: string; phone: string | null; email: string | null; guidance: number | null }[]> };
  const list = await prismaAny.$queryRawUnsafe(
    "SELECT id, teamId, role, name, phone, email, guidance FROM TeamStaff WHERE teamId = ? ORDER BY role, name",
    teamId,
  );
  return NextResponse.json(
    list.map((s) => ({
      id: s.id,
      teamId: s.teamId,
      role: s.role,
      name: s.name,
      phone: s.phone ?? null,
      email: s.email ?? null,
      guidance: s.guidance === 1,
    })),
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const body = await req.json();
  const role = String(body.role ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!role || !name) {
    return NextResponse.json(
      { error: "직책(role)과 이름(name)이 필요합니다." },
      { status: 400 },
    );
  }
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return NextResponse.json({ error: "팀을 찾을 수 없습니다." }, { status: 404 });
  }
  const phoneVal = body.phone != null ? String(body.phone).trim() || null : null;
  const emailVal = body.email != null ? String(body.email).trim() || null : null;

  try {
    const prismaAny = prisma as unknown as {
      $queryRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown[]>;
    };
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
    await prismaAny.$queryRawUnsafe(
      "INSERT INTO TeamStaff (id, teamId, role, name, phone, email, guidance) VALUES (?, ?, ?, ?, ?, ?, 0)",
      id,
      teamId,
      role,
      name,
      phoneVal ?? null,
      emailVal ?? null,
    );
    return NextResponse.json(
      {
        id,
        teamId,
        role,
        name,
        phone: phoneVal ?? null,
        email: emailVal ?? null,
        guidance: false,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "등록에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
