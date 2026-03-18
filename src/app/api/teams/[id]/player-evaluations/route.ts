import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EvalPhase } from "@/lib/prismaEnums";

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

/** GET: 팀 내 선수 평가 목록 (팀/과제 스탯 집계용) */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");

  const list = await prisma.playerEvaluation.findMany({
    where: {
      teamId,
      ...(taskId ? { taskId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const body = list.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    evaluatorStaffId: row.evaluatorStaffId,
    subjectPlayerId: row.subjectPlayerId,
    phase: row.phase,
    scores: parseScores(row.scores),
    createdAt: row.createdAt?.toISOString?.(),
    taskId: row.taskId ?? null,
  }));
  return NextResponse.json(body);
}

/** POST: 선수 평가 저장 (같은 evaluator + subject 있으면 덮어쓰기) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: teamId } = await params;
    const body = await req.json();
    const { evaluatorStaffId, subjectPlayerId, scores, phase: phaseRaw, taskId } = body as {
      evaluatorStaffId?: string;
      subjectPlayerId?: string;
      scores?: Record<string, number[]>;
      phase?: string;
      taskId?: string | null;
    };
    if (!evaluatorStaffId || !subjectPlayerId || scores === undefined || scores === null || typeof scores !== "object") {
      return NextResponse.json(
        { error: "evaluatorStaffId, subjectPlayerId, scores 필요" },
        { status: 400 },
      );
    }
    const scoresJson = JSON.stringify(scores);
    const phase: (typeof EvalPhase)[keyof typeof EvalPhase] =
      phaseRaw === "PLAYER_PRE"
        ? EvalPhase.PLAYER_PRE
        : phaseRaw === "PLAYER_POST"
          ? EvalPhase.PLAYER_POST
          : EvalPhase.COACH_POST;

    const existing = await prisma.playerEvaluation.findFirst({
      where: {
        teamId,
        evaluatorStaffId,
        subjectPlayerId,
        phase,
        taskId: taskId ?? null,
      },
    });

    if (existing) {
      await prisma.playerEvaluation.update({
        where: { id: existing.id },
        data: { scores: scoresJson, phase, taskId: taskId ?? null },
      });
      return NextResponse.json({
        id: existing.id,
        teamId,
        evaluatorStaffId,
        subjectPlayerId,
        phase,
        scores: parseScores(scoresJson),
        taskId: taskId ?? null,
      });
    }

    const created = await prisma.playerEvaluation.create({
      data: {
        teamId,
        evaluatorStaffId,
        subjectPlayerId,
        phase,
        scores: scoresJson,
        taskId: taskId ?? null,
      },
    });
    return NextResponse.json({
      id: created.id,
      teamId: created.teamId,
      evaluatorStaffId: created.evaluatorStaffId,
      subjectPlayerId: created.subjectPlayerId,
      phase: created.phase,
      scores: parseScores(created.scores),
      createdAt: created.createdAt?.toISOString?.(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
