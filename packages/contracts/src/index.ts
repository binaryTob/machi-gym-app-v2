import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(256),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().min(8).max(64).optional(),
}).strict();

export const studentCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
}).strict();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}, 'Invalid calendar date');
export const goalSchema = z.enum(['WEIGHT_LOSS', 'HYPERTROPHY', 'STRENGTH', 'BODY_RECOMPOSITION', 'GENERAL_FITNESS', 'SPORT_PERFORMANCE']);
export const weekdaySchema = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
export const activitySchema = z.enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE']);
export const experienceSchema = z.enum(['BEGINNER', 'NOVICE', 'INTERMEDIATE', 'ADVANCED']);
export const studentProfileSchema = z.object({
  version: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(120).optional(),
  birthDate: date.nullable().optional(),
  heightCm: z.number().min(50).max(280).nullable().optional(),
  trainingFrequencyPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  availableDays: z.array(weekdaySchema).max(7).optional(),
  approximateSessionMinutes: z.number().int().min(10).max(240).nullable().optional(),
  activityLevel: activitySchema.nullable().optional(),
  experienceLevel: experienceSchema.nullable().optional(),
  primaryGoal: goalSchema.nullable().optional(),
  timezone: z.string().max(80).nullable().optional(),
}).strict();
export const studentSelfProfileSchema = studentProfileSchema.pick({ version: true, displayName: true, birthDate: true, heightCm: true, availableDays: true, activityLevel: true, experienceLevel: true, primaryGoal: true, timezone: true });

export const acceptInvitationSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(256) }).strict();
export const resetPasswordSchema = acceptInvitationSchema;
export const emailSchema = z.object({ email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()) }).strict();
export const constraintSchema = z.object({ type: z.enum(['LIMITATION', 'DECLARED_INJURY', 'RECURRING_DISCOMFORT']), description: z.string().trim().min(1).max(500) }).strict();
export const activityCreateSchema = z.object({ name: z.string().trim().min(1).max(120), weeklyFrequency: z.number().int().min(0).max(14).nullable().optional() }).strict();
export const weightSchema = z.object({ weightKg: z.number().min(20).max(500), measuredAt: z.string().datetime({ offset: true }) }).strict();
export const readinessSchema = z.object({ version: z.number().int().positive() }).strict();
export const noteSchema = z.object({ content: z.string().trim().min(1).max(2000) }).strict();
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

