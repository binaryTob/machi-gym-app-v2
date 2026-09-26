-- CreateEnum
CREATE TYPE "public"."TrainingPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."PlanVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."IntensityMode" AS ENUM ('NONE', 'RIR', 'RPE');

-- DropIndex
DROP INDEX "public"."exercise_search_trgm";

-- CreateTable
CREATE TABLE "public"."TrainingPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByMembershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" "public"."TrainingGoal" NOT NULL,
    "status" "public"."TrainingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingPlanVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trainingPlanId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "public"."PlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" "public"."TrainingGoal" NOT NULL,
    "createdByMembershipId" TEXT NOT NULL,
    "publishedByMembershipId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredByMembershipId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "voidedByMembershipId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trainingPlanVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "expectedDurationMinutes" INTEGER,
    "dayLabel" TEXT,
    "trainerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgrammedExercise" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workoutTemplateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL,
    "targetRepsMin" INTEGER NOT NULL,
    "targetRepsMax" INTEGER NOT NULL,
    "intensityMode" "public"."IntensityMode" NOT NULL DEFAULT 'NONE',
    "targetRir" INTEGER,
    "targetRpe" DECIMAL(3,1),
    "restSeconds" INTEGER NOT NULL,
    "suggestedLoadKg" DECIMAL(7,2),
    "trainerNotes" TEXT,
    "exerciseVersionSnapshot" INTEGER,
    "exerciseNameSnapshot" TEXT,
    "primaryMuscleSnapshot" "public"."MuscleGroup",
    "performanceModeSnapshot" "public"."ExercisePerformanceMode",
    "loadEntryConventionSnapshot" "public"."LoadEntryConvention",
    "loadMultiplierSnapshot" DECIMAL(5,2),
    "instructionsSnapshot" TEXT,
    "commonMistakesSnapshot" TEXT,
    "cautionNotesSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammedExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentPlanAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "trainingPlanId" TEXT NOT NULL,
    "trainingPlanVersionId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StudentPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingPlan_organizationId_status_createdAt_idx" ON "public"."TrainingPlan"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlan_id_organizationId_key" ON "public"."TrainingPlan"("id", "organizationId");

-- CreateIndex
CREATE INDEX "TrainingPlanVersion_trainingPlanId_status_idx" ON "public"."TrainingPlanVersion"("trainingPlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanVersion_trainingPlanId_versionNumber_key" ON "public"."TrainingPlanVersion"("trainingPlanId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanVersion_id_organizationId_key" ON "public"."TrainingPlanVersion"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanVersion_id_organizationId_trainingPlanId_key" ON "public"."TrainingPlanVersion"("id", "organizationId", "trainingPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutTemplate_trainingPlanVersionId_order_key" ON "public"."WorkoutTemplate"("trainingPlanVersionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutTemplate_id_organizationId_key" ON "public"."WorkoutTemplate"("id", "organizationId");

-- CreateIndex
CREATE INDEX "ProgrammedExercise_exerciseId_idx" ON "public"."ProgrammedExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammedExercise_workoutTemplateId_order_key" ON "public"."ProgrammedExercise"("workoutTemplateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammedExercise_workoutTemplateId_exerciseId_key" ON "public"."ProgrammedExercise"("workoutTemplateId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammedExercise_id_organizationId_key" ON "public"."ProgrammedExercise"("id", "organizationId");

-- CreateIndex
CREATE INDEX "StudentPlanAssignment_organizationId_studentId_assignedAt_idx" ON "public"."StudentPlanAssignment"("organizationId", "studentId", "assignedAt");

-- CreateIndex
CREATE INDEX "StudentPlanAssignment_trainingPlanVersionId_active_idx" ON "public"."StudentPlanAssignment"("trainingPlanVersionId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "StudentPlanAssignment_id_organizationId_key" ON "public"."StudentPlanAssignment"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "public"."TrainingPlan" ADD CONSTRAINT "TrainingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlan" ADD CONSTRAINT "TrainingPlan_createdByMembershipId_organizationId_fkey" FOREIGN KEY ("createdByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlanVersion" ADD CONSTRAINT "TrainingPlanVersion_trainingPlanId_organizationId_fkey" FOREIGN KEY ("trainingPlanId", "organizationId") REFERENCES "public"."TrainingPlan"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlanVersion" ADD CONSTRAINT "TrainingPlanVersion_createdByMembershipId_organizationId_fkey" FOREIGN KEY ("createdByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlanVersion" ADD CONSTRAINT "TrainingPlanVersion_publishedByMembershipId_organizationId_fkey" FOREIGN KEY ("publishedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlanVersion" ADD CONSTRAINT "TrainingPlanVersion_retiredByMembershipId_organizationId_fkey" FOREIGN KEY ("retiredByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingPlanVersion" ADD CONSTRAINT "TrainingPlanVersion_voidedByMembershipId_organizationId_fkey" FOREIGN KEY ("voidedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_trainingPlanVersionId_organizationId_fkey" FOREIGN KEY ("trainingPlanVersionId", "organizationId") REFERENCES "public"."TrainingPlanVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgrammedExercise" ADD CONSTRAINT "ProgrammedExercise_workoutTemplateId_organizationId_fkey" FOREIGN KEY ("workoutTemplateId", "organizationId") REFERENCES "public"."WorkoutTemplate"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgrammedExercise" ADD CONSTRAINT "ProgrammedExercise_exerciseId_organizationId_fkey" FOREIGN KEY ("exerciseId", "organizationId") REFERENCES "public"."Exercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentPlanAssignment" ADD CONSTRAINT "StudentPlanAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentPlanAssignment" ADD CONSTRAINT "StudentPlanAssignment_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentPlanAssignment" ADD CONSTRAINT "StudentPlanAssignment_trainingPlanId_organizationId_fkey" FOREIGN KEY ("trainingPlanId", "organizationId") REFERENCES "public"."TrainingPlan"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentPlanAssignment" ADD CONSTRAINT "StudentPlanAssignment_trainingPlanVersionId_organizationId_fkey" FOREIGN KEY ("trainingPlanVersionId", "organizationId", "trainingPlanId") REFERENCES "public"."TrainingPlanVersion"("id", "organizationId", "trainingPlanId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentPlanAssignment" ADD CONSTRAINT "StudentPlanAssignment_assignedByMembershipId_organizationI_fkey" FOREIGN KEY ("assignedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
