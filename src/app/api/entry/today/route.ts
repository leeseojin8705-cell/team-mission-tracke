import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Body = { visitorKey?: string };

function utcTodayDate(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const visitorKey =
      typeof body.visitorKey === "string" ? body.visitorKey.trim() : "";

    if (!visitorKey) {
      return NextResponse.json({ error: "visitorKey is required" }, { status: 400 });
    }

    const day = utcTodayDate();

    await prisma.entryVisitDaily.createMany({
      data: [{ day, visitorKey }],
      skipDuplicates: true,
    });

    const count = await prisma.entryVisitDaily.count({
      where: { day },
    });

    return NextResponse.json({ count });
  } catch (e) {
    console.error("[POST /api/entry/today]", e);
    // 집계는 부가 기능 — DB 오류 시에도 홈·콘솔이 깨지지 않게
    return NextResponse.json({ count: 0 });
  }
}
