import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId");
  const taskId = searchParams.get("taskId");

  if (taskId) {
    const items = await prisma.taskProgress.findMany({
      where: { taskId },
    });
    return NextResponse.json(items);
  }

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId 또는 taskId 중 하나는 필수입니다." },
      { status: 400 },
    );
  }

  const items = await prisma.taskProgress.findMany({
    where: { playerId },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!body.taskId || !body.playerId) {
    return NextResponse.json(
      { error: "taskId와 playerId는 필수입니다." },
      { status: 400 },
    );
  }

  const progress = await prisma.taskProgress.upsert({
    where: {
      taskId_playerId: {
        taskId: body.taskId,
        playerId: body.playerId,
      },
    },
    update: {
      completed: body.completed ?? false,
      note: body.note ?? "",
    },
    create: {
      taskId: body.taskId,
      playerId: body.playerId,
      completed: body.completed ?? false,
      note: body.note ?? "",
    },
  });

  return NextResponse.json(progress);
}

