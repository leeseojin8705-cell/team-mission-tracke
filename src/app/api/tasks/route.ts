import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";

export async function GET() {
  const session = await getSession();
  let where: { teamId?: { in: string[] | null }; OR?: any[] } | undefined;

  if (session && (session.role === "coach" || session.role === "owner")) {
    const ids = await getAccessibleTeamIds(session);
    // 팀 과제는 접근 가능한 팀만, 개인 과제는 모두(선수/자신) 허용
    where = {
      OR: [
        { teamId: { in: ids } },
        { teamId: null },
      ],
    };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { title: "asc" },
  });
  return NextResponse.json(tasks);
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
      },
    });

    // Prisma Client 스키마 불일치 문제를 피하기 위해 raw SQL로 teamId / playerId / details 업데이트
    await prisma.$executeRawUnsafe(
      `UPDATE Task
       SET teamId = ?, playerId = ?, details = ?
       WHERE id = ?`,
      body.targetType === "team" ? body.targetId : null,
      body.targetType === "player" ? body.targetId : null,
      body.details ? JSON.stringify(body.details) : null,
      created.id,
    );

    const updated = await prisma.task.findUnique({ where: { id: created.id } });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 서버 오류입니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

