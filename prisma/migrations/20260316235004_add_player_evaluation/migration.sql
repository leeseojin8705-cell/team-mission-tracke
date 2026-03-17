-- CreateTable
CREATE TABLE "PlayerEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "evaluatorStaffId" TEXT NOT NULL,
    "subjectPlayerId" TEXT NOT NULL,
    "scores" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerEvaluation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
