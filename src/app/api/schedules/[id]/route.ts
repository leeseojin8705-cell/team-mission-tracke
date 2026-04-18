import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

async function canMutateSchedule(
  scheduleId: string,
  req: Request,
): Promise<"ok" | "unauth" | "not_found" | "forbidden"> {
  if (isAdminApiRequest(req)) {
    const s = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { id: true },
    });
    return s ? "ok" : "not_found";
  }
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return "unauth";
  }
  const row = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { teamId: true },
  });
  if (!row) return "not_found";
  const ids = await getAccessibleTeamIds(session);
  return ids.includes(row.teamId) ? "ok" : "forbidden";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await canMutateSchedule(id, req);
  if (access === "unauth") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  if (access === "not_found") {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }
  if (access === "forbidden") {
    return NextResponse.json({ error: "이 일정을 수정할 권한이 없습니다." }, { status: 403 });
  }

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
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await canMutateSchedule(id, req);
  if (access === "unauth") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  if (access === "not_found") {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }
  if (access === "forbidden") {
    return NextResponse.json({ error: "이 일정을 삭제할 권한이 없습니다." }, { status: 403 });
  }

  await prisma.schedule.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
