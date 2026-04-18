import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canAccessMatchAnalysis } from "@/lib/matchAnalysisAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id } = await params;
  const a = await prisma.matchAnalysis.findUnique({
    where: { id },
    include: {
      schedule: { select: { id: true, title: true, date: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (!a) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  const ok = await canAccessMatchAnalysis(
    session,
    {
      teamId: a.teamId,
      scheduleId: a.scheduleId,
    },
    req,
  );
  if (!ok) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  return NextResponse.json({
    id: a.id,
    scheduleId: a.scheduleId ?? null,
    teamId: a.teamId ?? null,
    opponent: a.opponent ?? null,
    matchDate: a.matchDate?.toISOString() ?? null,
    matchName: a.matchName ?? null,
    result: a.result ?? null,
    events: JSON.parse(a.events),
    playerEvents: a.playerEvents ? JSON.parse(a.playerEvents) : null,
    updatedAt: a.updatedAt.toISOString(),
    schedule: a.schedule,
    team: a.team,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const adminOk = isAdminApiRequest(req);
  if (
    (!session || (session.role !== "coach" && session.role !== "owner")) &&
    !adminOk
  ) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.matchAnalysis.findUnique({
    where: { id },
    select: { teamId: true, scheduleId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }
  const ok = await canAccessMatchAnalysis(
    session,
    {
      teamId: existing.teamId,
      scheduleId: existing.scheduleId,
    },
    req,
  );
  if (!ok) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json();

  const updateData: { opponent?: string; events?: string; playerEvents?: string } = {};
  if (body.opponent != null) updateData.opponent = String(body.opponent).trim();
  if (body.events != null) updateData.events = JSON.stringify(body.events);
  if (body.playerEvents != null) updateData.playerEvents = JSON.stringify(body.playerEvents);

  const updated = await prisma.matchAnalysis.update({
    where: { id },
    data: updateData,
    include: {
      schedule: { select: { id: true, title: true, date: true } },
      team: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    scheduleId: updated.scheduleId,
    teamId: updated.teamId,
    opponent: updated.opponent,
    events: JSON.parse(updated.events),
    playerEvents: updated.playerEvents ? JSON.parse(updated.playerEvents) : null,
    updatedAt: updated.updatedAt.toISOString(),
    schedule: updated.schedule,
    team: updated.team,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const adminOk = isAdminApiRequest(req);
  if (
    (!session || (session.role !== "coach" && session.role !== "owner")) &&
    !adminOk
  ) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.matchAnalysis.findUnique({
    where: { id },
    select: { teamId: true, scheduleId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }
  const ok = await canAccessMatchAnalysis(
    session,
    {
      teamId: existing.teamId,
      scheduleId: existing.scheduleId,
    },
    req,
  );
  if (!ok) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.matchAnalysis.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
