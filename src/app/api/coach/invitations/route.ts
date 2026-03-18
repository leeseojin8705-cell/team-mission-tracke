import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "coach" && session.role !== "owner")) {
    return NextResponse.json({ error: "코치 로그인이 필요합니다." }, { status: 401 });
  }

  const list = await prisma.coachInvitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(
    list.map((inv) => ({
      id: inv.id,
      email: inv.email,
      roleLabel: inv.roleLabel,
      teamId: inv.teamId,
      createdAt: inv.createdAt,
      usedAt: inv.usedAt,
      token: inv.token,
    })),
  );
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "coach" && session.role !== "owner")) {
      return NextResponse.json(
        { error: "코치 로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const emailRaw = body.email;
    const roleLabelRaw = body.roleLabel;
    const teamIdRaw = body.teamId;

    const email =
      typeof emailRaw === "string" && emailRaw.trim().length > 0
        ? emailRaw.trim()
        : null;
    const roleLabel =
      typeof roleLabelRaw === "string" && roleLabelRaw.trim().length > 0
        ? roleLabelRaw.trim()
        : "coach";
    const teamId =
      typeof teamIdRaw === "string" && teamIdRaw.trim().length > 0
        ? teamIdRaw.trim()
        : null;

    const token = crypto.randomBytes(24).toString("base64url");

    const inv = await prisma.coachInvitation.create({
      data: {
        token,
        email: email ?? undefined,
        roleLabel,
        teamId: teamId ?? undefined,
      },
    });

    return NextResponse.json(
      {
        id: inv.id,
        token: inv.token,
        email: inv.email,
        roleLabel: inv.roleLabel,
        teamId: inv.teamId,
        createdAt: inv.createdAt,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[POST /api/coach/invitations]", e);
    return NextResponse.json(
      { error: "초대 링크 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

