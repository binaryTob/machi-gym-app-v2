-- CreateEnum
CREATE TYPE "public"."MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'QUADRICEPS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'CORE', 'LOWER_BACK', 'FULL_BODY');

-- CreateEnum
CREATE TYPE "public"."Equipment" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'KETTLEBELL', 'RESISTANCE_BAND', 'SMITH_MACHINE', 'BENCH', 'PULL_UP_BAR', 'CARDIO_MACHINE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."MovementPattern" AS ENUM ('HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'SQUAT', 'HINGE', 'LUNGE', 'CARRY', 'ISOLATION', 'ROTATION', 'ANTI_ROTATION', 'FLEXION', 'EXTENSION', 'CONDITIONING');

-- CreateEnum
CREATE TYPE "public"."ExerciseDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "public"."ExercisePerformanceMode" AS ENUM ('WEIGHT_REPS', 'REPS_ONLY');

-- CreateEnum
CREATE TYPE "public"."LoadEntryConvention" AS ENUM ('TOTAL_EXTERNAL_LOAD', 'PER_IMPLEMENT', 'MACHINE_STACK');

-- CreateEnum
CREATE TYPE "public"."ExerciseMediaType" AS ENUM ('THUMBNAIL', 'GIF', 'IMAGE', 'VIDEO', 'ANIMATION');

-- CreateEnum
CREATE TYPE "public"."MediaLicenseStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."Exercise" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "searchText" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "primaryMuscleGroup" "public"."MuscleGroup" NOT NULL,
    "secondaryMuscleGroups" "public"."MuscleGroup"[],
    "equipment" "public"."Equipment"[],
    "movementPattern" "public"."MovementPattern" NOT NULL,
    "difficulty" "public"."ExerciseDifficulty" NOT NULL,
    "performanceMode" "public"."ExercisePerformanceMode" NOT NULL,
    "loadEntryConvention" "public"."LoadEntryConvention",
    "loadMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "instructions" TEXT NOT NULL,
    "commonMistakes" TEXT NOT NULL,
    "cautionNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "aiEligible" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExerciseMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "type" "public"."ExerciseMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "licenseName" TEXT NOT NULL,
    "attributionText" TEXT NOT NULL,
    "licenseStatus" "public"."MediaLicenseStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedByMembershipId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_organizationId_active_name_idx" ON "public"."Exercise"("organizationId", "active", "name");

-- CreateIndex
CREATE INDEX "Exercise_organizationId_primaryMuscleGroup_active_idx" ON "public"."Exercise"("organizationId", "primaryMuscleGroup", "active");

-- CreateIndex
CREATE INDEX "Exercise_organizationId_movementPattern_active_idx" ON "public"."Exercise"("organizationId", "movementPattern", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_organizationId_slug_key" ON "public"."Exercise"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_id_organizationId_key" ON "public"."Exercise"("id", "organizationId");

-- CreateIndex
CREATE INDEX "ExerciseMedia_exerciseId_active_licenseStatus_idx" ON "public"."ExerciseMedia"("exerciseId", "active", "licenseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseMedia_exerciseId_type_url_key" ON "public"."ExerciseMedia"("exerciseId", "type", "url");

-- AddForeignKey
ALTER TABLE "public"."Exercise" ADD CONSTRAINT "Exercise_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExerciseMedia" ADD CONSTRAINT "ExerciseMedia_exerciseId_organizationId_fkey" FOREIGN KEY ("exerciseId", "organizationId") REFERENCES "public"."Exercise"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExerciseMedia" ADD CONSTRAINT "ExerciseMedia_verifiedByMembershipId_organizationId_fkey" FOREIGN KEY ("verifiedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
