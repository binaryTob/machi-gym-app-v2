import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { feedbackSubmitSchema, type FeedbackSubmission } from '@machi-gym/contracts';
import { WorkoutSessionStatus } from '@prisma/client';
import { Actor, AppRequest, Db, hashToken, input, requireId, Roles } from './common';
import { StudentService } from './students';
import { scopedWorkout } from './workout-query';

const hours24 = 24 * 60 * 60 * 1000;
export function feedbackWindow(status: WorkoutSessionStatus, finishedAt: Date | null, now = Date.now()) {
  const deadline = finishedAt ? new Date(finishedAt.getTime() + hours24) : null;
  const reason = !['COMPLETED', 'PARTIAL'].includes(status) || !finishedAt ? 'INVALID_STATUS' as const
    : !deadline || now > deadline.getTime() ? 'EXPIRED' as const : null;
  return { eligible: reason === null, reason, deadline };
}
function fingerprint(data: FeedbackSubmission): string {
  const sorted = [...data.discomfortReports].sort((left, right) => left.bodyRegion.localeCompare(right.bodyRegion));
  return hashToken(JSON.stringify({ sessionRpe: data.sessionRpe, perceivedState: data.perceivedState,
    recoveryState: data.recoveryState, discomfortPresent: data.discomfortPresent,
    generalNotes: data.generalNotes, discomfortReports: sorted }));
}
const feedbackSelect = {
  id: true, sessionRpe: true, perceivedState: true, recoveryState: true,
  discomfortPresent: true, generalNotes: true, submittedAt: true,
  discomfortReports: { orderBy: { bodyRegion: 'asc' as const }, select: { id: true, bodyRegion: true,
    otherLocation: true, intensity: true, exerciseId: true, notes: true, safetyEventId: true } },
} as const;

