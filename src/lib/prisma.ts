// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sslCaRaw = process.env.SUPABASE_SSL_CA;
const sslCa =
  sslCaRaw && sslCaRaw.includes("\\n") ? sslCaRaw.replace(/\\n/g, "\n") : sslCaRaw;

const sslConfig =
  process.env.NODE_ENV === "production"
    ? sslCa
      ? { ca: sslCa, rejectUnauthorized: true }
      : { rejectUnauthorized: true }
    : undefined;

const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
