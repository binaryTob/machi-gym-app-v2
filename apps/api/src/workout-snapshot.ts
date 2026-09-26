import { Prisma, ProgrammedExercise } from '@prisma/client';

type SnapshotInput = {
  organizationId: string;
  studentId: string;
  assignmentId: string;
  planVersionId: string;
  workoutTemplateId: string;
  scheduledByMembershipId: string;
  scheduleRequestKey: string;
  scheduledDate: Date;
  timezone: string;
};

function publishedSnapshot(entry: ProgrammedExercise): boolean {
  return entry.exerciseVersionSnapshot !== null && entry.exerciseNameSnapshot !== null && entry.primaryMuscleSnapshot !== null &&
    entry.performanceModeSnapshot !== null && entry.loadMultiplierSnapshot !== null && entry.instructionsSnapshot !== null &&
    entry.commonMistakesSnapshot !== null;
}

// Called inside one transaction by scheduling and by the idempotent development
// seed. Published plan rows are immutable; the occurrence owns separate copies.
export async function createOccurrenceSnapshot(tx: Prisma.TransactionClient, input: SnapshotInput) {
  const entries = await tx.programmedExercise.findMany({ where: { workoutTemplateId: input.workoutTemplateId, organizationId: input.organizationId }, orderBy: { order: 'asc' } });
  if (!entries.length || entries.some((entry) => !publishedSnapshot(entry))) throw new Error('Cannot schedule an incomplete published prescription');
  const session = await tx.workoutSession.create({ data: {
    organizationId: input.organizationId, studentId: input.studentId, studentPlanAssignmentId: input.assignmentId,
    trainingPlanVersionId: input.planVersionId, workoutTemplateId: input.workoutTemplateId,
    scheduledByMembershipId: input.scheduledByMembershipId, scheduleRequestKey: input.scheduleRequestKey,
    scheduledDate: input.scheduledDate, timezone: input.timezone,
  } });
  for (const entry of entries) {
    const snapshot = await tx.sessionExercise.create({ data: {
      organizationId: input.organizationId, workoutSessionId: session.id, programmedExerciseId: entry.id,
      exerciseId: entry.exerciseId, order: entry.order, exerciseNameSnapshot: entry.exerciseNameSnapshot!,
      primaryMuscleSnapshot: entry.primaryMuscleSnapshot!, performanceModeSnapshot: entry.performanceModeSnapshot!,
      loadEntryConventionSnapshot: entry.loadEntryConventionSnapshot, loadMultiplierSnapshot: entry.loadMultiplierSnapshot!,
      instructionsSnapshot: entry.instructionsSnapshot!, commonMistakesSnapshot: entry.commonMistakesSnapshot!,
      cautionNotesSnapshot: entry.cautionNotesSnapshot, targetSets: entry.targetSets,
      targetRepsMin: entry.targetRepsMin, targetRepsMax: entry.targetRepsMax,
      intensityMode: entry.intensityMode, targetRir: entry.targetRir, targetRpe: entry.targetRpe,
      restSeconds: entry.restSeconds, trainerNotes: entry.trainerNotes, suggestedLoadKg: entry.suggestedLoadKg,
    } });
    await tx.setPerformance.createMany({ data: Array.from({ length: entry.targetSets }, (_, setNumber) => ({
      organizationId: input.organizationId, sessionExerciseId: snapshot.id, setNumber: setNumber + 1,
    })) });
  }
  await tx.workoutSession.update({ where: { id: session.id }, data: { snapshotSealed: true } });
  return session;
}
