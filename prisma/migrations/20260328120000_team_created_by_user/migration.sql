-- 팀 생성자(코치/오너 User.id) — 팀 관리 화면에서 본인이 만든 팀만 목록에 표시
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_created_by_user_id_fkey";

ALTER TABLE "Team"
ADD CONSTRAINT "Team_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
