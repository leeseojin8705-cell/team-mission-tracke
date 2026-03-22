import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: teamId } = await params;
    const list = await prisma.teamStaff.findMany({
      where: { teamId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(
      list.map((s) => ({
        id: s.id,
        teamId: s.teamId,
        role: s.role,
        name: s.name,
        phone: s.phone ?? null,
        email: s.email ?? null,
        guidance: s.guidance === true,
      })),
    );
  } catch (e) {
    console.error("[GET /api/teams/[id]/staff]", e);
    const message = e instanceof Error ? e.message : "스태프 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const created = await prisma.teamStaff.create({
      data: {
        teamId,
        role,
        name,
        phone: phoneVal,
        email: emailVal,
        guidance: false,
      },
    });
    return NextResponse.json(
      {
        id: created.id,
        teamId: created.teamId,
        role: created.role,
        name: created.name,
        phone: created.phone ?? null,
        email: created.email ?? null,
        guidance: created.guidance === true,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "등록에 실패했습니다.";
    console.error("[POST /api/teams/[id]/staff]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
