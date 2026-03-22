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
  const result = await prisma.teamStaff.updateMany({
    where: { id: staffId, teamId },
    data: { guidance: Boolean(body.guidance) },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "스태프를 찾을 수 없습니다." }, { status: 404 });
  }
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
