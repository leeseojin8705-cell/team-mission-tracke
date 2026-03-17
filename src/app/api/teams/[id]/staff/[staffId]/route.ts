import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const { id: teamId, staffId } = await params;
  const body = await req.json();
  if (body.guidance === undefined) {
    return NextResponse.json({ error: "guidance가 필요합니다." }, { status: 400 });
  }
  const prismaAny = prisma as unknown as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> };
  await prismaAny.$executeRawUnsafe(
    "UPDATE TeamStaff SET guidance = ? WHERE id = ? AND teamId = ?",
    body.guidance ? 1 : 0,
    staffId,
    teamId,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; staffId: string }> },
) {
  const { id: teamId, staffId } = await params;
  await prisma.teamStaff.deleteMany({
    where: { id: staffId, teamId },
  });
  return NextResponse.json({ ok: true });
}
