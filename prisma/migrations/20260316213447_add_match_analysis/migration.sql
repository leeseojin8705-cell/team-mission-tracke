-- CreateTable
CREATE TABLE "MatchAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "half" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MatchAnalysis_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchAnalysis_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskProgress_taskId_playerId_key" ON "TaskProgress"("taskId", "playerId");
