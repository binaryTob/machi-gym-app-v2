ALTER TABLE "WorkoutSession" ADD COLUMN "snapshotSealed" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "one_in_progress_student_session" ON "WorkoutSession" ("organizationId", "studentId") WHERE "status" = 'IN_PROGRESS';
CREATE INDEX "previous_finalized_workout" ON "WorkoutSession" ("organizationId", "studentId", "finishedAt" DESC, "id" DESC) WHERE "status" IN ('COMPLETED', 'PARTIAL') AND "finishedAt" IS NOT NULL;
CREATE UNIQUE INDEX "one_early_safety_event_per_type" ON "SessionSafetyEvent" ("workoutSessionId", "type") WHERE "source" = 'EARLY_FINISH';

ALTER TABLE "WorkoutSession" ADD CONSTRAINT "workout_session_fields_valid" CHECK (
  "version" > 0 AND length(trim("timezone")) BETWEEN 1 AND 80 AND length(trim("scheduleRequestKey")) BETWEEN 8 AND 128 AND
  ("partialReasonDetail" IS NULL OR length("partialReasonDetail") <= 500) AND
  (("status" = 'NOT_STARTED' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NULL AND "skippedAt" IS NULL AND "partialReason" IS NULL) OR
   ("status" = 'IN_PROGRESS' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NULL AND "skippedAt" IS NULL AND "partialReason" IS NULL) OR
   ("status" = 'COMPLETED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "partialReason" IS NULL AND "cancelledAt" IS NULL AND "skippedAt" IS NULL) OR
   ("status" = 'PARTIAL' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "partialReason" IS NOT NULL AND "cancelledAt" IS NULL AND "skippedAt" IS NULL) OR
   ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND "cancellationActorType" IS NOT NULL AND "cancelledByMembershipId" IS NOT NULL AND "finishedAt" IS NULL AND "skippedAt" IS NULL) OR
   ("status" = 'SKIPPED' AND "startedAt" IS NULL AND "skippedAt" IS NOT NULL AND "skippedByMembershipId" IS NOT NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NULL))
);
ALTER TABLE "SessionExercise" ADD CONSTRAINT "session_prescription_valid" CHECK (
  "order" > 0 AND "targetSets" BETWEEN 1 AND 15 AND "targetRepsMin" BETWEEN 1 AND 50 AND
  "targetRepsMax" BETWEEN "targetRepsMin" AND 50 AND "restSeconds" BETWEEN 0 AND 600 AND
  "loadMultiplierSnapshot" BETWEEN 0.1 AND 4 AND
  ("suggestedLoadKg" IS NULL OR "suggestedLoadKg" BETWEEN 0 AND 9999) AND
  (("performanceModeSnapshot" = 'WEIGHT_REPS' AND "loadEntryConventionSnapshot" IS NOT NULL) OR
   ("performanceModeSnapshot" = 'REPS_ONLY' AND "loadEntryConventionSnapshot" IS NULL AND "suggestedLoadKg" IS NULL)) AND
  (("intensityMode" = 'NONE' AND "targetRir" IS NULL AND "targetRpe" IS NULL) OR
   ("intensityMode" = 'RIR' AND "targetRir" BETWEEN 0 AND 10 AND "targetRpe" IS NULL) OR
   ("intensityMode" = 'RPE' AND "targetRpe" BETWEEN 1 AND 10 AND "targetRir" IS NULL))
);
ALTER TABLE "SetPerformance" ADD CONSTRAINT "set_actual_values_valid" CHECK (
  "setNumber" > 0 AND "version" > 0 AND
  ("actualLoadKg" IS NULL OR "actualLoadKg" BETWEEN 0 AND 9999) AND
  ("actualRepetitions" IS NULL OR "actualRepetitions" BETWEEN 1 AND 1000) AND
  ("rir" IS NULL OR "rir" BETWEEN 0 AND 10) AND ("rpe" IS NULL OR "rpe" BETWEEN 1 AND 10) AND
  (("completionState" = 'NOT_STARTED' AND "completedAt" IS NULL) OR ("completionState" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "actualRepetitions" IS NOT NULL))
);
ALTER TABLE "SessionSafetyEvent" ADD CONSTRAINT "safety_event_range" CHECK ("intensity" IS NULL OR "intensity" BETWEEN 1 AND 10);

