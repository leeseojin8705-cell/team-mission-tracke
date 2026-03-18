import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CATEGORIES = ["DAILY", "SCHEDULE"] as const;
const TYPES = ["GAME", "PRACTICE", "REST", "EDUCATION", "OFFICIAL", "OTHER"] as const;

function toJson(a: {
  id: string;
  teamId: string;
  category: string;
  type: string;
  title: string;
  content: string | null;
  startAt: Date;
  endAt: Date | null;
  target: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    teamId: a.teamId,
    category: a.category,
    type: a.type,
    title: a.title,
    content: a.content,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt?.toISOString() ?? null,
    target: a.target,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(toJson(a));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();

    const category =
      body.category && CATEGORIES.includes(body.category)
        ? body.category
        : undefined;
    const type =
      body.type && TYPES.includes(body.type) ? body.type : undefined;

    const data: {
      category?: string;
      type?: string;
      title?: string;
      content?: string | null;
      startAt?: Date;
      endAt?: Date | null;
      target?: string | null;
    } = {};
    if (category) data.category = category;
    if (type) data.type = type;
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.content !== undefined)
      data.content = body.content != null ? String(body.content).trim() : null;
    if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
    if (body.endAt !== undefined)
      data.endAt = body.endAt ? new Date(body.endAt) : null;
    if (body.target !== undefined)
      data.target =
        body.target != null ? JSON.stringify(body.target) : null;

    const updated = await prisma.announcement.update({
      where: { id },
      data,
    });
    return NextResponse.json(toJson(updated));
  } catch (e) {
    console.error("PATCH /api/announcements/[id] error", e);
    const message =
      e instanceof Error ? e.message : "공지 수정 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
