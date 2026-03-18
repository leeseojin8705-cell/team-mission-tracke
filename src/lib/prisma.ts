// src/lib/prisma.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Use same DB file as Prisma CLI (migrate): file:./dev.db => process.cwd()/dev.db
const rawUrl = process.env.DATABASE_URL ?? "file:./dev.db";
let absolutePath: string;
if (rawUrl.startsWith("file:")) {
  const filePath = rawUrl.slice(5).trim();
  absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
} else {
  absolutePath = path.resolve(process.cwd(), "dev.db");
}
// Normalize for file URL (forward slashes; adapter expects file: path)
const dbUrl = `file:${absolutePath.replace(/\\/g, "/")}`;

const adapter = new PrismaBetterSqlite3({ url: dbUrl });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}