CREATE FUNCTION check_occurrence_snapshot(session_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE planned_count integer;
BEGIN
  SELECT count(*) INTO planned_count FROM "ProgrammedExercise" pe JOIN "WorkoutSession" ws ON ws."workoutTemplateId" = pe."workoutTemplateId" WHERE ws."id" = session_id;
  IF planned_count = 0 OR planned_count <> (SELECT count(*) FROM "SessionExercise" WHERE "workoutSessionId" = session_id) THEN
    RAISE EXCEPTION 'Occurrence requires exactly every prescribed exercise';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "SessionExercise" se
    WHERE se."workoutSessionId" = session_id AND (
      se."targetSets" <> (SELECT count(*) FROM "SetPerformance" sp WHERE sp."sessionExerciseId" = se."id") OR
      EXISTS (SELECT 1 FROM "SetPerformance" sp WHERE sp."sessionExerciseId" = se."id" AND sp."setNumber" > se."targetSets")
    )
  ) THEN RAISE EXCEPTION 'Occurrence requires exact contiguous set positions'; END IF;
END $$;

CREATE FUNCTION workout_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_row "StudentPlanAssignment"%ROWTYPE;
DECLARE template_version text;
DECLARE effective_timezone text;
DECLARE completed_count integer;
DECLARE required_count integer;
DECLARE finished_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Scheduled and historical workouts cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO assignment_row FROM "StudentPlanAssignment" WHERE "id" = NEW."studentPlanAssignmentId";
    SELECT "trainingPlanVersionId" INTO template_version FROM "WorkoutTemplate" WHERE "id" = NEW."workoutTemplateId";
    SELECT COALESCE(sp."timezone", o."timezone") INTO effective_timezone FROM "StudentProfile" sp JOIN "Organization" o ON o."id" = sp."organizationId" WHERE sp."id" = NEW."studentId";
    IF assignment_row."id" IS NULL OR NOT assignment_row."active" OR assignment_row."studentId" IS DISTINCT FROM NEW."studentId" OR
       assignment_row."organizationId" IS DISTINCT FROM NEW."organizationId" OR template_version IS DISTINCT FROM NEW."trainingPlanVersionId" OR
       effective_timezone IS DISTINCT FROM NEW."timezone" OR NEW."scheduledDate" < assignment_row."startDate" OR
       (assignment_row."endDate" IS NOT NULL AND NEW."scheduledDate" > assignment_row."endDate") OR
       NEW."status" <> 'NOT_STARTED' OR NEW."snapshotSealed" OR NEW."version" <> 1 OR
       NOT EXISTS (SELECT 1 FROM "TrainingPlanVersion" WHERE "id" = NEW."trainingPlanVersionId" AND "status" IN ('ACTIVE','RETIRED')) THEN
      RAISE EXCEPTION 'Invalid assignment/template/student lineage or initial occurrence state';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(OLD."organizationId", OLD."studentId", OLD."studentPlanAssignmentId", OLD."trainingPlanVersionId", OLD."workoutTemplateId", OLD."scheduledByMembershipId", OLD."scheduleRequestKey", OLD."scheduledDate", OLD."timezone", OLD."createdAt") IS DISTINCT FROM
     ROW(NEW."organizationId", NEW."studentId", NEW."studentPlanAssignmentId", NEW."trainingPlanVersionId", NEW."workoutTemplateId", NEW."scheduledByMembershipId", NEW."scheduleRequestKey", NEW."scheduledDate", NEW."timezone", NEW."createdAt") THEN
    RAISE EXCEPTION 'Occurrence provenance cannot be repointed';
  END IF;
  IF OLD."status" IN ('COMPLETED','PARTIAL','CANCELLED','SKIPPED') THEN RAISE EXCEPTION 'Finalized occurrences are immutable'; END IF;
  IF NOT OLD."snapshotSealed" AND NEW."snapshotSealed" THEN
    IF NEW."status" <> 'NOT_STARTED' THEN RAISE EXCEPTION 'Seal before starting'; END IF;
    PERFORM check_occurrence_snapshot(NEW."id");
  ELSIF NEW."snapshotSealed" IS DISTINCT FROM OLD."snapshotSealed" OR NOT NEW."snapshotSealed" THEN
    RAISE EXCEPTION 'Occurrence snapshot cannot be unsealed';
  END IF;
  IF NEW."status" = OLD."status" THEN
    IF NOT (OLD."status" = 'NOT_STARTED' AND NOT OLD."snapshotSealed" AND NEW."snapshotSealed" AND NEW."version" = OLD."version" AND
      (to_jsonb(NEW) - 'snapshotSealed' - 'updatedAt') = (to_jsonb(OLD) - 'snapshotSealed' - 'updatedAt')) THEN
      RAISE EXCEPTION 'Occurrence accepts lifecycle transitions only';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT OLD."snapshotSealed" OR NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Seal snapshot and advance session version before transition'; END IF;
  IF (OLD."status" = 'NOT_STARTED' AND NEW."status" NOT IN ('IN_PROGRESS','CANCELLED','SKIPPED')) OR
     (OLD."status" = 'IN_PROGRESS' AND NEW."status" NOT IN ('COMPLETED','PARTIAL','CANCELLED')) THEN
    RAISE EXCEPTION 'Invalid workout lifecycle transition';
  END IF;
  SELECT count(*) INTO completed_count FROM "SetPerformance" sp JOIN "SessionExercise" se ON se."id" = sp."sessionExerciseId" WHERE se."workoutSessionId" = NEW."id" AND sp."completionState" = 'COMPLETED';
  IF NEW."status" = 'IN_PROGRESS' THEN
    IF NEW."startedAt" IS NULL OR NEW."scheduledDate" > (now() AT TIME ZONE NEW."timezone")::date THEN RAISE EXCEPTION 'Workout not yet available'; END IF;
    PERFORM check_occurrence_snapshot(NEW."id");
  ELSIF NEW."status" IN ('COMPLETED','PARTIAL') THEN
    IF OLD."status" <> 'IN_PROGRESS' OR NEW."finishedAt" IS NULL THEN RAISE EXCEPTION 'Only started workouts can finish'; END IF;
    SELECT count(*) INTO required_count FROM "SetPerformance" sp JOIN "SessionExercise" se ON se."id" = sp."sessionExerciseId" WHERE se."workoutSessionId" = NEW."id";
    IF NEW."status" = 'COMPLETED' AND (completed_count <> required_count OR NEW."partialReason" IS NOT NULL) THEN RAISE EXCEPTION 'Completed workouts require every set'; END IF;
    IF NEW."status" = 'PARTIAL' AND (completed_count >= required_count OR NEW."partialReason" IS NULL) THEN RAISE EXCEPTION 'Partial workouts require missing sets and reason'; END IF;
  ELSIF NEW."status" = 'CANCELLED' THEN
    IF completed_count <> 0 OR NEW."cancelledAt" IS NULL OR NEW."cancellationReason" IS NULL OR NEW."cancelledByMembershipId" IS NULL THEN RAISE EXCEPTION 'Cannot cancel performed work'; END IF;
  ELSIF NEW."status" = 'SKIPPED' THEN
    IF OLD."status" <> 'NOT_STARTED' OR NEW."skippedAt" IS NULL OR NEW."skippedByMembershipId" IS NULL OR NEW."scheduledDate" >= (now() AT TIME ZONE NEW."timezone")::date THEN RAISE EXCEPTION 'Only past-due never-started workouts can be skipped'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_session_protected BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSession" FOR EACH ROW EXECUTE FUNCTION workout_session_guard();

