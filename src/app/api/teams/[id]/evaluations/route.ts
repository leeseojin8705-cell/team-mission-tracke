import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseScores(raw: string): Record<string, number[]> {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) out[k] = v.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
    }
    return out;
  } catch {
    return {};
  }
}

/** GET: 팀 내 모든 스태프 평가 목록 (팀 스탯 집계용) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const list = await prisma.staffEvaluation.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  const body = list.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    evaluatorStaffId: row.evaluatorStaffId,
    subjectStaffId: row.subjectStaffId,
    scores: parseScores(row.scores),
    createdAt: row.createdAt?.toISOString?.(),
  }));
  return NextResponse.json(body);
}

/** POST: 스태프 평가 저장 (같은 evaluator + subject 있으면 덮어쓰기) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const body = await req.json();
  const { evaluatorStaffId, subjectStaffId, scores } = body as {
    evaluatorStaffId?: string;
    subjectStaffId?: string;
    scores?: Record<string, number[]>;
  };
  if (!evaluatorStaffId || !subjectStaffId || !scores || typeof scores !== "object") {
    return NextResponse.json(
      { error: "evaluatorStaffId, subjectStaffId, scores 필요" },
      { status: 400 },
    );
  }
  const scoresJson = JSON.stringify(scores);

  const existing = await prisma.staffEvaluation.findFirst({
    where: { teamId, evaluatorStaffId, subjectStaffId },
  });

  if (existing) {
    await prisma.staffEvaluation.update({
      where: { id: existing.id },
      data: { scores: scoresJson },
    });
    return NextResponse.json({
      id: existing.id,
      teamId,
      evaluatorStaffId,
      subjectStaffId,
      scores: parseScores(scoresJson),
    });
  }

  const created = await prisma.staffEvaluation.create({
    data: {
      teamId,
      evaluatorStaffId,
      subjectStaffId,
      scores: scoresJson,
    },
  });
  return NextResponse.json({
    id: created.id,
    teamId: created.teamId,
    evaluatorStaffId: created.evaluatorStaffId,
    subjectStaffId: created.subjectStaffId,
    scores: parseScores(created.scores),
    createdAt: created.createdAt?.toISOString?.(),
  });
}
