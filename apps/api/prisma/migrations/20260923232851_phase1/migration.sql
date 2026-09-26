-- CreateEnum
CREATE TYPE "public"."MembershipRole" AS ENUM ('ADMIN', 'TRAINER', 'STUDENT');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "public"."ProfileStatus" AS ENUM ('INCOMPLETE', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."ConstraintType" AS ENUM ('LIMITATION', 'DECLARED_INJURY', 'RECURRING_DISCOMFORT');

-- CreateEnum
CREATE TYPE "public"."ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "public"."ExperienceLevel" AS ENUM ('BEGINNER', 'NOVICE', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "public"."TrainingGoal" AS ENUM ('WEIGHT_LOSS', 'HYPERTROPHY', 'STRENGTH', 'BODY_RECOMPOSITION', 'GENERAL_FITNESS', 'SPORT_PERFORMANCE');

-- CreateEnum
CREATE TYPE "public"."Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."MembershipRole" NOT NULL,
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MfaFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "MfaFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "factorId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainerProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,

    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT,
    "displayName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "birthDate" DATE,
    "heightCm" DECIMAL(5,2),
    "trainingFrequencyPerWeek" INTEGER,
    "availableDays" "public"."Weekday"[],
    "approximateSessionMinutes" INTEGER,
    "activityLevel" "public"."ActivityLevel",
    "experienceLevel" "public"."ExperienceLevel",
    "primaryGoal" "public"."TrainingGoal",
    "timezone" TEXT,
    "status" "public"."ProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "planningRevision" INTEGER NOT NULL DEFAULT 1,
    "reviewedPlanningRevision" INTEGER,
    "profileReviewedAt" TIMESTAMP(3),
    "profileReviewedByMembershipId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainerStudentAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TrainerStudentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "invitedByMembershipId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentConstraint" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "public"."ConstraintType" NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalActivity" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weeklyFrequency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BodyWeightMeasurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordedByMembershipId" TEXT NOT NULL,
    "weightKg" DECIMAL(6,2) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyWeightMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainerNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_status_idx" ON "public"."Membership"("organizationId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "public"."Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organizationId_key" ON "public"."Membership"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organizationId_userId_key" ON "public"."Membership"("id", "organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "public"."AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "public"."AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MfaFactor_userId_key" ON "public"."MfaFactor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_hash_key" ON "public"."MfaRecoveryCode"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_membershipId_key" ON "public"."TrainerProfile"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_id_organizationId_key" ON "public"."TrainerProfile"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_membershipId_organizationId_key" ON "public"."TrainerProfile"("membershipId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_membershipId_key" ON "public"."StudentProfile"("membershipId");

-- CreateIndex
CREATE INDEX "StudentProfile_organizationId_displayName_idx" ON "public"."StudentProfile"("organizationId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_id_organizationId_key" ON "public"."StudentProfile"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_membershipId_organizationId_key" ON "public"."StudentProfile"("membershipId", "organizationId");

-- CreateIndex
CREATE INDEX "TrainerStudentAssignment_organizationId_trainerId_active_st_idx" ON "public"."TrainerStudentAssignment"("organizationId", "trainerId", "active", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerStudentAssignment_trainerId_studentId_key" ON "public"."TrainerStudentAssignment"("trainerId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvitation_tokenHash_key" ON "public"."StudentInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StudentInvitation_organizationId_email_status_idx" ON "public"."StudentInvitation"("organizationId", "email", "status");

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_membershipId_organizationId_userId_fkey" FOREIGN KEY ("membershipId", "organizationId", "userId") REFERENCES "public"."Membership"("id", "organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MfaFactor" ADD CONSTRAINT "MfaFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_factorId_fkey" FOREIGN KEY ("factorId") REFERENCES "public"."MfaFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainerProfile" ADD CONSTRAINT "TrainerProfile_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_profileReviewedByMembershipId_organizationI_fkey" FOREIGN KEY ("profileReviewedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainerStudentAssignment" ADD CONSTRAINT "TrainerStudentAssignment_trainerId_organizationId_fkey" FOREIGN KEY ("trainerId", "organizationId") REFERENCES "public"."TrainerProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainerStudentAssignment" ADD CONSTRAINT "TrainerStudentAssignment_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentInvitation" ADD CONSTRAINT "StudentInvitation_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentInvitation" ADD CONSTRAINT "StudentInvitation_invitedByMembershipId_organizationId_fkey" FOREIGN KEY ("invitedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentConstraint" ADD CONSTRAINT "StudentConstraint_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalActivity" ADD CONSTRAINT "ExternalActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BodyWeightMeasurement" ADD CONSTRAINT "BodyWeightMeasurement_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BodyWeightMeasurement" ADD CONSTRAINT "BodyWeightMeasurement_recordedByMembershipId_organizationI_fkey" FOREIGN KEY ("recordedByMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainerNote" ADD CONSTRAINT "TrainerNote_studentId_organizationId_fkey" FOREIGN KEY ("studentId", "organizationId") REFERENCES "public"."StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainerNote" ADD CONSTRAINT "TrainerNote_authorMembershipId_organizationId_fkey" FOREIGN KEY ("authorMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorMembershipId_organizationId_fkey" FOREIGN KEY ("actorMembershipId", "organizationId") REFERENCES "public"."Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
