-- CreateTable (기존 런타임 CREATE TABLE 대체 — 풀러/서버리스에서 DDL 금지 환경 대응)
CREATE TABLE IF NOT EXISTS "entry_visit_daily" (
    "day" DATE NOT NULL,
    "visitor_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_visit_daily_pkey" PRIMARY KEY ("day","visitor_key")
);
