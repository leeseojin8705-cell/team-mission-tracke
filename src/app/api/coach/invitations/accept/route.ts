import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";

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
    const tokenRaw = body.token;
    const token =
      typeof tokenRaw === "string" && tokenRaw.trim().length > 0
        ? tokenRaw.trim()
        : "";
    if (!token) {
      return NextResponse.json({ error: "초대 토큰이 없습니다." }, { status: 400 });
    }

    const invitation = await prisma.coachInvitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      return NextResponse.json(
        { error: "유효하지 않은 초대입니다." },
        { status: 404 },
      );
    }
    if (invitation.usedAt) {
      return NextResponse.json(
        { error: "이미 사용된 초대입니다." },
        { status: 400 },
      );
    }
    if (!invitation.teamId) {
      return NextResponse.json(
        { error: "이 초대에는 팀 정보가 없습니다." },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.teamStaff.findFirst({
        where: {
          teamId: invitation.teamId!,
          userId: session.userId,
        },
      });

      if (!existing) {
        await tx.teamStaff.create({
          data: {
            teamId: invitation.teamId!,
            role: invitation.roleLabel || "coach",
            name: invitation.email ?? "코치",
            email: invitation.email ?? null,
            userId: session.userId,
          },
        });
      }

      await tx.coachInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/coach/invitations/accept]", e);
    return NextResponse.json(
      { error: "초대 수락 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

