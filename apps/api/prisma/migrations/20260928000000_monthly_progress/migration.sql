CREATE TABLE "MonthlyProgressSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "analyticsVersion" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    CONSTRAINT "MonthlyProgressSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_progress_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "monthly_progress_student_fk" FOREIGN KEY ("studentId", "organizationId") REFERENCES "StudentProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MonthlyProgressSnapshot_month_check" CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 9999 AND "analyticsVersion" > 0 AND "revision" > 0 AND "periodStart" < "periodEnd")
);
CREATE UNIQUE INDEX "monthly_progress_revision_key" ON "MonthlyProgressSnapshot"("organizationId", "studentId", "year", "month", "analyticsVersion", "revision");
CREATE UNIQUE INDEX "MonthlyProgressSnapshot_active_key" ON "MonthlyProgressSnapshot"("organizationId", "studentId", "year", "month", "analyticsVersion") WHERE "supersededAt" IS NULL;
CREATE INDEX "monthly_progress_month_idx" ON "MonthlyProgressSnapshot"("organizationId", "studentId", "year", "month");
CREATE INDEX "BodyWeightMeasurement_organizationId_studentId_measuredAt_idx" ON "BodyWeightMeasurement"("organizationId", "studentId", "measuredAt");

CREATE FUNCTION protect_monthly_progress_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Monthly progress snapshots cannot be deleted'; END IF;
  IF OLD."supersededAt" IS NOT NULL OR NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR NEW."studentId" IS DISTINCT FROM OLD."studentId" OR
     NEW."year" IS DISTINCT FROM OLD."year" OR NEW."month" IS DISTINCT FROM OLD."month" OR
     NEW."analyticsVersion" IS DISTINCT FROM OLD."analyticsVersion" OR NEW."revision" IS DISTINCT FROM OLD."revision" OR
     NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd" OR
     NEW."timezone" IS DISTINCT FROM OLD."timezone" OR NEW."metrics" IS DISTINCT FROM OLD."metrics" OR
     NEW."generatedAt" IS DISTINCT FROM OLD."generatedAt" OR NEW."correctionReason" IS DISTINCT FROM OLD."correctionReason" OR
     NEW."supersededAt" IS NULL THEN
    RAISE EXCEPTION 'Monthly progress snapshot is immutable except for supersession';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_monthly_progress_snapshot BEFORE UPDATE OR DELETE ON "MonthlyProgressSnapshot"
FOR EACH ROW EXECUTE FUNCTION protect_monthly_progress_snapshot();
