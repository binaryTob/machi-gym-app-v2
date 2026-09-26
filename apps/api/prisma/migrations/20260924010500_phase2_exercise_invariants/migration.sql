CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "exercise_search_trgm" ON "Exercise" USING gin ("searchText" gin_trgm_ops);
CREATE UNIQUE INDEX "exercise_name_per_workspace_ci" ON "Exercise" ("organizationId", lower("name"));

ALTER TABLE "Exercise" ADD CONSTRAINT "exercise_valid_content" CHECK (
  length(trim("name")) BETWEEN 3 AND 120 AND
  length(trim("description")) BETWEEN 20 AND 1000 AND
  length(trim("instructions")) BETWEEN 20 AND 3000 AND
  length(trim("commonMistakes")) BETWEEN 10 AND 1500 AND
  "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND
  "version" > 0 AND "loadMultiplier" BETWEEN 0.1 AND 4 AND
  cardinality("equipment") BETWEEN 1 AND 6 AND
  cardinality("secondaryMuscleGroups") <= 6 AND
  NOT ("primaryMuscleGroup" = ANY("secondaryMuscleGroups")) AND
  (("performanceMode" = 'REPS_ONLY' AND "loadEntryConvention" IS NULL AND "loadMultiplier" = 1) OR
   ("performanceMode" = 'WEIGHT_REPS' AND "loadEntryConvention" IS NOT NULL))
);

ALTER TABLE "ExerciseMedia" ADD CONSTRAINT "media_approved_asset" CHECK (
  "url" IN (
    '/media/exercises/press.svg', '/media/exercises/pull.svg',
    '/media/exercises/squat.svg', '/media/exercises/hinge.svg',
    '/media/exercises/conditioning.svg', '/media/exercises/press-motion.svg'
  ) AND "source" = 'PROJECT_ORIGINAL' AND
  length(trim("licenseName")) >= 5 AND length(trim("attributionText")) >= 5 AND
  (("type" = 'ANIMATION' AND "url" LIKE '%-motion.svg') OR
   ("type" IN ('THUMBNAIL', 'IMAGE') AND "url" NOT LIKE '%-motion.svg')) AND
  (("licenseStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByMembershipId" IS NOT NULL) OR
   ("licenseStatus" <> 'VERIFIED' AND "verifiedAt" IS NULL AND "verifiedByMembershipId" IS NULL)) AND
  (NOT "active" OR "licenseStatus" = 'VERIFIED')
);
CREATE UNIQUE INDEX "one_active_exercise_thumbnail" ON "ExerciseMedia" ("exerciseId") WHERE "type" = 'THUMBNAIL' AND "active" = true;