export const muscleGroupSchema = z.enum(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'QUADRICEPS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'CORE', 'LOWER_BACK', 'FULL_BODY']);
export const equipmentSchema = z.enum(['BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'KETTLEBELL', 'RESISTANCE_BAND', 'SMITH_MACHINE', 'BENCH', 'PULL_UP_BAR', 'CARDIO_MACHINE', 'OTHER']);
export const movementPatternSchema = z.enum(['HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'SQUAT', 'HINGE', 'LUNGE', 'CARRY', 'ISOLATION', 'ROTATION', 'ANTI_ROTATION', 'FLEXION', 'EXTENSION', 'CONDITIONING']);
export const exerciseDifficultySchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
export const performanceModeSchema = z.enum(['WEIGHT_REPS', 'REPS_ONLY']);
export const loadEntryConventionSchema = z.enum(['TOTAL_EXTERNAL_LOAD', 'PER_IMPLEMENT', 'MACHINE_STACK']);
export const exerciseMediaTypeSchema = z.enum(['THUMBNAIL', 'IMAGE', 'ANIMATION', 'GIF', 'VIDEO']);

// All media is bundled and authored for this project in Phase 2. Any later
// upload workflow must go through a new verified asset registration boundary.
export const exerciseAssets = [
  '/media/exercises/press.svg', '/media/exercises/pull.svg',
  '/media/exercises/squat.svg', '/media/exercises/hinge.svg',
  '/media/exercises/conditioning.svg', '/media/exercises/press-motion.svg',
] as const;
export const exerciseAssetSchema = z.enum(exerciseAssets);

const exerciseFields = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  aliases: z.array(z.string().trim().min(2).max(80)).max(8).default([]),
  description: z.string().trim().min(20).max(1000),
  primaryMuscleGroup: muscleGroupSchema,
  secondaryMuscleGroups: z.array(muscleGroupSchema).max(6).default([]),
  equipment: z.array(equipmentSchema).min(1).max(6),
  movementPattern: movementPatternSchema,
  difficulty: exerciseDifficultySchema,
  performanceMode: performanceModeSchema,
  loadEntryConvention: loadEntryConventionSchema.nullable(),
  loadMultiplier: z.number().min(0.1).max(4).default(1),
  instructions: z.string().trim().min(20).max(3000),
  commonMistakes: z.string().trim().min(10).max(1500),
  cautionNotes: z.string().trim().max(1500).nullable().default(null),
});

function validExercise(value: z.infer<typeof exerciseFields>): boolean {
  return new Set(value.secondaryMuscleGroups).size === value.secondaryMuscleGroups.length
    && !value.secondaryMuscleGroups.includes(value.primaryMuscleGroup)
    && new Set(value.equipment).size === value.equipment.length
    && (value.performanceMode === 'REPS_ONLY' ? value.loadEntryConvention === null && value.loadMultiplier === 1 : value.loadEntryConvention !== null);
}
export const exerciseCreateSchema = exerciseFields.strict().refine(validExercise, 'Check muscles, equipment and load mode');
export const exerciseUpdateSchema = exerciseFields.partial().extend({ version: z.number().int().positive() }).strict();
export const exerciseStatusSchema = z.object({ version: z.number().int().positive(), active: z.boolean() }).strict();
export const exerciseListSchema = z.object({
  q: z.string().trim().max(80).optional(),
  muscle: muscleGroupSchema.optional(),
  equipment: equipmentSchema.optional(),
  pattern: movementPatternSchema.optional(),
  difficulty: exerciseDifficultySchema.optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();
export const exerciseMediaSchema = z.object({
  type: exerciseMediaTypeSchema,
  url: exerciseAssetSchema,
  source: z.literal('PROJECT_ORIGINAL'),
  licenseName: z.string().trim().min(5).max(120),
  attributionText: z.string().trim().min(5).max(250),
}).strict().refine(({ type, url }) => type === 'ANIMATION' ? url.endsWith('-motion.svg') : type === 'THUMBNAIL' || type === 'IMAGE' ? !url.endsWith('-motion.svg') : type === 'GIF' ? url.endsWith('.gif') : url.endsWith('.mp4') || url.endsWith('.webm'), 'Asset type and format do not match');
export type ExerciseCreateInput = z.infer<typeof exerciseCreateSchema>;
export function normalizeExerciseSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export const localDateSchema = date;
const optionalDescription = z.string().trim().max(1500).nullable().optional();
export const planCreateSchema = z.object({
  name: z.string().trim().min(3).max(120), description: optionalDescription, goal: goalSchema,
}).strict();
export const planListSchema = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(), cursor: z.string().min(1).max(128).optional() }).strict();
export const planEditSchema = planCreateSchema.partial().extend({ version: z.number().int().positive() }).strict();
export const planRevisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export const planArchiveSchema = z.object({ version: z.number().int().positive() }).strict();
export const planCloneSchema = z.object({ name: z.string().trim().min(3).max(120).optional() }).strict();
export const newPlanVersionSchema = z.object({ planVersion: z.number().int().positive(), sourceVersionId: z.string().min(1).max(128).optional() }).strict();
export const draftVersionEditSchema = z.object({ revision: z.number().int().positive(), title: z.string().trim().min(3).max(120).optional(), description: optionalDescription, goal: goalSchema.optional() }).strict();
export const voidPlanVersionSchema = planRevisionSchema.extend({ reason: z.string().trim().min(3).max(500) }).strict();

const workoutFields = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalDescription,
  expectedDurationMinutes: z.number().int().min(10).max(240).nullable().optional(),
  dayLabel: z.string().trim().min(1).max(60).nullable().optional(),
  trainerNotes: z.string().trim().max(1500).nullable().optional(),
});
export const workoutCreateSchema = workoutFields.extend({ revision: z.number().int().positive() }).strict();
export const workoutEditSchema = workoutFields.partial().extend({ revision: z.number().int().positive() }).strict();
export const reorderSchema = z.object({ revision: z.number().int().positive(), orderedIds: z.array(z.string().min(1).max(128)).min(1).max(50) }).strict();

const loadKg = z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/).refine((value) => Number(value) >= 0 && Number(value) <= 9999);
export const intensityModeSchema = z.enum(['NONE', 'RIR', 'RPE']);
export const programmedFields = z.object({
  exerciseId: z.string().min(1).max(128),
  targetSets: z.number().int().min(1).max(15),
  targetRepsMin: z.number().int().min(1).max(50),
  targetRepsMax: z.number().int().min(1).max(50),
  intensityMode: intensityModeSchema,
  targetRir: z.number().int().min(0).max(10).nullable().optional(),
  targetRpe: z.number().min(1).max(10).nullable().optional(),
  restSeconds: z.number().int().min(0).max(600),
  suggestedLoadKg: loadKg.nullable().optional(),
  trainerNotes: z.string().trim().max(1500).nullable().optional(),
});
function validatePrescription(value: z.infer<typeof programmedFields>, ctx: z.RefinementCtx): void {
  if (value.targetRepsMin > value.targetRepsMax) ctx.addIssue({ code: 'custom', path: ['targetRepsMax'], message: 'La repetición máxima debe ser mayor o igual a la mínima.' });
  if ((value.intensityMode === 'RIR' && (value.targetRir == null || value.targetRpe != null)) ||
      (value.intensityMode === 'RPE' && (value.targetRpe == null || value.targetRir != null)) ||
      (value.intensityMode === 'NONE' && (value.targetRir != null || value.targetRpe != null))) {
    ctx.addIssue({ code: 'custom', path: ['intensityMode'], message: 'Usá solo el objetivo que corresponde al modo de intensidad.' });
  }
}
export const programmedExerciseCreateSchema = programmedFields.extend({ revision: z.number().int().positive() }).strict().superRefine(validatePrescription);
export const programmedExerciseEditSchema = programmedFields.partial().extend({ revision: z.number().int().positive() }).strict();
export const assignmentSchema = z.object({ planId: z.string().min(1).max(128), startDate: localDateSchema, endDate: localDateSchema.nullable().optional() }).strict().refine((value) => !value.endDate || value.endDate >= value.startDate, { path: ['endDate'], message: 'La fecha final debe ser posterior a la inicial.' });
export type ProgrammedExerciseInput = z.infer<typeof programmedExerciseCreateSchema>;

