import { PrismaClient } from '@prisma/client';
import { createOccurrenceSnapshot } from '../src/workout-snapshot';

export async function seedDemoOccurrence(db: PrismaClient, organizationId: string, ownerMembershipId: string): Promise<void> {
  const scheduleRequestKey = `demo-workout-${organizationId}`;
  if (await db.workoutSession.findUnique({ where: { organizationId_scheduleRequestKey: { organizationId, scheduleRequestKey } } })) return;
  const assignment = await db.studentPlanAssignment.findFirst({ where: { organizationId, studentId: `demo-student-${organizationId}`, active: true } });
  if (!assignment) return; // The trainer may have ended or replaced the demo assignment.
  const template = await db.workoutTemplate.findFirst({ where: { organizationId, trainingPlanVersionId: assignment.trainingPlanVersionId }, orderBy: { order: 'asc' } });
  if (!template) return;
  const student = await db.studentProfile.findUniqueOrThrow({ where: { id: assignment.studentId } });
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  await db.$transaction((tx) => createOccurrenceSnapshot(tx, {
    organizationId, studentId: assignment.studentId, assignmentId: assignment.id,
    planVersionId: assignment.trainingPlanVersionId, workoutTemplateId: template.id,
    scheduledByMembershipId: ownerMembershipId, scheduleRequestKey,
    scheduledDate: new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: student.timezone ?? organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}T00:00:00Z`),
    timezone: student.timezone ?? organization.timezone,
  }));
}
