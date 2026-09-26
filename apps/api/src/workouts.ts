import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cancelWorkoutSchema, finishWorkoutSchema, scheduleWorkoutSchema, setPerformanceSchema, skipWorkoutSchema, startWorkoutSchema, workoutSessionListSchema } from '@machi-gym/contracts';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';
import { StudentService } from './students';
import { localToday } from './assignments';
import { createOccurrenceSnapshot } from './workout-snapshot';
import { scopedWorkout, workoutDetail, workoutList } from './workout-query';

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
function availabilityWarning(scheduledDate: string, availableDays: string[]): boolean {
  if (!availableDays.length) return false;
  const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][asDate(scheduledDate).getUTCDay()];
  return weekday ? !availableDays.includes(weekday) : false;
}
type SetInput = ReturnType<typeof setPerformanceSchema.parse>;
function sameActual(row: { completionState: string; actualLoadKg: Prisma.Decimal | null; actualRepetitions: number | null; rir: number | null; rpe: Prisma.Decimal | null }, body: SetInput): boolean {
  return row.completionState === body.completionState &&
    (row.actualLoadKg === null ? body.actualLoadKg === null : body.actualLoadKg !== null && row.actualLoadKg.equals(body.actualLoadKg)) &&
    row.actualRepetitions === body.actualRepetitions && row.rir === body.rir &&
    (row.rpe === null ? body.rpe === null : body.rpe !== null && row.rpe.equals(body.rpe));
}