export const workoutSessionStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'SKIPPED']);
export const setCompletionStateSchema = z.enum(['NOT_STARTED', 'COMPLETED']);
export const partialWorkoutReasonSchema = z.enum(['LACK_OF_TIME', 'FATIGUE', 'DISCOMFORT_OR_PAIN', 'FEELING_UNWELL', 'OTHER']);
export const cancellationReasonSchema = z.enum(['SCHEDULE_CHANGE', 'FEELING_UNWELL', 'OTHER']);
export const bodyRegionSchema = z.enum(['HEAD_NECK', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST_HAND', 'RIGHT_WRIST_HAND', 'CHEST', 'UPPER_BACK', 'LOWER_BACK', 'ABDOMEN', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_THIGH', 'RIGHT_THIGH', 'LEFT_QUADRICEPS', 'RIGHT_QUADRICEPS', 'LEFT_HAMSTRING', 'RIGHT_HAMSTRING', 'LEFT_CALF', 'RIGHT_CALF', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_LOWER_LEG', 'RIGHT_LOWER_LEG', 'LEFT_ANKLE_FOOT', 'RIGHT_ANKLE_FOOT', 'OTHER']);
export const scheduleWorkoutSchema = z.object({
  workoutTemplateId: z.string().min(1).max(128),
  scheduledDate: localDateSchema,
  requestKey: z.string().uuid(),
}).strict();
export const workoutSessionListSchema = z.object({ status: workoutSessionStatusSchema.optional(), cursor: z.string().min(1).max(128).optional() }).strict();
export const startWorkoutSchema = z.object({}).strict();
const actualKg = z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/).refine((value) => Number(value) <= 9999);
export const setPerformanceSchema = z.object({
  version: z.number().int().positive(),
  completionState: setCompletionStateSchema,
  actualLoadKg: actualKg.nullable(),
  actualRepetitions: z.number().int().min(1).max(1000).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
}).strict();
export const finishWorkoutSchema = z.object({
  version: z.number().int().positive(),
  partialReason: partialWorkoutReasonSchema.nullable().optional(),
  partialReasonDetail: z.string().trim().max(500).nullable().optional(),
  bodyRegion: bodyRegionSchema.nullable().optional(),
  intensity: z.number().int().min(1).max(10).nullable().optional(),
}).strict();
export const cancelWorkoutSchema = z.object({ version: z.number().int().positive(), reason: cancellationReasonSchema }).strict();
export const skipWorkoutSchema = z.object({ version: z.number().int().positive() }).strict();

export const perceivedStateSchema = z.enum(['VERY_GOOD', 'GOOD', 'NORMAL', 'DIFFICULT', 'VERY_DIFFICULT']);
export const recoveryStateSchema = z.enum(['VERY_RECOVERED', 'RECOVERED', 'NORMAL', 'TIRED', 'VERY_TIRED']);
export const discomfortReportSchema = z.object({
  bodyRegion: bodyRegionSchema,
  otherLocation: z.string().trim().min(1).max(100).nullable().default(null),
  intensity: z.number().int().min(1).max(10),
  exerciseId: z.string().min(1).max(128).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.bodyRegion !== 'OTHER' && value.otherLocation !== null) ctx.addIssue({ code: 'custom', path: ['otherLocation'], message: 'Solo podés describir otra ubicación cuando elegís “Otra”.' });
});
export const feedbackSubmitSchema = z.object({
  sessionRpe: z.number().int().min(1).max(10),
  perceivedState: perceivedStateSchema,
  recoveryState: recoveryStateSchema,
  discomfortPresent: z.boolean(),
  generalNotes: z.string().trim().max(1000).nullable().default(null),
  discomfortReports: z.array(discomfortReportSchema).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.discomfortPresent !== (value.discomfortReports.length > 0)) ctx.addIssue({ code: 'custom', path: ['discomfortReports'], message: 'Seleccioná por lo menos una zona cuando indicás una molestia.' });
  if (new Set(value.discomfortReports.map((report) => report.bodyRegion)).size !== value.discomfortReports.length) ctx.addIssue({ code: 'custom', path: ['discomfortReports'], message: 'Cada zona puede aparecer una sola vez por sesión.' });
});
export type FeedbackSubmission = z.infer<typeof feedbackSubmitSchema>;
