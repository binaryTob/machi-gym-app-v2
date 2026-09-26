ALTER TABLE "SessionFeedback" ADD CONSTRAINT "feedback_values_valid" CHECK (
  "sessionRpe" BETWEEN 1 AND 10 AND length("requestHash") = 64 AND
  ("generalNotes" IS NULL OR length("generalNotes") <= 1000)
);
ALTER TABLE "DiscomfortReport" ADD CONSTRAINT "discomfort_values_valid" CHECK (
  "intensity" BETWEEN 1 AND 10 AND
  ("notes" IS NULL OR length("notes") <= 500) AND
  ("otherLocation" IS NULL OR (length(trim("otherLocation")) BETWEEN 1 AND 100 AND "bodyRegion" = 'OTHER'))
);

CREATE FUNCTION immutable_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Submitted feedback and discomfort history are immutable';
END $$;
CREATE TRIGGER feedback_immutable BEFORE UPDATE OR DELETE ON "SessionFeedback" FOR EACH ROW EXECUTE FUNCTION immutable_feedback();
CREATE TRIGGER discomfort_immutable BEFORE UPDATE OR DELETE ON "DiscomfortReport" FOR EACH ROW EXECUTE FUNCTION immutable_feedback();

CREATE FUNCTION feedback_eligibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_session "WorkoutSession"%ROWTYPE;
BEGIN
  SELECT * INTO source_session FROM "WorkoutSession" WHERE "id" = NEW."workoutSessionId";
  IF source_session."id" IS NULL OR source_session."organizationId" IS DISTINCT FROM NEW."organizationId" OR
     source_session."studentId" IS DISTINCT FROM NEW."studentId" OR
     source_session."status" NOT IN ('COMPLETED', 'PARTIAL') OR
     source_session."finishedAt" IS NULL OR
     NEW."submittedAt" < source_session."finishedAt" OR
     NEW."submittedAt" > source_session."finishedAt" + interval '24 hours' THEN
    RAISE EXCEPTION 'Feedback requires an owned finalized workout within 24 hours';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_eligible_only BEFORE INSERT ON "SessionFeedback" FOR EACH ROW EXECUTE FUNCTION feedback_eligibility_guard();

CREATE FUNCTION feedback_complete_before_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE report_count integer;
DECLARE early_event_id text;
BEGIN
  SELECT count(*) INTO report_count FROM "DiscomfortReport" WHERE "sessionFeedbackId" = NEW."id";
  IF (NEW."discomfortPresent" AND report_count = 0) OR (NOT NEW."discomfortPresent" AND report_count > 0) THEN
    RAISE EXCEPTION 'Feedback discomfort flag must match its structured reports';
  END IF;
  SELECT "id" INTO early_event_id FROM "SessionSafetyEvent"
    WHERE "workoutSessionId" = NEW."workoutSessionId" AND "source" = 'EARLY_FINISH' AND "type" = 'DISCOMFORT_OR_PAIN';
  IF early_event_id IS NOT NULL AND (
    NOT NEW."discomfortPresent" OR NOT EXISTS (
      SELECT 1 FROM "DiscomfortReport" WHERE "sessionFeedbackId" = NEW."id" AND "safetyEventId" = early_event_id
    )
  ) THEN RAISE EXCEPTION 'Feedback must reuse the canonical early discomfort event'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER feedback_complete_after_insert AFTER INSERT ON "SessionFeedback" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION feedback_complete_before_commit();

CREATE OR REPLACE FUNCTION early_safety_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_session "WorkoutSession"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Safety history is append-only'; END IF;
  SELECT * INTO source_session FROM "WorkoutSession" WHERE "id" = NEW."workoutSessionId";
  IF NEW."source" = 'EARLY_FINISH' THEN
    IF NEW."sessionFeedbackId" IS NOT NULL OR source_session."status" <> 'PARTIAL' OR
       (NEW."type" = 'DISCOMFORT_OR_PAIN' AND source_session."partialReason" IS DISTINCT FROM 'DISCOMFORT_OR_PAIN') OR
       (NEW."type" = 'FEELING_UNWELL' AND source_session."partialReason" IS DISTINCT FROM 'FEELING_UNWELL') THEN
      RAISE EXCEPTION 'Early event must match the partial-finish reason';
    END IF;
  ELSIF NEW."source" = 'SESSION_FEEDBACK' THEN
    IF NEW."type" <> 'DISCOMFORT_OR_PAIN' OR NEW."sessionFeedbackId" IS NULL OR
       source_session."status" NOT IN ('COMPLETED', 'PARTIAL') OR
       NOT EXISTS (SELECT 1 FROM "SessionFeedback" WHERE "id" = NEW."sessionFeedbackId" AND "workoutSessionId" = NEW."workoutSessionId" AND "organizationId" = NEW."organizationId") THEN
      RAISE EXCEPTION 'Feedback safety events need a matching submitted feedback record';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION discomfort_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_event "SessionSafetyEvent"%ROWTYPE;
BEGIN
  SELECT * INTO source_event FROM "SessionSafetyEvent" WHERE "id" = NEW."safetyEventId";
  IF source_event."id" IS NULL OR source_event."type" <> 'DISCOMFORT_OR_PAIN' OR
     source_event."workoutSessionId" IS DISTINCT FROM NEW."workoutSessionId" OR
     source_event."organizationId" IS DISTINCT FROM NEW."organizationId" OR
     (source_event."source" = 'EARLY_FINISH' AND source_event."bodyRegion" IS NOT NULL AND source_event."bodyRegion" IS DISTINCT FROM NEW."bodyRegion") OR
     (source_event."source" = 'SESSION_FEEDBACK' AND (source_event."sessionFeedbackId" IS DISTINCT FROM NEW."sessionFeedbackId" OR source_event."bodyRegion" IS DISTINCT FROM NEW."bodyRegion")) THEN
    RAISE EXCEPTION 'Discomfort detail must reference its canonical session event';
  END IF;
  IF NEW."exerciseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "SessionExercise" WHERE "workoutSessionId" = NEW."workoutSessionId"
      AND "organizationId" = NEW."organizationId" AND "exerciseId" = NEW."exerciseId"
  ) THEN RAISE EXCEPTION 'Discomfort exercise must appear in this exact workout'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discomfort_session_exercise_only BEFORE INSERT ON "DiscomfortReport" FOR EACH ROW EXECUTE FUNCTION discomfort_report_guard();

CREATE FUNCTION feedback_event_has_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."source" = 'SESSION_FEEDBACK' AND NOT EXISTS (
    SELECT 1 FROM "DiscomfortReport" WHERE "safetyEventId" = NEW."id" AND "sessionFeedbackId" = NEW."sessionFeedbackId"
  ) THEN RAISE EXCEPTION 'Feedback safety events require one structured discomfort report'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER feedback_event_has_detail AFTER INSERT ON "SessionSafetyEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION feedback_event_has_report();
