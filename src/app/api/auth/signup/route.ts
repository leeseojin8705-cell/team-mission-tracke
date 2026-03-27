import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const SALT_ROUNDS = 10;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emailRaw = body.email;
    const passwordRaw = body.password;
    const orgNameRaw = body.organizationName;
    const seasonRaw = body.season;

    const email =
      typeof emailRaw === "string" && emailRaw.trim().length > 0
        ? emailRaw.trim().toLowerCase()
        : "";
    const password =
      typeof passwordRaw === "string" && passwordRaw.trim().length >= 6
        ? passwordRaw.trim()
        : "";
    const organizationName =
      typeof orgNameRaw === "string" && orgNameRaw.trim().length > 0
        ? orgNameRaw.trim()
        : "";
    const season =
      typeof seasonRaw === "string" && seasonRaw.trim().length > 0
        ? seasonRaw.trim()
        : "2026";

    if (!email || !password || !organizationName) {
      return NextResponse.json(
        { error: "이메일, 비밀번호, 조직 이름을 모두 입력하세요." },
        { status: 400 },
      );
    }

    const exists = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json(
        { error: "이미 가입된 이메일입니다." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "owner",
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        ownerId: user.id,
      },
    });

    const team = await prisma.team.create({
      data: {
        name: organizationName,
        season,
        organizationId: organization.id,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        userId: user.id,
        organizationId: organization.id,
        teamId: team.id,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[POST /api/auth/signup]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /denied access|Can't reach database server|P1001|P1017|ECONNREFUSED|ETIMEDOUT|password authentication failed/i.test(
        msg,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "데이터베이스에 연결할 수 없습니다. 서버(예: Vercel) 환경 변수 DATABASE_URL이 올바른지 확인해 주세요. 개발자 접근 권한이 아니라 DB 연결 설정 문제일 때가 많습니다.",
        },
        { status: 503 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: Unique constraint failed
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: "이미 가입된 이메일입니다.", code: e.code },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "회원가입 처리 중 DB 오류가 발생했습니다.", code: e.code, meta: e.meta ?? null },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