CREATE FUNCTION require_sealed_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT "snapshotSealed" FROM "WorkoutSession" WHERE "id" = NEW."id") THEN RAISE EXCEPTION 'Occurrence snapshot must be sealed in the creating transaction'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER occurrence_sealed_before_commit AFTER INSERT ON "WorkoutSession" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_sealed_occurrence();

CREATE FUNCTION session_exercise_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_row "ProgrammedExercise"%ROWTYPE;
DECLARE session_row "WorkoutSession"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Scheduled prescription snapshots are immutable'; END IF;
  SELECT * INTO session_row FROM "WorkoutSession" WHERE "id" = NEW."workoutSessionId";
  SELECT * INTO source_row FROM "ProgrammedExercise" WHERE "id" = NEW."programmedExerciseId";
  IF session_row."id" IS NULL OR session_row."snapshotSealed" OR session_row."status" <> 'NOT_STARTED' OR
     source_row."workoutTemplateId" IS DISTINCT FROM session_row."workoutTemplateId" OR
     source_row."organizationId" IS DISTINCT FROM NEW."organizationId" OR source_row."exerciseId" IS DISTINCT FROM NEW."exerciseId" OR
     ROW(NEW."order", NEW."targetSets", NEW."targetRepsMin", NEW."targetRepsMax", NEW."intensityMode", NEW."targetRir", NEW."targetRpe", NEW."restSeconds", NEW."trainerNotes", NEW."suggestedLoadKg", NEW."exerciseNameSnapshot", NEW."primaryMuscleSnapshot", NEW."performanceModeSnapshot", NEW."loadEntryConventionSnapshot", NEW."loadMultiplierSnapshot", NEW."instructionsSnapshot", NEW."commonMistakesSnapshot", NEW."cautionNotesSnapshot") IS DISTINCT FROM
     ROW(source_row."order", source_row."targetSets", source_row."targetRepsMin", source_row."targetRepsMax", source_row."intensityMode", source_row."targetRir", source_row."targetRpe", source_row."restSeconds", source_row."trainerNotes", source_row."suggestedLoadKg", source_row."exerciseNameSnapshot", source_row."primaryMuscleSnapshot", source_row."performanceModeSnapshot", source_row."loadEntryConventionSnapshot", source_row."loadMultiplierSnapshot", source_row."instructionsSnapshot", source_row."commonMistakesSnapshot", source_row."cautionNotesSnapshot") THEN
    RAISE EXCEPTION 'Session snapshot must exactly copy its source prescription';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_exercise_snapshot_only BEFORE INSERT OR UPDATE OR DELETE ON "SessionExercise" FOR EACH ROW EXECUTE FUNCTION session_exercise_guard();