@Injectable()
export class WorkoutService {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService) {}
  private async ownedSession(id: string, actor: Actor) {
    const session = await this.db.workoutSession.findFirst({ where: { id: requireId(id), ...scopedWorkout(actor) } });
    if (!session) throw new NotFoundException();
    return session;
  }
  private async lock(tx: Prisma.TransactionClient, id: string, actor: Actor) {
    await tx.$queryRaw`SELECT "id" FROM "WorkoutSession" WHERE "id" = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
    const session = await tx.workoutSession.findFirst({ where: { id, organizationId: actor.organizationId, ...(actor.role === 'STUDENT' ? { studentId: actor.studentId ?? '__none__' } : {}), ...(actor.role === 'TRAINER' ? { student: { assignments: { some: { trainerId: actor.trainerId ?? '__none__', active: true } } } } : {}) } });
    if (!session) throw new NotFoundException();
    return session;
  }
  detail(id: string, actor: Actor) { return workoutDetail(this.db, id, actor); }
  async listOwn(raw: unknown, actor: Actor) { return workoutList(this.db, actor, input(workoutSessionListSchema, raw)); }
  async listStudent(studentId: string, raw: unknown, actor: Actor) { await this.students.ensure(studentId, actor); return workoutList(this.db, actor, input(workoutSessionListSchema, raw), studentId); }

  async schedule(studentId: string, raw: unknown, actor: Actor) {
    const fields = input(scheduleWorkoutSchema, raw);
    await this.students.ensure(studentId, actor);
    const profile = await this.db.studentProfile.findFirst({ where: { id: studentId, organizationId: actor.organizationId }, include: { organization: { select: { timezone: true } } } });
    if (!profile) throw new NotFoundException();
    const timezone = profile.timezone ?? profile.organization.timezone;
    const sameKey = async () => this.db.workoutSession.findUnique({ where: { organizationId_scheduleRequestKey: { organizationId: actor.organizationId, scheduleRequestKey: fields.requestKey } } });
    const replay = await sameKey();
    if (replay) {
      if (replay.studentId !== studentId || replay.workoutTemplateId !== fields.workoutTemplateId || replay.scheduledDate.toISOString().slice(0, 10) !== fields.scheduledDate) throw new ConflictException('Schedule key already used for a different workout');
      return { ...(await this.detail(replay.id, actor)), availabilityWarning: availabilityWarning(fields.scheduledDate, profile.availableDays) };
    }
    try {
      const created = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "StudentProfile" WHERE "id" = ${studentId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
        const existing = await tx.workoutSession.findUnique({ where: { organizationId_scheduleRequestKey: { organizationId: actor.organizationId, scheduleRequestKey: fields.requestKey } } });
        if (existing) {
          if (existing.studentId !== studentId || existing.workoutTemplateId !== fields.workoutTemplateId || existing.scheduledDate.toISOString().slice(0, 10) !== fields.scheduledDate) throw new ConflictException('Schedule key already used for a different workout');
          return existing;
        }
        const assignment = await tx.studentPlanAssignment.findFirst({ where: { studentId, organizationId: actor.organizationId, active: true } });
        if (!assignment) throw new ConflictException('Student has no active plan assignment');
        const template = await tx.workoutTemplate.findFirst({ where: { id: fields.workoutTemplateId, organizationId: actor.organizationId, trainingPlanVersionId: assignment.trainingPlanVersionId } });
        if (!template) throw new NotFoundException('Workout is not in the current assigned version');
        const when = asDate(fields.scheduledDate);
        if (when < assignment.startDate || (assignment.endDate && when > assignment.endDate)) throw new BadRequestException('Scheduled date must be within the assignment period');
        const session = await createOccurrenceSnapshot(tx, { organizationId: actor.organizationId, studentId, assignmentId: assignment.id, planVersionId: assignment.trainingPlanVersionId, workoutTemplateId: template.id, scheduledByMembershipId: actor.membershipId, scheduleRequestKey: fields.requestKey, scheduledDate: when, timezone });
        await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, resourceType: 'WorkoutSession', resourceId: session.id, action: 'WORKOUT_SCHEDULED' } });
        return session;
      });
      return { ...(await this.detail(created.id, actor)), availabilityWarning: availabilityWarning(fields.scheduledDate, profile.availableDays) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await sameKey();
        if (existing?.studentId === studentId && existing.workoutTemplateId === fields.workoutTemplateId && existing.scheduledDate.toISOString().slice(0, 10) === fields.scheduledDate) return { ...(await this.detail(existing.id, actor)), availabilityWarning: availabilityWarning(fields.scheduledDate, profile.availableDays) };
        throw new ConflictException('Schedule key already used');
      }
      throw error;
    }
  }

  async start(id: string, raw: unknown, actor: Actor) {
    input(startWorkoutSchema, raw);
    try { await this.db.$transaction(async (tx) => {
      const session = await this.lock(tx, id, actor);
      if (session.status === 'IN_PROGRESS') return;
      if (session.status !== 'NOT_STARTED' || !session.snapshotSealed) throw new ConflictException('Workout cannot be started');
      if (session.scheduledDate.toISOString().slice(0, 10) > localToday(session.timezone)) throw new ConflictException('Workout is not available yet');
      if (await tx.workoutSession.findFirst({ where: { organizationId: actor.organizationId, studentId: session.studentId, status: 'IN_PROGRESS' }, select: { id: true } })) throw new ConflictException('Resume your active workout first');
      await tx.workoutSession.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), version: { increment: 1 } } });
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Resume the other active workout first');
      throw error;
    }
    return this.detail(id, actor);
  }

  async set(id: string, setId: string, raw: unknown, actor: Actor) {
    const body = input(setPerformanceSchema, raw);
    const result = await this.db.$transaction(async (tx) => {
      const session = await this.lock(tx, id, actor);
      if (session.status !== 'IN_PROGRESS') throw new ConflictException('Only active workouts accept performed sets');
      const row = await tx.setPerformance.findFirst({ where: { id: requireId(setId), organizationId: actor.organizationId, sessionExercise: { workoutSessionId: session.id } }, include: { sessionExercise: true } });
      if (!row) throw new NotFoundException();
      const snapshot = row.sessionExercise;
      if ((snapshot.performanceModeSnapshot === 'REPS_ONLY' && body.actualLoadKg !== null) ||
          (snapshot.intensityMode !== 'RIR' && body.rir !== null) || (snapshot.intensityMode !== 'RPE' && body.rpe !== null) ||
          (body.completionState === 'COMPLETED' && (body.actualRepetitions === null || (snapshot.performanceModeSnapshot === 'WEIGHT_REPS' && body.actualLoadKg === null)))) {
        throw new BadRequestException('Actual values must match the exercise mode and explicit completion');
      }
      if (row.version !== body.version) {
        if (row.version === body.version + 1 && sameActual(row, body)) return row;
        throw new ConflictException('Set changed; refresh before saving');
      }
      return tx.setPerformance.update({ where: { id: row.id }, data: { completionState: body.completionState, actualLoadKg: body.actualLoadKg, actualRepetitions: body.actualRepetitions, rir: body.rir, rpe: body.rpe, completedAt: body.completionState === 'COMPLETED' ? row.completedAt ?? new Date() : null, version: { increment: 1 } } });
    });
    const progress = (await this.detail(id, actor)).progress;
    return { set: result, progress };
  }

  async finish(id: string, raw: unknown, actor: Actor) {
    const body = input(finishWorkoutSchema, raw);
    await this.db.$transaction(async (tx) => {
      const session = await this.lock(tx, id, actor);
      if (session.status === 'COMPLETED' || session.status === 'PARTIAL') {
        const sameReason = (session.partialReason ?? null) === (body.partialReason ?? null) &&
          (session.partialReasonDetail ?? null) === (body.partialReasonDetail ?? null);
        const safety = body.partialReason === 'DISCOMFORT_OR_PAIN' || body.partialReason === 'FEELING_UNWELL'
          ? await tx.sessionSafetyEvent.findFirst({ where: { workoutSessionId: id, type: body.partialReason, source: 'EARLY_FINISH' } }) : null;
        const sameSafety = safety ? safety.bodyRegion === (body.bodyRegion ?? null) && safety.intensity === (body.intensity ?? null) : body.bodyRegion == null && body.intensity == null;
        if (body.version === session.version - 1 && sameReason && sameSafety) return;
        throw new ConflictException('Workout has already been finalized');
      }
      if (session.status !== 'IN_PROGRESS' || session.version !== body.version) throw new ConflictException('Workout changed or is not active');
      const sets = await tx.setPerformance.findMany({ where: { sessionExercise: { workoutSessionId: id } }, select: { completionState: true } });
      const incomplete = sets.filter((set) => set.completionState === 'NOT_STARTED').length;
      const isPartial = incomplete > 0;
      if (isPartial && !body.partialReason) throw new BadRequestException('Choose a reason to finish an incomplete workout');
      if (!isPartial && (body.partialReason || body.partialReasonDetail || body.bodyRegion || body.intensity)) throw new BadRequestException('A complete workout cannot have partial-finish details');
      if ((body.bodyRegion || body.intensity) && body.partialReason !== 'DISCOMFORT_OR_PAIN') throw new BadRequestException('Location and intensity are only used for discomfort');
      await tx.workoutSession.update({ where: { id }, data: { status: isPartial ? 'PARTIAL' : 'COMPLETED', finishedAt: new Date(), partialReason: isPartial ? body.partialReason : null, partialReasonDetail: isPartial ? body.partialReasonDetail ?? null : null, version: { increment: 1 } } });
      if (isPartial && (body.partialReason === 'DISCOMFORT_OR_PAIN' || body.partialReason === 'FEELING_UNWELL')) await tx.sessionSafetyEvent.create({ data: { organizationId: actor.organizationId, workoutSessionId: id, type: body.partialReason, bodyRegion: body.bodyRegion ?? null, intensity: body.intensity ?? null, notes: body.partialReasonDetail ?? null } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, resourceType: 'WorkoutSession', resourceId: id, action: isPartial ? 'WORKOUT_FINISHED_PARTIAL' : 'WORKOUT_COMPLETED' } });
    });
    return this.detail(id, actor);
  }

  async cancel(id: string, raw: unknown, actor: Actor) {
    const { version, reason } = input(cancelWorkoutSchema, raw);
    await this.db.$transaction(async (tx) => {
      const session = await this.lock(tx, id, actor);
      if (session.status === 'CANCELLED' && session.version === version + 1 && session.cancellationReason === reason) return;
      if (!['NOT_STARTED', 'IN_PROGRESS'].includes(session.status) || session.version !== version) throw new ConflictException('Workout cannot be cancelled');
      const completed = await tx.setPerformance.count({ where: { sessionExercise: { workoutSessionId: id }, completionState: 'COMPLETED' } });
      if (completed) throw new ConflictException('Performed work must be finished as a partial workout');
      await tx.workoutSession.update({ where: { id }, data: { status: 'CANCELLED', cancellationReason: reason, cancellationActorType: actor.role, cancelledAt: new Date(), cancelledByMembershipId: actor.membershipId, version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, resourceType: 'WorkoutSession', resourceId: id, action: 'WORKOUT_CANCELLED' } });
    });
    return this.detail(id, actor);
  }

  async skip(id: string, raw: unknown, actor: Actor) {
    const { version } = input(skipWorkoutSchema, raw);
    await this.db.$transaction(async (tx) => {
      const session = await this.lock(tx, id, actor);
      if (session.status === 'SKIPPED' && session.version === version + 1) return;
      if (session.status !== 'NOT_STARTED' || session.version !== version || session.scheduledDate.toISOString().slice(0, 10) >= localToday(session.timezone)) throw new ConflictException('Only past-due unstarted workouts may be skipped');
      await tx.workoutSession.update({ where: { id }, data: { status: 'SKIPPED', skippedAt: new Date(), skippedByMembershipId: actor.membershipId, version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, resourceType: 'WorkoutSession', resourceId: id, action: 'WORKOUT_SKIPPED' } });
    });
    return this.detail(id, actor);
  }

  async home(actor: Actor) {
    if (!actor.studentId) throw new NotFoundException();
    const profile = await this.students.self(actor);
    const today = localToday(profile.timezone ?? (await this.db.organization.findUniqueOrThrow({ where: { id: actor.organizationId } })).timezone);
    const common = { organizationId: actor.organizationId, studentId: actor.studentId };
    const inProgress = await this.db.workoutSession.findFirst({ where: { ...common, status: 'IN_PROGRESS' }, select: { id: true } });
    const due = !inProgress ? await this.db.workoutSession.findFirst({ where: { ...common, status: 'NOT_STARTED', scheduledDate: { lte: asDate(today) } }, orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }], select: { id: true } }) : null;
    const upcoming = !inProgress && !due ? await this.db.workoutSession.findFirst({ where: { ...common, status: 'NOT_STARTED' }, orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }], select: { id: true } }) : null;
    const selected = inProgress ?? due ?? upcoming;
    const current = selected ? await this.detail(selected.id, actor) : null;
    const date = asDate(today); const day = date.getUTCDay(); const weekStart = new Date(date.getTime() - ((day + 6) % 7) * 86_400_000);
    const completedThisWeek = await this.db.workoutSession.count({ where: { ...common, status: 'COMPLETED', scheduledDate: { gte: weekStart } } });
    return { profile, today: current ? { id: current.id, kind: inProgress ? 'IN_PROGRESS' : due ? 'DUE' : 'UPCOMING', status: current.status, scheduledDate: current.scheduledDate, name: current.workout.name, expectedDurationMinutes: current.workout.expectedDurationMinutes, progress: current.progress } : null, completedThisWeek };
  }
}

@Controller()
export class WorkoutController {
  constructor(@Inject(WorkoutService) private readonly service: WorkoutService) {}
  @Get('student/home') @Roles('STUDENT') home(@Req() req: AppRequest) { return this.service.home(req.actor!); }
  @Get('student/me/workouts') @Roles('STUDENT') own(@Query() filters: unknown, @Req() req: AppRequest) { return this.service.listOwn(filters, req.actor!); }
  @Get('students/:studentId/workout-sessions') @Roles('ADMIN', 'TRAINER') studentSessions(@Param('studentId') studentId: string, @Query() filters: unknown, @Req() req: AppRequest) { return this.service.listStudent(studentId, filters, req.actor!); }
  @Post('students/:studentId/workout-sessions') @Roles('ADMIN', 'TRAINER') schedule(@Param('studentId') studentId: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.schedule(studentId, body, req.actor!); }
  @Get('workout-sessions/:id') @Roles('ADMIN', 'TRAINER', 'STUDENT') detail(@Param('id') id: string, @Req() req: AppRequest) { return this.service.detail(id, req.actor!); }
  @Post('workout-sessions/:id/start') @Roles('STUDENT') start(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.start(id, body, req.actor!); }
  @Put('workout-sessions/:id/sets/:setId') @Roles('STUDENT') set(@Param('id') id: string, @Param('setId') setId: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.set(id, setId, body, req.actor!); }
  @Post('workout-sessions/:id/finish') @Roles('STUDENT') finish(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.finish(id, body, req.actor!); }
  @Post('workout-sessions/:id/cancel') @Roles('ADMIN', 'TRAINER', 'STUDENT') cancel(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.cancel(id, body, req.actor!); }
  @Post('workout-sessions/:id/skip') @Roles('ADMIN', 'TRAINER') skip(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.skip(id, body, req.actor!); }
}
