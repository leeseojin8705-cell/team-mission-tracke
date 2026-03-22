import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

export async function GET() {
  try {
    const session = await getSession();
    let where: Prisma.TaskWhereInput | undefined;

    if (session && (session.role === "coach" || session.role === "owner")) {
      const ids = await getAccessibleTeamIds(session);
      // 접근 가능한 팀이 없으면 팀 미배정 과제만 (in: [] 는 Prisma/DB에서 오류 유발 가능)
      if (ids.length === 0) {
        where = { teamId: null };
      } else {
        where = {
          OR: [
            { teamId: { in: ids } },
            { teamId: null },
          ],
        };
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { title: "asc" },
    });
    return NextResponse.json(tasks);
  } catch (e) {
    console.error("[GET /api/tasks]", e);
    const message = e instanceof Error ? e.message : "과제 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.title || !body.category || !body.targetType || !body.targetId) {
      return NextResponse.json(
        { error: "title, category, targetType, targetId는 필수입니다." },
        { status: 400 },
      );
    }

    const created = await prisma.task.create({
      data: {
        title: body.title,
        category: body.category,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        teamId: body.targetType === "team" ? body.targetId : null,
        playerId: body.targetType === "player" ? body.targetId : null,
        details: body.details ? JSON.stringify(body.details) : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 서버 오류입니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

