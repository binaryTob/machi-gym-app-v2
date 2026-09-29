import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createOccurrenceSnapshot } from '../src/workout-snapshot';

export async function seedDemoAnalytics(db: PrismaClient, organizationId: string, ownerMembershipId: string) {
  const studentId = `demo-student-${organizationId}`;
  const assignment = await db.studentPlanAssignment.findFirst({ where: { organizationId, studentId, active: true } });
  if (!assignment) return;
  const timezone = (await db.studentProfile.findUniqueOrThrow({ where: { id: studentId }, include: { organization: true } })).timezone ??
    (await db.organization.findUniqueOrThrow({ where: { id: organizationId } })).timezone;
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 12));
  const priorCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 12))));
  const rows = [
    { key: 'previous-complete', date: previous, type: 'COMPLETE' as const, load: 27.5, reps: 8, rpe: 7 },
    { key: 'current-complete', date: priorCurrent, type: 'COMPLETE' as const, load: 30, reps: 8, rpe: 6 },
    { key: 'current-partial', date: new Date(), type: 'PARTIAL' as const, load: 30, reps: 10, rpe: 8 },
    { key: 'previous-skipped', date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 14)), type: 'SKIPPED' as const, load: 0, reps: 0, rpe: 0 },
  ];
  const template = await db.workoutTemplate.findFirst({ where: { organizationId, trainingPlanVersionId: assignment.trainingPlanVersionId }, orderBy: { order: 'asc' } });
  if (!template) return;
  for (const [index, weightKg, date] of [
    [`analytics-weight-previous-${organizationId}`, '82.40', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5, 12))],
    [`analytics-weight-start-${organizationId}`, '81.70', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12))],
    [`analytics-weight-end-${organizationId}`, '80.80', new Date()],
  ] as const) {
    if (!(await db.bodyWeightMeasurement.findUnique({ where: { id: index } }))) await db.bodyWeightMeasurement.create({ data: { id: index, organizationId, studentId, recordedByMembershipId: ownerMembershipId, weightKg, measuredAt: date } });
  }
  for (const row of rows) {
    if (row.date < assignment.startDate || row.date > now) continue;
    const key = `demo-analytics-${row.key}-${organizationId}`;
    if (await db.workoutSession.findUnique({ where: { organizationId_scheduleRequestKey: { organizationId, scheduleRequestKey: key } } })) continue;
    const date = row.date.toISOString().slice(0, 10);
    const sameDay = date === now.toISOString().slice(0, 10);
    const startedAt = row.type === 'PARTIAL' || sameDay ? new Date(now.getTime() - 50 * 60_000) : new Date(`${date}T13:00:00Z`);
    const finishedAt = row.type === 'PARTIAL' ? new Date(now.getTime() - 25 * 60_000) : sameDay ? new Date(now.getTime() - 60_000) : new Date(`${date}T13:50:00Z`);
    await db.$transaction(async (tx) => {
      const session = await createOccurrenceSnapshot(tx, { organizationId, studentId, assignmentId: assignment.id, planVersionId: assignment.trainingPlanVersionId,
        workoutTemplateId: template.id, scheduledByMembershipId: ownerMembershipId, scheduleRequestKey: key,
        scheduledDate: new Date(`${date}T00:00:00Z`), timezone });
      if (row.type === 'SKIPPED') { await tx.workoutSession.update({ where: { id: session.id }, data: { status: 'SKIPPED', skippedByMembershipId: ownerMembershipId, skippedAt: new Date(), version: { increment: 1 } } }); return; }
      await tx.workoutSession.update({ where: { id: session.id }, data: { status: 'IN_PROGRESS', startedAt, version: { increment: 1 } } });
      const exercises = await tx.sessionExercise.findMany({ where: { workoutSessionId: session.id }, orderBy: { order: 'asc' }, include: { sets: true } });
      for (const exercise of exercises) for (const set of exercise.sets) {
        if (row.type === 'PARTIAL' && (exercise.order > 1 || set.setNumber > 1)) continue;
        await tx.setPerformance.update({ where: { id: set.id }, data: { completionState: 'COMPLETED', actualLoadKg: exercise.performanceModeSnapshot === 'WEIGHT_REPS' ? String(row.load) : null,
          actualRepetitions: row.reps, rir: exercise.intensityMode === 'RIR' ? 2 : null, completedAt: finishedAt, version: { increment: 1 } } });
      }
      await tx.workoutSession.update({ where: { id: session.id }, data: { status: row.type === 'PARTIAL' ? 'PARTIAL' : 'COMPLETED', finishedAt,
        partialReason: row.type === 'PARTIAL' ? 'LACK_OF_TIME' : null, version: { increment: 1 } } });
      const report = row.type === 'PARTIAL' ? [{ bodyRegion: 'RIGHT_KNEE' as const, intensity: 4, exerciseId: exercises[0]!.exerciseId }] : [];
      const fingerprint = createHash('sha256').update(`demo-analytics-${row.key}`).digest('hex');
      const fb = await tx.sessionFeedback.create({ data: { organizationId, studentId, workoutSessionId: session.id, sessionRpe: row.rpe,
        perceivedState: 'NORMAL', recoveryState: row.type === 'PARTIAL' ? 'TIRED' : 'RECOVERED', discomfortPresent: report.length > 0,
        requestHash: fingerprint, submittedAt: new Date(finishedAt.getTime() + 60_000) } });
      for (const item of report) {
        const event = await tx.sessionSafetyEvent.create({ data: { organizationId, workoutSessionId: session.id, sessionFeedbackId: fb.id,
          type: 'DISCOMFORT_OR_PAIN', source: 'SESSION_FEEDBACK', bodyRegion: item.bodyRegion, intensity: item.intensity, createdAt: finishedAt } });
        await tx.discomfortReport.create({ data: { organizationId, studentId, workoutSessionId: session.id, sessionFeedbackId: fb.id,
          safetyEventId: event.id, bodyRegion: item.bodyRegion, intensity: item.intensity, exerciseId: item.exerciseId, createdAt: finishedAt } });
      }
    });
  }
}
