import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "coach" && session.role !== "owner")) {
      return NextResponse.json(
        { error: "코치 로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const orgs = await prisma.organization.findMany({
      where: { ownerId: session.userId },
      include: {
        teams: true,
      },
    });

    return NextResponse.json(
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        teams: o.teams.map((t) => ({ id: t.id, name: t.name, season: t.season })),
      })),
    );
  } catch (e) {
    console.error("[GET /api/coach/organizations/me]", e);
    return NextResponse.json(
      { error: "조직 정보를 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

