-- AlterTable
ALTER TABLE "Team" ADD COLUMN "statDefinition" TEXT;

-- CreateTable
CREATE TABLE "StaffEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "evaluatorStaffId" TEXT NOT NULL,
    "subjectStaffId" TEXT NOT NULL,
    "scores" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffEvaluation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
