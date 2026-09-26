CREATE UNIQUE INDEX "one_plan_draft" ON "TrainingPlanVersion" ("trainingPlanId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "one_plan_active_version" ON "TrainingPlanVersion" ("trainingPlanId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "one_primary_student_plan" ON "StudentPlanAssignment" ("organizationId", "studentId") WHERE "active" = true;

ALTER TABLE "TrainingPlan" ADD CONSTRAINT "plan_metadata_valid" CHECK (
  length(trim("name")) BETWEEN 3 AND 120 AND "version" > 0 AND
  (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL))
);
ALTER TABLE "TrainingPlanVersion" ADD CONSTRAINT "plan_version_metadata_valid" CHECK (
  "versionNumber" > 0 AND "revision" > 0 AND length(trim("title")) BETWEEN 3 AND 120 AND
  (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "retiredAt" IS NULL AND "voidedAt" IS NULL) OR
   ("status" = 'ACTIVE' AND "publishedAt" IS NOT NULL AND "publishedByMembershipId" IS NOT NULL AND "retiredAt" IS NULL AND "voidedAt" IS NULL) OR
   ("status" = 'RETIRED' AND "publishedAt" IS NOT NULL AND "publishedByMembershipId" IS NOT NULL AND "retiredAt" IS NOT NULL AND "retiredByMembershipId" IS NOT NULL AND "voidedAt" IS NULL) OR
   ("status" = 'VOID' AND "publishedAt" IS NULL AND "voidedAt" IS NOT NULL AND "voidedByMembershipId" IS NOT NULL AND length(trim("voidReason")) > 0))
);
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "template_fields_valid" CHECK (
  "order" > 0 AND length(trim("name")) BETWEEN 2 AND 120 AND
  ("expectedDurationMinutes" IS NULL OR "expectedDurationMinutes" BETWEEN 10 AND 240) AND
  ("dayLabel" IS NULL OR length(trim("dayLabel")) BETWEEN 1 AND 60)
);
ALTER TABLE "ProgrammedExercise" ADD CONSTRAINT "prescription_fields_valid" CHECK (
  "order" > 0 AND "targetSets" BETWEEN 1 AND 15 AND
  "targetRepsMin" BETWEEN 1 AND 50 AND "targetRepsMax" BETWEEN "targetRepsMin" AND 50 AND
  "restSeconds" BETWEEN 0 AND 600 AND
  ("suggestedLoadKg" IS NULL OR "suggestedLoadKg" BETWEEN 0 AND 9999) AND
  (("intensityMode" = 'NONE' AND "targetRir" IS NULL AND "targetRpe" IS NULL) OR
   ("intensityMode" = 'RIR' AND "targetRir" BETWEEN 0 AND 10 AND "targetRpe" IS NULL) OR
   ("intensityMode" = 'RPE' AND "targetRpe" BETWEEN 1 AND 10 AND "targetRir" IS NULL))
);
ALTER TABLE "StudentPlanAssignment" ADD CONSTRAINT "assignment_dates_valid" CHECK (
  ("endDate" IS NULL OR "endDate" >= "startDate") AND
  (("active" AND "endedAt" IS NULL) OR (NOT "active" AND "endedAt" IS NOT NULL))
);

CREATE FUNCTION plan_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Plan identities are archived, not deleted'; END IF;
  IF ROW(NEW."organizationId", NEW."createdByMembershipId") IS DISTINCT FROM ROW(OLD."organizationId", OLD."createdByMembershipId") THEN
    RAISE EXCEPTION 'Plan identity cannot be repointed';
  END IF;
  IF OLD."status" = 'ARCHIVED' THEN RAISE EXCEPTION 'Archived plans are immutable'; END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status" = 'DRAFT' AND NEW."status" = 'ACTIVE') OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'ARCHIVED')) THEN
      RAISE EXCEPTION 'Invalid plan transition';
    END IF;
  END IF;
  IF NEW."status" = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "TrainingPlanVersion" WHERE "trainingPlanId" = NEW."id" AND "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'An active plan needs a published version';
  END IF;
  IF NEW."status" = 'ARCHIVED' AND (
    EXISTS (SELECT 1 FROM "StudentPlanAssignment" WHERE "trainingPlanId" = NEW."id" AND "active" = true) OR
    EXISTS (SELECT 1 FROM "TrainingPlanVersion" WHERE "trainingPlanId" = NEW."id" AND "status" = 'ACTIVE')
  ) THEN RAISE EXCEPTION 'Replace active assignments and retire the plan version first'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_identity_protected BEFORE UPDATE OR DELETE ON "TrainingPlan" FOR EACH ROW EXECUTE FUNCTION plan_identity_guard();

CREATE FUNCTION published_content_valid(version_id text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM "WorkoutTemplate" WHERE "trainingPlanVersionId" = version_id)
    AND NOT EXISTS (
      SELECT 1 FROM "WorkoutTemplate" wt
      WHERE wt."trainingPlanVersionId" = version_id
        AND NOT EXISTS (SELECT 1 FROM "ProgrammedExercise" pe WHERE pe."workoutTemplateId" = wt."id")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ProgrammedExercise" pe
      JOIN "WorkoutTemplate" wt ON wt."id" = pe."workoutTemplateId"
      JOIN "Exercise" e ON e."id" = pe."exerciseId" AND e."organizationId" = pe."organizationId"
      WHERE wt."trainingPlanVersionId" = version_id AND (
        NOT e."active" OR pe."exerciseVersionSnapshot" IS DISTINCT FROM e."version" OR
        pe."exerciseNameSnapshot" IS DISTINCT FROM e."name" OR
        pe."primaryMuscleSnapshot" IS DISTINCT FROM e."primaryMuscleGroup" OR
        pe."performanceModeSnapshot" IS DISTINCT FROM e."performanceMode" OR
        pe."loadEntryConventionSnapshot" IS DISTINCT FROM e."loadEntryConvention" OR
        pe."loadMultiplierSnapshot" IS DISTINCT FROM e."loadMultiplier" OR
        pe."instructionsSnapshot" IS DISTINCT FROM e."instructions" OR
        pe."commonMistakesSnapshot" IS DISTINCT FROM e."commonMistakes" OR
        pe."cautionNotesSnapshot" IS DISTINCT FROM e."cautionNotes"
      )
    );
