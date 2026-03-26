import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Body = { visitorKey?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const visitorKey =
      typeof body.visitorKey === "string" ? body.visitorKey.trim() : "";

    if (!visitorKey) {
      return NextResponse.json({ error: "visitorKey is required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS entry_visit_daily (
        day date NOT NULL,
        visitor_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (day, visitor_key)
      )
    `);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO entry_visit_daily (day, visitor_key)
      VALUES (CURRENT_DATE, $1)
      ON CONFLICT (day, visitor_key) DO NOTHING
      `,
      visitorKey,
    );

    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*)::int AS count
      FROM entry_visit_daily
      WHERE day = CURRENT_DATE
      `,
    )) as { count: number }[];

    return NextResponse.json({ count: rows[0]?.count ?? 0 });
  } catch (e) {
    console.error("[POST /api/entry/today]", e);
    return NextResponse.json({ error: "오늘 입장 인원 집계 실패" }, { status: 500 });
  }
}

