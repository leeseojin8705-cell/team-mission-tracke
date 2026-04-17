import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { applyPlayerTaskVisibility } from "@/lib/playerTaskVisibility";
import { playerCanAccessTeamScopedTask } from "@/lib/taskAssignees";
import { isAdminApiRequest } from "@/lib/adminApiRequest";
import type { Task } from "@/lib/types";

async function teamExists(teamId: string): Promise<boolean> {
  const t = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });
  return !!t;
}
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qpTeamId = searchParams.get("teamId");
    const listAll = searchParams.get("listAll") === "1";

    if (listAll && isAdminApiRequest(req)) {
      const tasks = await prisma.task.findMany({
        orderBy: { title: "asc" },
      });
      return NextResponse.json(tasks);
    }

    const session = await getSession();
    let where: Prisma.TaskWhereInput | undefined;

    /** 선수 본인·소속 팀 과제 */
    if (session?.role === "player" && session.playerId) {
      const player = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      if (!player?.teamId) {
        where = { playerId: session.playerId };
      } else {
        where = {
          OR: [
            { playerId: session.playerId },
            { teamId: player.teamId, playerId: null },
          ],
        };
      }
    } else if (session && (session.role === "coach" || session.role === "owner")) {
      const ids = await getAccessibleTeamIds(session);
      if (qpTeamId) {
        if (!ids.includes(qpTeamId)) {
          return NextResponse.json([]);
        }
        const teamPlayers = await prisma.player.findMany({
          where: { teamId: qpTeamId },
          select: { id: true },
        });
        const playerIds = teamPlayers.map((p) => p.id);
        where =
          playerIds.length > 0
            ? {
                OR: [{ teamId: qpTeamId }, { playerId: { in: playerIds } }],
              }
            : { teamId: qpTeamId };
      } else if (ids.length === 0) {
        where = { teamId: null };
      } else {
        where = {
          OR: [{ teamId: { in: ids } }, { teamId: null }],
        };
      }
    } else {
      return NextResponse.json([]);
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { title: "asc" },
    });

    const isPlayerView = session?.role === "player" && session.playerId;
    if (isPlayerView) {
      const now = new Date();
      const pid = session.playerId;
      const playerRow = await prisma.player.findUnique({
        where: { id: pid },
        select: { teamId: true },
      });
      const scoped = tasks.filter((t) =>
        playerCanAccessTeamScopedTask(pid, playerRow?.teamId, {
          teamId: t.teamId,
          playerId: t.playerId,
          details: t.details,
        }),
      );
      return NextResponse.json(
        scoped.map((t) => applyPlayerTaskVisibility(t as unknown as Task, now)),
      );
    }

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

    if (!body.title || !body.category || !body.targetType) {
      return NextResponse.json(
        { error: "title, category, targetType은 필수입니다." },
        { status: 400 },
      );
    }

    const session = await getSession();
    const adminOk = isAdminApiRequest(req);

    if (!session && !adminOk) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const detailsStr = body.details ? JSON.stringify(body.details) : null;

    // 선수 본인 과제 등록 (단일)
    if (session?.role === "player") {
      if (
        body.targetType !== "player" ||
        typeof body.targetId !== "string" ||
        body.targetId !== session.playerId
      ) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      const me = await prisma.player.findUnique({
        where: { id: session.playerId },
        select: { teamId: true },
      });
      const created = await prisma.task.create({
        data: {
          title: body.title,
          category: body.category,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          teamId: me?.teamId ?? null,
          playerId: session.playerId,
          details: detailsStr,
        },
      });
      return NextResponse.json({ created: [created] }, { status: 201 });
    }

    if (
      session &&
      session.role !== "coach" &&
      session.role !== "owner"
    ) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const accessibleIds =
      session && (session.role === "coach" || session.role === "owner")
        ? await getAccessibleTeamIds(session)
        : [];

    if (body.targetType === "team") {
      if (typeof body.targetId !== "string" || !body.targetId) {
        return NextResponse.json(
          { error: "팀 대상 과제에는 targetId가 필요합니다." },
          { status: 400 },
        );
      }
      const allowed = adminOk
        ? await teamExists(body.targetId)
        : accessibleIds.includes(body.targetId);
      if (!allowed) {
        return NextResponse.json(
          {
            error: adminOk
              ? "팀을 찾을 수 없습니다."
              : "해당 팀에 과제를 등록할 수 없습니다.",
          },
          { status: adminOk ? 400 : 403 },
        );
      }
      const created = await prisma.task.create({
        data: {
          title: body.title,
          category: body.category,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          teamId: body.targetId,
          playerId: null,
          details: detailsStr,
        },
      });
      return NextResponse.json({ created: [created] }, { status: 201 });
    }

    if (body.targetType !== "player") {
      return NextResponse.json(
        { error: "targetType은 team 또는 player여야 합니다." },
        { status: 400 },
      );
    }

    const targetIds: string[] = Array.isArray(body.targetIds)
      ? body.targetIds.filter((x: unknown) => typeof x === "string" && x.length > 0)
      : typeof body.targetId === "string" && body.targetId
        ? [body.targetId]
        : [];

    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: "대상 선수를 한 명 이상 선택해 주세요." },
        { status: 400 },
      );
    }

    const uniq = [...new Set(targetIds)];
    const players = await prisma.player.findMany({
      where: { id: { in: uniq } },
      select: { id: true, teamId: true },
    });

    if (players.length !== uniq.length) {
      return NextResponse.json(
        { error: "일부 선수를 찾을 수 없습니다." },
        { status: 400 },
      );
    }

    const teamIds = new Set(
      players.map((p) => p.teamId).filter((t): t is string => Boolean(t)),
    );
    if (teamIds.size !== 1) {
      return NextResponse.json(
        { error: "같은 팀 선수만 한 번에 지정할 수 있습니다." },
        { status: 400 },
      );
    }

    const teamId = [...teamIds][0]!;
    const playerTeamAllowed = adminOk
      ? await teamExists(teamId)
      : accessibleIds.includes(teamId);
    if (!playerTeamAllowed) {
      return NextResponse.json(
        {
          error: adminOk
            ? "팀을 찾을 수 없습니다."
            : "해당 팀 선수에게 과제를 등록할 수 없습니다.",
        },
        { status: adminOk ? 400 : 403 },
      );
    }

    /** 복수 선수: 지도자 목록에는 한 줄만 — 팀 스코프 1건 + details.assigneePlayerIds */
    if (uniq.length > 1) {
      let detailsObj: Record<string, unknown> = {};
      if (body.details && typeof body.details === "object") {
        detailsObj = { ...(body.details as Record<string, unknown>) };
      } else if (detailsStr) {
        try {
          detailsObj = JSON.parse(detailsStr) as Record<string, unknown>;
        } catch {
          detailsObj = {};
        }
      }
      detailsObj.assigneePlayerIds = uniq;
      const mergedDetails = JSON.stringify(detailsObj);
      const created = await prisma.task.create({
        data: {
          title: body.title,
          category: body.category,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          teamId,
          playerId: null,
          details: mergedDetails,
        },
      });
      return NextResponse.json({ created: [created] }, { status: 201 });
    }

    const playerId = uniq[0]!;
    const created = await prisma.task.create({
      data: {
        title: body.title,
        category: body.category,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        teamId,
        playerId,
        details: detailsStr,
      },
    });

    return NextResponse.json({ created: [created] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error", error);
    const message =
      error instanceof Error ? error.message : "알 수 없는 서버 오류입니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
