import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AnnouncementCategory, AnnouncementType } from "@/generated/prisma/enums";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

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

async function canAnnounceForTeam(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  teamId: string,
) {
  if (session.role !== "coach" && session.role !== "owner") return false;
  const ids = await getAccessibleTeamIds(session);
  return ids.includes(teamId);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id } = await params;
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) return NextResponse.json(null, { status: 404 });

  if (session?.role === "player" && session.playerId) {
    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { teamId: true },
    });
    if (!player?.teamId || player.teamId !== a.teamId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  } else if (session?.role === "coach" || session?.role === "owner") {
    if (!(await canAnnounceForTeam(session, a.teamId))) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  return NextResponse.json(toJson(a));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!(await canAnnounceForTeam(session, existing.teamId))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await req.json();

    const category: AnnouncementCategory | undefined =
      body.category && CATEGORIES.includes(body.category)
        ? (body.category as AnnouncementCategory)
        : undefined;
    const type: AnnouncementType | undefined =
      body.type && TYPES.includes(body.type)
        ? (body.type as AnnouncementType)
        : undefined;

    const data: {
      category?: AnnouncementCategory;
      type?: AnnouncementType;
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
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!(await canAnnounceForTeam(session, existing.teamId))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
