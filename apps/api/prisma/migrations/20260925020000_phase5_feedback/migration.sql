-- CreateEnum
CREATE TYPE "public"."PerceivedState" AS ENUM ('VERY_GOOD', 'GOOD', 'NORMAL', 'DIFFICULT', 'VERY_DIFFICULT');

-- CreateEnum
CREATE TYPE "public"."RecoveryState" AS ENUM ('VERY_RECOVERED', 'RECOVERED', 'NORMAL', 'TIRED', 'VERY_TIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."BodyRegion" ADD VALUE 'LEFT_QUADRICEPS';
ALTER TYPE "public"."BodyRegion" ADD VALUE 'RIGHT_QUADRICEPS';
ALTER TYPE "public"."BodyRegion" ADD VALUE 'LEFT_HAMSTRING';
ALTER TYPE "public"."BodyRegion" ADD VALUE 'RIGHT_HAMSTRING';
ALTER TYPE "public"."BodyRegion" ADD VALUE 'LEFT_CALF';
ALTER TYPE "public"."BodyRegion" ADD VALUE 'RIGHT_CALF';

-- AlterEnum
ALTER TYPE "public"."SafetyEventSource" ADD VALUE 'SESSION_FEEDBACK';

-- AlterTable
ALTER TABLE "public"."SessionSafetyEvent" ADD COLUMN     "sessionFeedbackId" TEXT;

-- CreateTable
CREATE TABLE "public"."SessionFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "sessionRpe" INTEGER NOT NULL,
    "perceivedState" "public"."PerceivedState" NOT NULL,
    "recoveryState" "public"."RecoveryState" NOT NULL,
    "discomfortPresent" BOOLEAN NOT NULL,
    "generalNotes" TEXT,
    "requestHash" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscomfortReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "sessionFeedbackId" TEXT NOT NULL,
    "safetyEventId" TEXT NOT NULL,
    "bodyRegion" "public"."BodyRegion" NOT NULL,
    "otherLocation" TEXT,
    "intensity" INTEGER NOT NULL,
    "exerciseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscomfortReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_workoutSessionId_key" ON "public"."SessionFeedback"("workoutSessionId");

-- CreateIndex
CREATE INDEX "SessionFeedback_organizationId_studentId_submittedAt_idx" ON "public"."SessionFeedback"("organizationId", "studentId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_id_organizationId_workoutSessionId_key" ON "public"."SessionFeedback"("id", "organizationId", "workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_id_organizationId_studentId_workoutSessionI_key" ON "public"."SessionFeedback"("id", "organizationId", "studentId", "workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_workoutSessionId_organizationId_studentId_key" ON "public"."SessionFeedback"("workoutSessionId", "organizationId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscomfortReport_safetyEventId_key" ON "public"."DiscomfortReport"("safetyEventId");

-- CreateIndex
CREATE INDEX "DiscomfortReport_organizationId_studentId_bodyRegion_create_idx" ON "public"."DiscomfortReport"("organizationId", "studentId", "bodyRegion", "createdAt");

-- CreateIndex
CREATE INDEX "DiscomfortReport_organizationId_bodyRegion_createdAt_idx" ON "public"."DiscomfortReport"("organizationId", "bodyRegion", "createdAt");

-- CreateIndex
CREATE INDEX "DiscomfortReport_exerciseId_createdAt_idx" ON "public"."DiscomfortReport"("exerciseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscomfortReport_sessionFeedbackId_bodyRegion_key" ON "public"."DiscomfortReport"("sessionFeedbackId", "bodyRegion");

-- CreateIndex
CREATE UNIQUE INDEX "DiscomfortReport_safetyEventId_workoutSessionId_organizatio_key" ON "public"."DiscomfortReport"("safetyEventId", "workoutSessionId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSafetyEvent_id_workoutSessionId_organizationId_key" ON "public"."SessionSafetyEvent"("id", "workoutSessionId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_id_organizationId_studentId_key" ON "public"."WorkoutSession"("id", "organizationId", "studentId");

-- AddForeignKey
ALTER TABLE "public"."SessionSafetyEvent" ADD CONSTRAINT "SessionSafetyEvent_sessionFeedbackId_organizationId_workou_fkey" FOREIGN KEY ("sessionFeedbackId", "organizationId", "workoutSessionId") REFERENCES "public"."SessionFeedback"("id", "organizationId", "workoutSessionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionFeedback" ADD CONSTRAINT "SessionFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionFeedback" ADD CONSTRAINT "SessionFeedback_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionFeedback" ADD CONSTRAINT "SessionFeedback_workoutSessionId_organizationId_studentId_fkey" FOREIGN KEY ("workoutSessionId", "organizationId", "studentId") REFERENCES "public"."WorkoutSession"("id", "organizationId", "studentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_workoutSessionId_organizationId_studentId_fkey" FOREIGN KEY ("workoutSessionId", "organizationId", "studentId") REFERENCES "public"."WorkoutSession"("id", "organizationId", "studentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_sessionFeedbackId_organizationId_studentI_fkey" FOREIGN KEY ("sessionFeedbackId", "organizationId", "studentId", "workoutSessionId") REFERENCES "public"."SessionFeedback"("id", "organizationId", "studentId", "workoutSessionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_safetyEventId_workoutSessionId_organizati_fkey" FOREIGN KEY ("safetyEventId", "workoutSessionId", "organizationId") REFERENCES "public"."SessionSafetyEvent"("id", "workoutSessionId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscomfortReport" ADD CONSTRAINT "DiscomfortReport_exerciseId_organizationId_fkey" FOREIGN KEY ("exerciseId", "organizationId") REFERENCES "public"."Exercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
