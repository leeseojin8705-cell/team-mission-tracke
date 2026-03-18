import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!loginId || !password) {
      return NextResponse.json(
        { error: "아이디와 비밀번호를 입력하세요." },
        { status: 400 },
      );
    }

    const player = await prisma.player.findFirst({
      where: { loginId },
    });

    if (!player || !player.passwordHash) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const ok = await bcrypt.compare(password, player.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    await setSession({ role: "player", playerId: player.id });
    return NextResponse.json({
      ok: true,
      role: "player",
      playerId: player.id,
    });
  } catch (e) {
    console.error("[POST /api/auth/login]", e);
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
