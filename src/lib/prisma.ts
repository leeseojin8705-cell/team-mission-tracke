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

function stripSslQueryParams(raw: string): string {
  try {
    const u = new URL(raw);
    // We'll control TLS via Pool.ssl config to avoid libpq-style params overriding behavior.
    u.searchParams.delete("sslmode");
    u.searchParams.delete("sslrootcert");
    u.searchParams.delete("sslcert");
    u.searchParams.delete("sslkey");
    u.searchParams.delete("sslpassword");
    u.searchParams.delete("sslaccept");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch {
    return raw;
  }
}

const sanitizedConnectionString = stripSslQueryParams(connectionString);

/** 로컬 Postgres는 SSL 없이, Supabase 등 원격은 TLS 필요 */
const isLikelyLocalPostgres =
  /localhost|127\.0\.0\.1/.test(sanitizedConnectionString) ||
  /localhost|127\.0\.0\.1/.test(connectionString);

/** Supabase 직접/풀러 호스트 — Vercel 등에서 기본 CA로 체인 검증 시 "self-signed certificate in certificate chain" 이 나는 경우가 있어 완화 */
const isSupabasePostgres =
  /supabase\.co|pooler\.supabase\.com/i.test(sanitizedConnectionString) ||
  /supabase\.co|pooler\.supabase\.com/i.test(connectionString);

const sslCaRaw = process.env.SUPABASE_SSL_CA;
const sslCa = (() => {
  if (!sslCaRaw) return undefined;
  // Handle common env-var encodings:
  // - multiline PEM pasted as-is (contains real newlines)
  // - single-line PEM with literal "\n"
  // - accidental surrounding quotes
  const unquoted = sslCaRaw.replace(/^"+|"+$/g, "").trim();
  const withNewlines = unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
  const normalized = withNewlines.replace(/\r\n/g, "\n").trim();

  // Extract the first PEM block even if extra characters were pasted.
  const begin = "-----BEGIN CERTIFICATE-----";
  const end = "-----END CERTIFICATE-----";
  const bi = normalized.indexOf(begin);
  const ei = normalized.indexOf(end);
  if (bi !== -1 && ei !== -1 && ei > bi) {
    return normalized.slice(bi, ei + end.length).trim();
  }

  return normalized;
})();

/**
 * Supabase/Neon 등은 TLS 필수. dev에서 sslmode를 URL에서 뺐으므로 Pool에 명시해야 함.
 * - Supabase + CA 없음: 연결은 TLS 유지, 체인 검증만 완화 (풀러·서버리스에서 흔함)
 * - CA 있으면: 검증
 * - 기타 원격 production: 호스트 검증
 * - dev + 원격: CA 있으면 사용, 없으면 rejectUnauthorized: false
 * - dev + localhost: SSL 끔
 */
const sslConfig = isLikelyLocalPostgres
  ? undefined
  : sslCa
    ? { ca: sslCa, rejectUnauthorized: true }
    : isSupabasePostgres
      ? { rejectUnauthorized: false }
      : process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: sanitizedConnectionString,
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
