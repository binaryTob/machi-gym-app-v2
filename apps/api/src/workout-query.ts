import { NotFoundException } from '@nestjs/common';
import { Prisma, WorkoutSessionStatus } from '@prisma/client';
import { Actor, Db, requireId } from './common';

type PreviousRow = { exerciseId: string; sessionExerciseId: string; sessionId: string; finishedAt: Date };

export function scopedWorkout(actor: Actor): Prisma.WorkoutSessionWhereInput {
  return { organizationId: actor.organizationId,
    ...(actor.role === 'STUDENT' ? { studentId: actor.studentId ?? '__none__' } : {}),
    ...(actor.role === 'TRAINER' ? { student: { assignments: { some: { trainerId: actor.trainerId ?? '__none__', active: true } } } } : {}),
  };
}

export async function previousByExercise(db: Db, studentId: string, organizationId: string, cutoff: Date, exerciseIds: string[]) {
  if (!exerciseIds.length) return new Map<string, { sessionId: string; finishedAt: Date; sets: { setNumber: number; actualLoadKg: Prisma.Decimal | null; actualRepetitions: number | null; rir: number | null; rpe: Prisma.Decimal | null }[] }>();
  const latest = await db.$queryRaw<PreviousRow[]>(Prisma.sql`
    SELECT DISTINCT ON (se."exerciseId") se."exerciseId", se."id" AS "sessionExerciseId", ws."id" AS "sessionId", ws."finishedAt"
    FROM "WorkoutSession" ws JOIN "SessionExercise" se ON se."workoutSessionId" = ws."id"
    WHERE ws."studentId" = ${studentId} AND ws."organizationId" = ${organizationId}
      AND ws."status" IN ('COMPLETED'::"WorkoutSessionStatus", 'PARTIAL'::"WorkoutSessionStatus")
      AND ws."finishedAt" < ${cutoff} AND se."exerciseId" IN (${Prisma.join(exerciseIds)})
      AND EXISTS (SELECT 1 FROM "SetPerformance" sp WHERE sp."sessionExerciseId" = se."id" AND sp."completionState" = 'COMPLETED'::"SetCompletionState")
    ORDER BY se."exerciseId", ws."finishedAt" DESC, ws."id" DESC
  `);
  const rows = await db.setPerformance.findMany({ where: { sessionExerciseId: { in: latest.map((row) => row.sessionExerciseId) }, completionState: 'COMPLETED' }, orderBy: { setNumber: 'asc' }, select: { sessionExerciseId: true, setNumber: true, actualLoadKg: true, actualRepetitions: true, rir: true, rpe: true } });
  return new Map(latest.map((row) => [row.exerciseId, { sessionId: row.sessionId, finishedAt: row.finishedAt, sets: rows.filter((set) => set.sessionExerciseId === row.sessionExerciseId).map(({ sessionExerciseId: _id, ...set }) => { void _id; return set; }) }]));
}

export async function workoutDetail(db: Db, id: string, actor: Actor) {
  const session = await db.workoutSession.findFirst({ where: { id: requireId(id), ...scopedWorkout(actor) }, include: {
    workoutTemplate: { select: { name: true, dayLabel: true, expectedDurationMinutes: true } },
    planVersion: { select: { title: true, goal: true } },
    exercises: { orderBy: { order: 'asc' }, include: {
      sets: { orderBy: { setNumber: 'asc' } },
      exercise: { select: { media: { where: { active: true, licenseStatus: 'VERIFIED' }, select: { id: true, type: true, url: true, attributionText: true }, orderBy: { createdAt: 'asc' } } } },
    } },
    safetyEvents: { orderBy: { createdAt: 'asc' } },
  } });
  if (!session) throw new NotFoundException();
  const previous = session.startedAt ? await previousByExercise(db, session.studentId, session.organizationId, session.startedAt, session.exercises.map((entry) => entry.exerciseId)) : new Map();
  const totalSets = session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const completedSets = session.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completionState === 'COMPLETED').length, 0);
  const completedExercises = session.exercises.filter((exercise) => exercise.sets.every((set) => set.completionState === 'COMPLETED')).length;
  return {
    id: session.id, studentId: session.studentId, status: session.status, scheduledDate: session.scheduledDate,
    timezone: session.timezone, version: session.version, startedAt: session.startedAt, finishedAt: session.finishedAt,
    cancelledAt: session.cancelledAt, skippedAt: session.skippedAt, partialReason: session.partialReason,
    partialReasonDetail: session.partialReasonDetail, cancellationReason: session.cancellationReason,
    workout: { name: session.workoutTemplate.name, dayLabel: session.workoutTemplate.dayLabel, expectedDurationMinutes: session.workoutTemplate.expectedDurationMinutes, planTitle: session.planVersion.title },
    progress: { totalSets, completedSets, totalExercises: session.exercises.length, completedExercises },
    exercises: session.exercises.map((snapshot) => ({
      id: snapshot.id, exerciseId: snapshot.exerciseId, order: snapshot.order,
      exerciseNameSnapshot: snapshot.exerciseNameSnapshot, primaryMuscleSnapshot: snapshot.primaryMuscleSnapshot,
      performanceModeSnapshot: snapshot.performanceModeSnapshot,
      loadEntryConventionSnapshot: snapshot.loadEntryConventionSnapshot, loadMultiplierSnapshot: snapshot.loadMultiplierSnapshot,
      instructionsSnapshot: snapshot.instructionsSnapshot, commonMistakesSnapshot: snapshot.commonMistakesSnapshot,
      cautionNotesSnapshot: snapshot.cautionNotesSnapshot, targetSets: snapshot.targetSets,
      targetRepsMin: snapshot.targetRepsMin, targetRepsMax: snapshot.targetRepsMax,
      intensityMode: snapshot.intensityMode, targetRir: snapshot.targetRir, targetRpe: snapshot.targetRpe,
      restSeconds: snapshot.restSeconds, trainerNotes: snapshot.trainerNotes, suggestedLoadKg: snapshot.suggestedLoadKg,
      media: snapshot.exercise.media,
      sets: snapshot.sets.map((set) => ({ id: set.id, setNumber: set.setNumber, completionState: set.completionState,
        actualLoadKg: set.actualLoadKg, actualRepetitions: set.actualRepetitions, rir: set.rir, rpe: set.rpe,
        completedAt: set.completedAt, version: set.version, createdAt: set.createdAt, updatedAt: set.updatedAt })),
      previous: previous.get(snapshot.exerciseId) ?? null,
    })),
    safetyEvents: session.safetyEvents,
  };
}

export async function workoutList(db: Db, actor: Actor, filters: { status?: WorkoutSessionStatus; cursor?: string }, studentId?: string) {
  const where: Prisma.WorkoutSessionWhereInput = { ...scopedWorkout(actor), ...(studentId ? { studentId } : {}), ...(filters.status ? { status: filters.status } : {}) };
  if (filters.cursor && !(await db.workoutSession.findFirst({ where: { id: filters.cursor, ...scopedWorkout(actor), ...(studentId ? { studentId } : {}) }, select: { id: true } }))) throw new NotFoundException();
  const rows = await db.workoutSession.findMany({ where, orderBy: [{ scheduledDate: 'desc' }, { id: 'desc' }], take: 26, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), select: { id: true, status: true, scheduledDate: true, timezone: true, startedAt: true, finishedAt: true, partialReason: true, workoutTemplate: { select: { name: true, expectedDurationMinutes: true } } } });
  return { items: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24]?.id ?? null : null };
}
