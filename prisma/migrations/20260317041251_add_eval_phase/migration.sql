-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayerEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "evaluatorStaffId" TEXT NOT NULL,
    "subjectPlayerId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'COACH_POST',
    "scores" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerEvaluation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayerEvaluation" ("createdAt", "evaluatorStaffId", "id", "scores", "subjectPlayerId", "teamId") SELECT "createdAt", "evaluatorStaffId", "id", "scores", "subjectPlayerId", "teamId" FROM "PlayerEvaluation";
DROP TABLE "PlayerEvaluation";
ALTER TABLE "new_PlayerEvaluation" RENAME TO "PlayerEvaluation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
