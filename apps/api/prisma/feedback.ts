import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createOccurrenceSnapshot } from '../src/workout-snapshot';

export async function seedDemoFeedback(db: PrismaClient, organizationId: string, ownerMembershipId: string): Promise<void> {
  const scheduleRequestKey = `demo-history-${organizationId}`;
  if (await db.workoutSession.findUnique({ where: { organizationId_scheduleRequestKey: { organizationId, scheduleRequestKey } } })) return;
  const assignment = await db.studentPlanAssignment.findFirst({ where: { organizationId, studentId: `demo-student-${organizationId}`, active: true } });
  if (!assignment) return;
  const template = await db.workoutTemplate.findFirst({ where: { organizationId, trainingPlanVersionId: assignment.trainingPlanVersionId }, orderBy: { order: 'asc' } });
  if (!template) return;
  const student = await db.studentProfile.findUniqueOrThrow({ where: { id: assignment.studentId } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const timezone = student.timezone ?? org.timezone;
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await db.$transaction(async (tx) => {
    const session = await createOccurrenceSnapshot(tx, { organizationId, studentId: student.id, assignmentId: assignment.id, planVersionId: assignment.trainingPlanVersionId,
      workoutTemplateId: template.id, scheduledByMembershipId: ownerMembershipId, scheduleRequestKey,
      scheduledDate: new Date(`${localDate}T00:00:00Z`), timezone });
    await tx.workoutSession.update({ where: { id: session.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), version: { increment: 1 } } });
    const exercises = await tx.sessionExercise.findMany({ where: { workoutSessionId: session.id }, orderBy: { order: 'asc' }, include: { sets: { orderBy: { setNumber: 'asc' } } } });
    for (const exercise of exercises) for (const set of exercise.sets) await tx.setPerformance.update({ where: { id: set.id }, data: {
      completionState: 'COMPLETED', actualLoadKg: exercise.performanceModeSnapshot === 'WEIGHT_REPS' ? '30.00' : null,
      actualRepetitions: 8, rir: exercise.intensityMode === 'RIR' ? 2 : null,
      rpe: exercise.intensityMode === 'RPE' ? 6 : null,
      completedAt: new Date(), version: { increment: 1 },
    } });
    await tx.workoutSession.update({ where: { id: session.id }, data: { status: 'COMPLETED', finishedAt: new Date(), version: { increment: 1 } } });
    const first = exercises[0];
    if (!first) throw new Error('Demo workout has no prescribed exercise');
    const report = { bodyRegion: 'RIGHT_KNEE' as const, otherLocation: null, intensity: 2, exerciseId: first.exerciseId, notes: 'Molestia leve declarada como ejemplo.' };
    const requestHash = createHash('sha256').update(JSON.stringify({ sessionRpe: 6, perceivedState: 'GOOD', recoveryState: 'NORMAL', discomfortPresent: true,
      generalNotes: 'Registro ficticio para desarrollo.', discomfortReports: [report] })).digest('hex');
    const feedback = await tx.sessionFeedback.create({ data: { id: `demo-feedback-${organizationId}`, organizationId, studentId: student.id, workoutSessionId: session.id,
      sessionRpe: 6, perceivedState: 'GOOD', recoveryState: 'NORMAL', discomfortPresent: true, generalNotes: 'Registro ficticio para desarrollo.', requestHash } });
    const event = await tx.sessionSafetyEvent.create({ data: { organizationId, workoutSessionId: session.id, sessionFeedbackId: feedback.id,
      source: 'SESSION_FEEDBACK', type: 'DISCOMFORT_OR_PAIN', bodyRegion: 'RIGHT_KNEE', intensity: 2, notes: report.notes } });
    await tx.discomfortReport.create({ data: { id: `demo-discomfort-${organizationId}`, organizationId, studentId: student.id, workoutSessionId: session.id,
      sessionFeedbackId: feedback.id, safetyEventId: event.id, ...report } });
  });
}
