CREATE TYPE "AiProposalType" AS ENUM ('INITIAL', 'ADAPTATION');
CREATE TYPE "AiProposalStatus" AS ENUM ('GENERATING', 'READY', 'VALIDATION_FAILED', 'PROVIDER_FAILED', 'APPROVED', 'REJECTED');

CREATE TABLE "AiTrainingProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "requestedByMembershipId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "type" "AiProposalType" NOT NULL,
  "status" "AiProposalStatus" NOT NULL DEFAULT 'GENERATING',
  "sourceVersionId" TEXT,
  "approvedVersionId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "contextVersion" TEXT NOT NULL,
  "contextHash" TEXT NOT NULL,
  "contextSummary" JSONB NOT NULL,
  "originalProposal" JSONB,
  "editedProposal" JSONB,
  "validationResult" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByMembershipId" TEXT,
  "rejectionReason" TEXT,
  CONSTRAINT "ai_proposal_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_student_fk" FOREIGN KEY ("studentId", "organizationId") REFERENCES "StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_requester_fk" FOREIGN KEY ("requestedByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_reviewer_fk" FOREIGN KEY ("reviewedByMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_source_fk" FOREIGN KEY ("sourceVersionId", "organizationId") REFERENCES "TrainingPlanVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_approved_fk" FOREIGN KEY ("approvedVersionId", "organizationId") REFERENCES "TrainingPlanVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_proposal_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "ai_proposal_attempts_check" CHECK ("attempts" BETWEEN 1 AND 3),
  CONSTRAINT "ai_proposal_lineage_check" CHECK (("type" = 'INITIAL' AND "sourceVersionId" IS NULL) OR ("type" = 'ADAPTATION' AND "sourceVersionId" IS NOT NULL)),
  CONSTRAINT "ai_proposal_review_check" CHECK (("status" = 'APPROVED' AND "approvedVersionId" IS NOT NULL AND "reviewedByMembershipId" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR ("status" <> 'APPROVED' AND "approvedVersionId" IS NULL)),
  CONSTRAINT "ai_proposal_reject_check" CHECK ("status" <> 'REJECTED' OR ("reviewedAt" IS NOT NULL AND "reviewedByMembershipId" IS NOT NULL AND "rejectionReason" IS NOT NULL))
);
CREATE UNIQUE INDEX "ai_proposal_request_key" ON "AiTrainingProposal"("organizationId", "requestKey");
CREATE UNIQUE INDEX "ai_proposal_approved_version" ON "AiTrainingProposal"("approvedVersionId");
CREATE INDEX "ai_proposal_roster" ON "AiTrainingProposal"("organizationId", "studentId", "createdAt");

CREATE FUNCTION protect_ai_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'AI proposal history cannot be deleted'; END IF;
  IF OLD."status" IN ('APPROVED', 'REJECTED') OR
     NEW."id" IS DISTINCT FROM OLD."id" OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
     NEW."studentId" IS DISTINCT FROM OLD."studentId" OR NEW."requestedByMembershipId" IS DISTINCT FROM OLD."requestedByMembershipId" OR
     NEW."requestKey" IS DISTINCT FROM OLD."requestKey" OR NEW."type" IS DISTINCT FROM OLD."type" OR
     NEW."sourceVersionId" IS DISTINCT FROM OLD."sourceVersionId" OR NEW."provider" IS DISTINCT FROM OLD."provider" OR
     NEW."model" IS DISTINCT FROM OLD."model" OR NEW."promptVersion" IS DISTINCT FROM OLD."promptVersion" OR
     NEW."contextVersion" IS DISTINCT FROM OLD."contextVersion" OR NEW."contextHash" IS DISTINCT FROM OLD."contextHash" OR
     NEW."contextSummary" IS DISTINCT FROM OLD."contextSummary" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR
     (OLD."originalProposal" IS NOT NULL AND NEW."originalProposal" IS DISTINCT FROM OLD."originalProposal") OR
     (OLD."status" = 'GENERATING' AND NEW."status" NOT IN ('GENERATING', 'READY', 'VALIDATION_FAILED', 'PROVIDER_FAILED')) OR
     (OLD."status" IN ('VALIDATION_FAILED', 'PROVIDER_FAILED') AND NEW."status" <> 'GENERATING') OR
     (OLD."status" = 'READY' AND NEW."status" NOT IN ('READY', 'APPROVED', 'REJECTED')) THEN
    RAISE EXCEPTION 'Invalid AI proposal mutation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_ai_proposal BEFORE UPDATE OR DELETE ON "AiTrainingProposal" FOR EACH ROW EXECUTE FUNCTION protect_ai_proposal();
