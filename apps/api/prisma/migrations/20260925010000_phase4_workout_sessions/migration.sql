-- CreateEnum
CREATE TYPE "public"."WorkoutSessionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."SetCompletionState" AS ENUM ('NOT_STARTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."PartialWorkoutReason" AS ENUM ('LACK_OF_TIME', 'FATIGUE', 'DISCOMFORT_OR_PAIN', 'FEELING_UNWELL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."CancellationReason" AS ENUM ('SCHEDULE_CHANGE', 'FEELING_UNWELL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."CancellationActorType" AS ENUM ('STUDENT', 'TRAINER', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."SafetyEventType" AS ENUM ('DISCOMFORT_OR_PAIN', 'FEELING_UNWELL');

-- CreateEnum
CREATE TYPE "public"."SafetyEventSource" AS ENUM ('EARLY_FINISH');

-- CreateEnum
CREATE TYPE "public"."BodyRegion" AS ENUM ('HEAD_NECK', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST_HAND', 'RIGHT_WRIST_HAND', 'CHEST', 'UPPER_BACK', 'LOWER_BACK', 'ABDOMEN', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_THIGH', 'RIGHT_THIGH', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_LOWER_LEG', 'RIGHT_LOWER_LEG', 'LEFT_ANKLE_FOOT', 'RIGHT_ANKLE_FOOT', 'OTHER');

-- CreateTable
CREATE TABLE "public"."WorkoutSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentPlanAssignmentId" TEXT NOT NULL,
    "trainingPlanVersionId" TEXT NOT NULL,
    "workoutTemplateId" TEXT NOT NULL,
    "scheduledByMembershipId" TEXT NOT NULL,
    "scheduleRequestKey" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "public"."WorkoutSessionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "partialReason" "public"."PartialWorkoutReason",
    "partialReasonDetail" TEXT,
    "cancellationReason" "public"."CancellationReason",
    "cancellationActorType" "public"."CancellationActorType",
    "cancelledByMembershipId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "skippedByMembershipId" TEXT,
    "skippedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SessionExercise" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "programmedExerciseId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "exerciseNameSnapshot" TEXT NOT NULL,
    "primaryMuscleSnapshot" "public"."MuscleGroup" NOT NULL,
    "performanceModeSnapshot" "public"."ExercisePerformanceMode" NOT NULL,
    "loadEntryConventionSnapshot" "public"."LoadEntryConvention",
    "loadMultiplierSnapshot" DECIMAL(5,2) NOT NULL,
    "instructionsSnapshot" TEXT NOT NULL,
    "commonMistakesSnapshot" TEXT NOT NULL,
    "cautionNotesSnapshot" TEXT,
    "targetSets" INTEGER NOT NULL,
    "targetRepsMin" INTEGER NOT NULL,
    "targetRepsMax" INTEGER NOT NULL,
    "intensityMode" "public"."IntensityMode" NOT NULL,
    "targetRir" INTEGER,
    "targetRpe" DECIMAL(3,1),
    "restSeconds" INTEGER NOT NULL,
    "trainerNotes" TEXT,
    "suggestedLoadKg" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SetPerformance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "completionState" "public"."SetCompletionState" NOT NULL DEFAULT 'NOT_STARTED',
    "actualLoadKg" DECIMAL(7,2),
    "actualRepetitions" INTEGER,
    "rir" INTEGER,
    "rpe" DECIMAL(3,1),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SessionSafetyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "type" "public"."SafetyEventType" NOT NULL,
    "source" "public"."SafetyEventSource" NOT NULL DEFAULT 'EARLY_FINISH',
    "bodyRegion" "public"."BodyRegion",
    "intensity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSafetyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutSession_organizationId_studentId_scheduledDate_statu_idx" ON "public"."WorkoutSession"("organizationId", "studentId", "scheduledDate", "status");

-- CreateIndex
CREATE INDEX "WorkoutSession_organizationId_studentId_finishedAt_id_idx" ON "public"."WorkoutSession"("organizationId", "studentId", "finishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_id_organizationId_key" ON "public"."WorkoutSession"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_organizationId_scheduleRequestKey_key" ON "public"."WorkoutSession"("organizationId", "scheduleRequestKey");

-- CreateIndex
CREATE INDEX "SessionExercise_workoutSessionId_exerciseId_idx" ON "public"."SessionExercise"("workoutSessionId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_workoutSessionId_order_key" ON "public"."SessionExercise"("workoutSessionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_workoutSessionId_programmedExerciseId_key" ON "public"."SessionExercise"("workoutSessionId", "programmedExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_id_organizationId_key" ON "public"."SessionExercise"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPerformance_sessionExerciseId_setNumber_key" ON "public"."SetPerformance"("sessionExerciseId", "setNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SetPerformance_id_organizationId_key" ON "public"."SetPerformance"("id", "organizationId");

-- CreateIndex
CREATE INDEX "SessionSafetyEvent_organizationId_type_createdAt_idx" ON "public"."SessionSafetyEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "SessionSafetyEvent_workoutSessionId_idx" ON "public"."SessionSafetyEvent"("workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentPlanAssignment_id_organizationId_trainingPlanVersion_key" ON "public"."StudentPlanAssignment"("id", "organizationId", "trainingPlanVersionId");

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_studentPlanAssignmentId_organizationId_trai_fkey" FOREIGN KEY ("studentPlanAssignmentId", "organizationId", "trainingPlanVersionId") REFERENCES "public"."StudentPlanAssignment"("id", "organizationId", "trainingPlanVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_trainingPlanVersionId_organizationId_fkey" FOREIGN KEY ("trainingPlanVersionId", "organizationId") REFERENCES "public"."TrainingPlanVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_workoutTemplateId_organizationId_fkey" FOREIGN KEY ("workoutTemplateId", "organizationId") REFERENCES "public"."WorkoutTemplate"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_scheduledByMembershipId_organizationId_fkey" FOREIGN KEY ("scheduledByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_cancelledByMembershipId_organizationId_fkey" FOREIGN KEY ("cancelledByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutSession" ADD CONSTRAINT "WorkoutSession_skippedByMembershipId_organizationId_fkey" FOREIGN KEY ("skippedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionExercise" ADD CONSTRAINT "SessionExercise_workoutSessionId_organizationId_fkey" FOREIGN KEY ("workoutSessionId", "organizationId") REFERENCES "public"."WorkoutSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionExercise" ADD CONSTRAINT "SessionExercise_programmedExerciseId_organizationId_fkey" FOREIGN KEY ("programmedExerciseId", "organizationId") REFERENCES "public"."ProgrammedExercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionExercise" ADD CONSTRAINT "SessionExercise_exerciseId_organizationId_fkey" FOREIGN KEY ("exerciseId", "organizationId") REFERENCES "public"."Exercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SetPerformance" ADD CONSTRAINT "SetPerformance_sessionExerciseId_organizationId_fkey" FOREIGN KEY ("sessionExerciseId", "organizationId") REFERENCES "public"."SessionExercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionSafetyEvent" ADD CONSTRAINT "SessionSafetyEvent_workoutSessionId_organizationId_fkey" FOREIGN KEY ("workoutSessionId", "organizationId") REFERENCES "public"."WorkoutSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
