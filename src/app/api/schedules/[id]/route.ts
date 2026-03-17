import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const schedule = await prisma.schedule.update({
    where: { id },
    data: {
      title: body.title,
      date: body.date ? new Date(body.date) : undefined,
      teamId: body.teamId,
    },
  });

  return NextResponse.json(schedule);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.schedule.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}

