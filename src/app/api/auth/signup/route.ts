import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json(
      { error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