CREATE FUNCTION set_performance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_row "WorkoutSession"%ROWTYPE;
DECLARE source_row "SessionExercise"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Set history and positions are immutable'; END IF;
  SELECT se.* INTO source_row FROM "SessionExercise" se WHERE se."id" = NEW."sessionExerciseId";
  SELECT ws.* INTO session_row FROM "WorkoutSession" ws WHERE ws."id" = source_row."workoutSessionId" FOR UPDATE;
  IF session_row."id" IS NULL OR NEW."setNumber" NOT BETWEEN 1 AND source_row."targetSets" THEN RAISE EXCEPTION 'Set must belong to a prescribed position'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF session_row."status" <> 'NOT_STARTED' OR session_row."snapshotSealed" OR NEW."completionState" <> 'NOT_STARTED' OR NEW."version" <> 1 OR
       NEW."actualLoadKg" IS NOT NULL OR NEW."actualRepetitions" IS NOT NULL OR NEW."rir" IS NOT NULL OR NEW."rpe" IS NOT NULL THEN
      RAISE EXCEPTION 'Sets start empty during occurrence creation';
    END IF;
  ELSE
    IF session_row."status" <> 'IN_PROGRESS' OR
       ROW(NEW."id",NEW."organizationId",NEW."sessionExerciseId",NEW."setNumber",NEW."createdAt") IS DISTINCT FROM
       ROW(OLD."id",OLD."organizationId",OLD."sessionExerciseId",OLD."setNumber",OLD."createdAt") OR
       NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Only active set actuals may change'; END IF;
  END IF;
  IF (source_row."performanceModeSnapshot" = 'REPS_ONLY' AND NEW."actualLoadKg" IS NOT NULL) OR
     (source_row."intensityMode" <> 'RIR' AND NEW."rir" IS NOT NULL) OR
     (source_row."intensityMode" <> 'RPE' AND NEW."rpe" IS NOT NULL) OR
     (NEW."completionState" = 'COMPLETED' AND source_row."performanceModeSnapshot" = 'WEIGHT_REPS' AND NEW."actualLoadKg" IS NULL) THEN
    RAISE EXCEPTION 'Actual fields must match the snapshotted exercise mode';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER set_performance_active_only BEFORE INSERT OR UPDATE OR DELETE ON "SetPerformance" FOR EACH ROW EXECUTE FUNCTION set_performance_guard();

CREATE FUNCTION early_safety_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reason "PartialWorkoutReason";
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Early safety history is append-only'; END IF;
  SELECT "partialReason" INTO reason FROM "WorkoutSession" WHERE "id" = NEW."workoutSessionId" AND "status" = 'PARTIAL';
  IF (NEW."type" = 'DISCOMFORT_OR_PAIN' AND reason IS DISTINCT FROM 'DISCOMFORT_OR_PAIN') OR
     (NEW."type" = 'FEELING_UNWELL' AND reason IS DISTINCT FROM 'FEELING_UNWELL') THEN
    RAISE EXCEPTION 'Early safety event requires matching partial-finish reason';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER early_safety_event_append_only BEFORE INSERT OR UPDATE OR DELETE ON "SessionSafetyEvent" FOR EACH ROW EXECUTE FUNCTION early_safety_event_guard();