@Injectable()
export class FeedbackService {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService) {}
  private async ownedSession(id: string, actor: Actor) {
    const session = await this.db.workoutSession.findFirst({ where: { id: requireId(id), ...scopedWorkout(actor) },
      include: { safetyEvents: { where: { source: 'EARLY_FINISH' }, select: { id: true, type: true, bodyRegion: true, intensity: true, notes: true }, orderBy: { createdAt: 'asc' } },
        exercises: { orderBy: { order: 'asc' }, select: { exerciseId: true, exerciseNameSnapshot: true } } } });
    if (!session) throw new NotFoundException();
    return session;
  }
  private feedback(id: string) { return this.db.sessionFeedback.findUnique({ where: { workoutSessionId: id }, select: feedbackSelect }); }
  async state(id: string, actor: Actor) {
    const session = await this.ownedSession(id, actor);
    const feedback = await this.feedback(session.id);
    const window = feedbackWindow(session.status, session.finishedAt);
    return { eligible: !feedback && window.eligible, reason: feedback ? 'ALREADY_SUBMITTED' : window.reason,
      deadline: window.deadline, feedback, earlyEvents: session.safetyEvents, exercises: session.exercises };
  }
  async submit(id: string, raw: unknown, actor: Actor) {
    const values = input(feedbackSubmitSchema, raw);
    const requestHash = fingerprint(values);
    const source = await this.ownedSession(id, actor);
    if (source.studentId !== actor.studentId) throw new NotFoundException();
    const existing = await this.db.sessionFeedback.findUnique({ where: { workoutSessionId: id }, select: { requestHash: true } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException('Feedback is already locked');
      return this.feedback(id);
    }
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WorkoutSession" WHERE "id" = ${id} AND "organizationId" = ${actor.organizationId} AND "studentId" = ${actor.studentId!} FOR UPDATE`;
      const session = await tx.workoutSession.findFirst({ where: { id, organizationId: actor.organizationId, studentId: actor.studentId ?? '__none__' } });
      if (!session) throw new NotFoundException();
      const prior = await tx.sessionFeedback.findUnique({ where: { workoutSessionId: id } });
      if (prior) {
        if (prior.requestHash !== requestHash) throw new ConflictException('Feedback is already locked');
        return;
      }
      const window = feedbackWindow(session.status, session.finishedAt);
      if (!window.eligible) throw new ConflictException(window.reason === 'EXPIRED' ? 'Feedback window expired' : 'Feedback is available only after a completed or partial workout');
      const early = await tx.sessionSafetyEvent.findFirst({ where: { workoutSessionId: id, organizationId: actor.organizationId, source: 'EARLY_FINISH', type: 'DISCOMFORT_OR_PAIN' } });
      if (early && !values.discomfortPresent) throw new BadRequestException('Discomfort was already reported when the workout ended');
      if (early?.bodyRegion && !values.discomfortReports.some((report) => report.bodyRegion === early.bodyRegion)) throw new BadRequestException('Keep the discomfort location reported when ending the workout');
      const snapshotIds = new Set((await tx.sessionExercise.findMany({ where: { workoutSessionId: id, organizationId: actor.organizationId }, select: { exerciseId: true } })).map((exercise) => exercise.exerciseId));
      if (values.discomfortReports.some((report) => report.exerciseId && !snapshotIds.has(report.exerciseId))) throw new BadRequestException('Discomfort exercise must belong to this workout');
      const feedback = await tx.sessionFeedback.create({ data: { organizationId: actor.organizationId, studentId: actor.studentId!, workoutSessionId: id,
        sessionRpe: values.sessionRpe, perceivedState: values.perceivedState, recoveryState: values.recoveryState,
        discomfortPresent: values.discomfortPresent, generalNotes: values.generalNotes, requestHash } });
      const reports = [...values.discomfortReports].sort((left, right) => left.bodyRegion.localeCompare(right.bodyRegion));
      let reusedEarly = false;
      for (const report of reports) {
        const shouldReuse = Boolean(early && !reusedEarly && (early.bodyRegion === null || early.bodyRegion === report.bodyRegion));
        const safetyId = shouldReuse ? early!.id : (await tx.sessionSafetyEvent.create({ data: {
          organizationId: actor.organizationId, workoutSessionId: id, sessionFeedbackId: feedback.id,
          source: 'SESSION_FEEDBACK', type: 'DISCOMFORT_OR_PAIN', bodyRegion: report.bodyRegion,
          intensity: report.intensity, notes: report.notes,
        } })).id;
        if (shouldReuse) reusedEarly = true;
        await tx.discomfortReport.create({ data: { organizationId: actor.organizationId, studentId: actor.studentId!,
          workoutSessionId: id, sessionFeedbackId: feedback.id, safetyEventId: safetyId,
          bodyRegion: report.bodyRegion, otherLocation: report.otherLocation,
          intensity: report.intensity, exerciseId: report.exerciseId, notes: report.notes } });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action: 'FEEDBACK_SUBMITTED', resourceType: 'WorkoutSession', resourceId: id } });
    });
    return this.feedback(id);
  }

  async signals(studentId: string, actor: Actor) {
    await this.students.ensure(studentId, actor);
    const since = new Date(Date.now() - 28 * 86_400_000);
    const [latestFeedback, latestEvent, events] = await Promise.all([
      this.db.sessionFeedback.findFirst({ where: { organizationId: actor.organizationId, studentId }, orderBy: { submittedAt: 'desc' }, select: { sessionRpe: true, perceivedState: true, recoveryState: true, submittedAt: true, workoutSessionId: true } }),
      this.db.sessionSafetyEvent.findFirst({ where: { organizationId: actor.organizationId, type: 'DISCOMFORT_OR_PAIN', workoutSession: { studentId } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, bodyRegion: true, intensity: true, workoutSessionId: true, discomfortReport: { select: { bodyRegion: true, intensity: true } } } }),
      this.db.sessionSafetyEvent.findMany({ where: { organizationId: actor.organizationId, type: 'DISCOMFORT_OR_PAIN', createdAt: { gte: since }, workoutSession: { studentId } }, distinct: ['workoutSessionId'], select: { workoutSessionId: true } }),
    ]);
    return { latestFeedback, latestDiscomfort: latestEvent ? { reportedAt: latestEvent.createdAt, workoutSessionId: latestEvent.workoutSessionId, bodyRegion: latestEvent.discomfortReport?.bodyRegion ?? latestEvent.bodyRegion, intensity: latestEvent.discomfortReport?.intensity ?? latestEvent.intensity } : null,
      sessionsWithDiscomfort28Days: events.length, periodDays: 28 };
  }
}

@Controller()
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}
  @Get('workout-sessions/:id/feedback') @Roles('STUDENT', 'TRAINER', 'ADMIN') state(@Param('id') id: string, @Req() req: AppRequest) { return this.feedback.state(id, req.actor!); }
  @Post('workout-sessions/:id/feedback') @Roles('STUDENT') submit(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.feedback.submit(id, body, req.actor!); }
  @Get('students/:id/feedback-signals') @Roles('TRAINER', 'ADMIN') signals(@Param('id') id: string, @Req() req: AppRequest) { return this.feedback.signals(id, req.actor!); }
}