$$;

CREATE FUNCTION plan_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Plan version history is immutable'; END IF;
  IF ROW(NEW."organizationId", NEW."trainingPlanId", NEW."versionNumber", NEW."createdByMembershipId") IS DISTINCT FROM
     ROW(OLD."organizationId", OLD."trainingPlanId", OLD."versionNumber", OLD."createdByMembershipId") THEN
    RAISE EXCEPTION 'Plan version lineage cannot change';
  END IF;
  IF OLD."status" = 'DRAFT' THEN
    IF NEW."status" NOT IN ('DRAFT', 'ACTIVE', 'VOID') THEN RAISE EXCEPTION 'Invalid draft transition'; END IF;
    IF NEW."status" = 'ACTIVE' AND NOT published_content_valid(OLD."id") THEN RAISE EXCEPTION 'Published plan needs complete, current exercise snapshots'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'ACTIVE' AND NEW."status" = 'RETIRED' AND
     (to_jsonb(NEW) - 'status' - 'retiredAt' - 'retiredByMembershipId' - 'updatedAt') =
     (to_jsonb(OLD) - 'status' - 'retiredAt' - 'retiredByMembershipId' - 'updatedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Non-draft plan versions are immutable';
END $$;
CREATE TRIGGER plan_version_protected BEFORE UPDATE OR DELETE ON "TrainingPlanVersion" FOR EACH ROW EXECUTE FUNCTION plan_version_guard();

CREATE FUNCTION template_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "PlanVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "TrainingPlanVersion" WHERE "id" = OLD."trainingPlanVersionId" FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Published workout templates are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND ROW(OLD."organizationId", OLD."trainingPlanVersionId") IS DISTINCT FROM ROW(NEW."organizationId", NEW."trainingPlanVersionId") THEN
    RAISE EXCEPTION 'Template lineage cannot change';
  END IF;
  SELECT "status" INTO parent_status FROM "TrainingPlanVersion" WHERE "id" = NEW."trainingPlanVersionId" FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only drafts can change workout templates'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_template_draft_only BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutTemplate" FOR EACH ROW EXECUTE FUNCTION template_draft_guard();

CREATE FUNCTION programmed_exercise_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "PlanVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT pv."status" INTO parent_status FROM "WorkoutTemplate" wt JOIN "TrainingPlanVersion" pv ON pv."id" = wt."trainingPlanVersionId" WHERE wt."id" = OLD."workoutTemplateId" FOR UPDATE OF pv;
    IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Published prescriptions are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND ROW(OLD."organizationId", OLD."workoutTemplateId") IS DISTINCT FROM ROW(NEW."organizationId", NEW."workoutTemplateId") THEN
    RAISE EXCEPTION 'Prescription lineage cannot change';
  END IF;
  SELECT pv."status" INTO parent_status FROM "WorkoutTemplate" wt JOIN "TrainingPlanVersion" pv ON pv."id" = wt."trainingPlanVersionId" WHERE wt."id" = NEW."workoutTemplateId" FOR UPDATE OF pv;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only drafts can change prescriptions'; END IF;
  IF TG_OP = 'INSERT' OR NEW."exerciseId" IS DISTINCT FROM OLD."exerciseId" THEN
    IF NOT EXISTS (SELECT 1 FROM "Exercise" WHERE "id" = NEW."exerciseId" AND "organizationId" = NEW."organizationId" AND "active" = true) THEN
      RAISE EXCEPTION 'Cannot program another organization or inactive exercise';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER programmed_exercise_draft_only BEFORE INSERT OR UPDATE OR DELETE ON "ProgrammedExercise" FOR EACH ROW EXECUTE FUNCTION programmed_exercise_guard();

CREATE FUNCTION assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE timezone_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Assignment history is retained'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT "timezone" INTO timezone_name FROM "Organization" WHERE "id" = NEW."organizationId";
    IF NEW."startDate" > (now() AT TIME ZONE timezone_name)::date THEN RAISE EXCEPTION 'A current assignment cannot start in the future'; END IF;
    IF NOT NEW."active" OR NEW."endedAt" IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM "TrainingPlanVersion" pv JOIN "TrainingPlan" p ON p."id" = pv."trainingPlanId"
      WHERE pv."id" = NEW."trainingPlanVersionId" AND pv."organizationId" = NEW."organizationId"
        AND pv."trainingPlanId" = NEW."trainingPlanId" AND pv."status" = 'ACTIVE' AND p."status" = 'ACTIVE'
    ) THEN RAISE EXCEPTION 'New assignments require a current published plan version'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."active" AND NOT NEW."active" AND NEW."endedAt" IS NOT NULL AND
     (to_jsonb(NEW) - 'active' - 'endedAt') = (to_jsonb(OLD) - 'active' - 'endedAt') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Assignment provenance is immutable; replace or deactivate';
END $$;
CREATE TRIGGER student_plan_assignment_protected BEFORE INSERT OR UPDATE OR DELETE ON "StudentPlanAssignment" FOR EACH ROW EXECUTE FUNCTION assignment_guard();
