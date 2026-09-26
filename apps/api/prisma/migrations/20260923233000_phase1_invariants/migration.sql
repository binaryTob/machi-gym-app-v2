CREATE UNIQUE INDEX "one_active_workspace_per_user" ON "Membership" ("userId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "one_owner_per_workspace" ON "Membership" ("organizationId") WHERE "role" = 'ADMIN' AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "user_email_ci" ON "User" (lower("email"));
CREATE UNIQUE INDEX "one_pending_invite_per_student" ON "StudentInvitation" ("studentId") WHERE "status" = 'PENDING';

ALTER TABLE "StudentProfile" ADD CONSTRAINT "profile_revision_positive" CHECK ("planningRevision" > 0 AND "version" > 0);
ALTER TABLE "StudentProfile" ADD CONSTRAINT "profile_ready_reviewed" CHECK ("status" <> 'READY' OR ("profileReviewedByMembershipId" IS NOT NULL AND "profileReviewedAt" IS NOT NULL AND "reviewedPlanningRevision" = "planningRevision"));
ALTER TABLE "StudentProfile" ADD CONSTRAINT "profile_height_range" CHECK ("heightCm" IS NULL OR "heightCm" BETWEEN 50 AND 280);
ALTER TABLE "StudentProfile" ADD CONSTRAINT "profile_frequency_range" CHECK ("trainingFrequencyPerWeek" IS NULL OR "trainingFrequencyPerWeek" BETWEEN 1 AND 7);
ALTER TABLE "StudentProfile" ADD CONSTRAINT "profile_duration_range" CHECK ("approximateSessionMinutes" IS NULL OR "approximateSessionMinutes" BETWEEN 10 AND 240);
ALTER TABLE "BodyWeightMeasurement" ADD CONSTRAINT "weight_range" CHECK ("weightKg" BETWEEN 20 AND 500);
ALTER TABLE "AuthSession" ADD CONSTRAINT "session_expiry_order" CHECK ("idleExpiresAt" <= "absoluteExpiresAt");

CREATE FUNCTION enforce_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "role" FROM "Membership" WHERE "id" = NEW."membershipId") NOT IN ('ADMIN', 'TRAINER') THEN
    RAISE EXCEPTION 'Trainer profile requires trainer/admin membership';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trainer_profile_role BEFORE INSERT OR UPDATE ON "TrainerProfile" FOR EACH ROW EXECUTE FUNCTION enforce_profile_role();

CREATE FUNCTION enforce_student_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."membershipId" IS NOT NULL AND (SELECT "role" FROM "Membership" WHERE "id" = NEW."membershipId") <> 'STUDENT' THEN
    RAISE EXCEPTION 'Student profile requires student membership';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER student_membership_role BEFORE INSERT OR UPDATE OF "membershipId" ON "StudentProfile" FOR EACH ROW EXECUTE FUNCTION enforce_student_membership();

CREATE FUNCTION invalidate_profile_on_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."displayName", NEW."birthDate", NEW."heightCm", NEW."trainingFrequencyPerWeek", NEW."availableDays", NEW."approximateSessionMinutes", NEW."activityLevel", NEW."experienceLevel", NEW."primaryGoal", NEW."timezone")
     IS DISTINCT FROM
     ROW(OLD."displayName", OLD."birthDate", OLD."heightCm", OLD."trainingFrequencyPerWeek", OLD."availableDays", OLD."approximateSessionMinutes", OLD."activityLevel", OLD."experienceLevel", OLD."primaryGoal", OLD."timezone") THEN
    NEW."planningRevision" := OLD."planningRevision" + 1;
    NEW."status" := 'INCOMPLETE';
    NEW."profileReviewedAt" := NULL;
    NEW."profileReviewedByMembershipId" := NULL;
    NEW."reviewedPlanningRevision" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profile_edit_invalidates BEFORE UPDATE ON "StudentProfile" FOR EACH ROW EXECUTE FUNCTION invalidate_profile_on_edit();

CREATE FUNCTION invalidate_profile_on_child() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "StudentProfile" SET "planningRevision" = "planningRevision" + 1,
    "status" = 'INCOMPLETE', "profileReviewedAt" = NULL,
    "profileReviewedByMembershipId" = NULL, "reviewedPlanningRevision" = NULL,
    "version" = "version" + 1
  WHERE "id" = COALESCE(NEW."studentId", OLD."studentId");
  RETURN NULL;
END $$;
CREATE TRIGGER constraint_invalidates AFTER INSERT OR UPDATE OR DELETE ON "StudentConstraint" FOR EACH ROW EXECUTE FUNCTION invalidate_profile_on_child();
CREATE TRIGGER activity_invalidates AFTER INSERT OR UPDATE OR DELETE ON "ExternalActivity" FOR EACH ROW EXECUTE FUNCTION invalidate_profile_on_child();

CREATE FUNCTION immutable_weight() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Body-weight history is append-only';
END $$;
CREATE TRIGGER weight_immutable BEFORE UPDATE OR DELETE ON "BodyWeightMeasurement" FOR EACH ROW EXECUTE FUNCTION immutable_weight();

CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only';
END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION immutable_audit();
