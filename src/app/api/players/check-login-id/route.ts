import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAccessibleTeamIds } from "@/lib/coachAccess";
import { isAdminApiRequest } from "@/lib/adminApiRequest";

/**
 * GET ?loginId= &excludePlayerId= (선택, 수정 시 본인 제외)
 * 개인 번호(loginId) 사용 가능 여부 조회 — 저장 전 중복 검사용
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const loginId = url.searchParams.get("loginId")?.trim() ?? "";
    const excludePlayerId = url.searchParams.get("excludePlayerId")?.trim() ?? "";

    if (!loginId) {
      return NextResponse.json(
        { error: "loginId 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const session = await getSession();
    const adminOk = isAdminApiRequest(req);
    if (
      !adminOk &&
      (!session || (session.role !== "coach" && session.role !== "owner"))
    ) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
    }

    const other = await prisma.player.findFirst({
      where: {
        loginId,
        ...(excludePlayerId ? { id: { not: excludePlayerId } } : {}),
      },
      select: { id: true, name: true, teamId: true },
    });

    if (!other) {
      return NextResponse.json({
        available: true,
        loginId,
      });
    }

    let canShowName = adminOk;
    if (!canShowName && session && (session.role === "coach" || session.role === "owner")) {
      const ids = await getAccessibleTeamIds(session);
      canShowName = other.teamId != null && ids.includes(other.teamId);
    }

    return NextResponse.json({
      available: false,
      loginId,
      conflict: {
        playerId: other.id,
        playerName: canShowName ? other.name : null,
        message: canShowName
          ? `이미 「${other.name}」선수가 사용 중입니다.`
          : "이미 다른 선수가 사용 중인 개인 번호입니다. (다른 팀 소속일 수 있습니다)",
      },
    });
  } catch (e) {
    console.error("[GET /api/players/check-login-id]", e);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
