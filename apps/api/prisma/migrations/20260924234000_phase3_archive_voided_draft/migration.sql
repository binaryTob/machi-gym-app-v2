-- Allow archiving an unpublished plan only after its draft is explicitly voided.
-- Keep all the previously enforced identity, assignment, and published-version checks.
CREATE OR REPLACE FUNCTION plan_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Plan identities are archived, not deleted'; END IF;
  IF ROW(NEW."organizationId", NEW."createdByMembershipId") IS DISTINCT FROM ROW(OLD."organizationId", OLD."createdByMembershipId") THEN
    RAISE EXCEPTION 'Plan identity cannot be repointed';
  END IF;
  IF OLD."status" = 'ARCHIVED' THEN RAISE EXCEPTION 'Archived plans are immutable'; END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status" = 'DRAFT' AND NEW."status" IN ('ACTIVE', 'ARCHIVED')) OR
            (OLD."status" = 'ACTIVE' AND NEW."status" = 'ARCHIVED')) THEN
      RAISE EXCEPTION 'Invalid plan transition';
    END IF;
  END IF;
  IF NEW."status" = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "TrainingPlanVersion" WHERE "trainingPlanId" = NEW."id" AND "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'An active plan needs a published version';
  END IF;
  IF NEW."status" = 'ARCHIVED' AND (
    EXISTS (SELECT 1 FROM "StudentPlanAssignment" WHERE "trainingPlanId" = NEW."id" AND "active" = true) OR
    EXISTS (SELECT 1 FROM "TrainingPlanVersion" WHERE "trainingPlanId" = NEW."id" AND "status" IN ('ACTIVE', 'DRAFT'))
  ) THEN RAISE EXCEPTION 'Replace assignments and retire or void plan versions first'; END IF;
  RETURN NEW;
END $$;
