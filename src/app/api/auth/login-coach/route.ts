import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emailRaw = body.email;
    const passwordRaw = body.password;

    const email =
      typeof emailRaw === "string" && emailRaw.trim().length > 0
        ? emailRaw.trim().toLowerCase()
        : "";
    const password =
      typeof passwordRaw === "string" && passwordRaw.trim().length > 0
        ? passwordRaw.trim()
        : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 모두 입력하세요." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, role: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    // 코치/오너 세션 설정 (role: "coach" | "owner")
    await setSession({ role: user.role === "owner" ? "owner" : "coach", userId: user.id });
    return NextResponse.json(
      {
        ok: true,
        userId: user.id,
        role: user.role,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("[POST /api/auth/login-coach]", e);
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

