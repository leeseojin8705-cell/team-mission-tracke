-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT,
    "teamId" TEXT,
    "opponent" TEXT,
    "matchDate" DATETIME,
    "matchName" TEXT,
    "result" TEXT,
    "events" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MatchAnalysis_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchAnalysis_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MatchAnalysis" ("events", "id", "opponent", "scheduleId", "teamId", "updatedAt") SELECT "events", "id", "opponent", "scheduleId", "teamId", "updatedAt" FROM "MatchAnalysis";
DROP TABLE "MatchAnalysis";
ALTER TABLE "new_MatchAnalysis" RENAME TO "MatchAnalysis";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
