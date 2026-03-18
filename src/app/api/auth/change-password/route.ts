import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const SALT_ROUNDS = 10;

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "player") {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const newLoginIdRaw = body.newLoginId;
    const newLoginId =
      typeof newLoginIdRaw === "string" && newLoginIdRaw.trim().length > 0
        ? newLoginIdRaw.trim()
        : null;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "현재 비밀번호와 새 비밀번호를 모두 입력하세요." },
        { status: 400 },
      );
    }

    const player = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { passwordHash: true, loginId: true, id: true },
    });
    if (!player || !player.passwordHash) {
      return NextResponse.json(
        { error: "비밀번호가 설정되지 않았습니다. 코치에게 초기화를 요청하세요." },
        { status: 400 },
      );
    }

    const ok = await bcrypt.compare(currentPassword, player.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
    }

    // 아이디 변경이 요청된 경우, 중복 체크
    if (newLoginId && newLoginId !== player.loginId) {
      const exists = await prisma.player.findFirst({
        where: { loginId: newLoginId, id: { not: player.id } },
        select: { id: true },
      });
      if (exists) {
        return NextResponse.json(
          { error: "이미 다른 선수가 사용 중인 아이디입니다." },
          { status: 400 },
        );
      }
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.player.update({
      where: { id: session.playerId },
      data: {
        passwordHash: newHash,
        ...(newLoginId !== null ? { loginId: newLoginId } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/auth/change-password]", e);
    return NextResponse.json(
      { error: "비밀번호 변경 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

