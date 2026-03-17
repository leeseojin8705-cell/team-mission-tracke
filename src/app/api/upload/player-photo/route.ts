import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "players");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, buffer);

    const url = `/uploads/players/${fileName}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("player photo upload error", error);
    return NextResponse.json({ error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}

