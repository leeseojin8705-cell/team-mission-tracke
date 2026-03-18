import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const SALT_ROUNDS = 10;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "선수 ID가 필요합니다." }, { status: 400 });
  }
  try {
    const body = await req.json();
    const loginId = body.loginId != null ? String(body.loginId).trim() : undefined;
    const password = body.password != null ? String(body.password) : undefined;

    if (loginId === "") {
      return NextResponse.json(
        { error: "개인 번호(로그인 ID)는 비울 수 없습니다. 삭제하려면 별도 API를 사용하세요." },
        { status: 400 },
      );
    }

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) {
      return NextResponse.json({ error: "선수를 찾을 수 없습니다." }, { status: 404 });
    }

    const data: { loginId?: string | null; passwordHash?: string } = {};
    if (loginId !== undefined) {
      if (loginId.length > 0) {
        const existing = await prisma.player.findFirst({
          where: { loginId, id: { not: id } },
        });
        if (existing) {
          return NextResponse.json(
            { error: "이미 다른 선수가 사용 중인 개인 번호입니다." },
            { status: 400 },
          );
        }
      }
      data.loginId = loginId || null;
    }
    if (password !== undefined && password.length > 0) {
      data.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(player);
    }

    const updated = await prisma.player.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      loginId: updated.loginId ?? null,
      passwordSet: !!updated.passwordHash,
    });
  } catch (e) {
    console.error("[PATCH /api/players/[id]/credentials]", e);
    return NextResponse.json(
      { error: "저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
