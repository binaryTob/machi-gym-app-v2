import { BadRequestException, Body, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { monthlyProgressRevisionSchema } from '@machi-gym/contracts';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';
import { StudentService } from './students';
import { ANALYTICS_VERSION, adherence, discomfort, duration, exerciseProgress, feedback, inPeriod, localDate, periodFor, volume, weights, type DiscomfortFact, type PerformedSet, type Period } from './analytics-calculations';

const querySchema = z.object({ period: z.enum(['current-week', 'previous-week', 'current-month', 'previous-month', 'last-30-days', 'custom']).default('current-month'), start: z.string().optional(), end: z.string().optional() }).strict();
// Nest's @Param() also contains :id on trainer routes; discard it after authorization.
const monthSchema = z.object({ year: z.coerce.number().int().min(2000).max(9999), month: z.coerce.number().int().min(1).max(12) });
type Store = Db | Prisma.TransactionClient;
type StudentScope = { id: string; displayName: string; primaryGoal: string | null; timezone: string | null; organization: { timezone: string } };
type Sources = Awaited<ReturnType<AnalyticsService['sources']>>;

@Injectable()
export class AnalyticsService {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService) {}

  private async authorized(studentId: string, actor: Actor): Promise<StudentScope> {
    if (actor.role === 'STUDENT' && actor.studentId !== studentId) throw new NotFoundException();
    if (actor.role !== 'STUDENT') await this.students.ensure(studentId, actor);
    const profile = await this.db.studentProfile.findFirst({ where: { id: requireId(studentId), organizationId: actor.organizationId },
      select: { id: true, displayName: true, primaryGoal: true, timezone: true, organization: { select: { timezone: true } } } });
    if (!profile) throw new NotFoundException();
    return profile;
  }

  // Fetch each source in one bounded, tenant/student-scoped query. The extra UTC day on each
  // side allows any IANA timezone offset; exact membership is decided by localDate below.
  async sources(db: Store, organizationId: string, studentIds: string[], from: string, to: string) {
    const lower = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
    const upper = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000);
    const scope = { organizationId, studentId: { in: studentIds } };
    const [sessions, weightRows, discomfortRows, earlyEvents] = await Promise.all([
      db.workoutSession.findMany({ where: { ...scope, OR: [ { scheduledDate: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${to}T00:00:00Z`) } }, { finishedAt: { gte: lower, lt: upper } } ] },
        select: { id: true, studentId: true, scheduledDate: true, status: true, cancelledAt: true, cancellationActorType: true, partialReason: true, startedAt: true, finishedAt: true, workoutTemplateId: true,
          feedback: { select: { sessionRpe: true, recoveryState: true, submittedAt: true } },
          exercises: { select: { exerciseId: true, exerciseNameSnapshot: true, performanceModeSnapshot: true, loadEntryConventionSnapshot: true, loadMultiplierSnapshot: true,
            sets: { select: { completionState: true, actualLoadKg: true, actualRepetitions: true } } } } } }),
      db.bodyWeightMeasurement.findMany({ where: { ...scope, measuredAt: { gte: lower, lt: upper } }, select: { id: true, studentId: true, measuredAt: true, weightKg: true } }),
      db.discomfortReport.findMany({ where: { ...scope, createdAt: { gte: lower, lt: upper } }, select: { studentId: true, bodyRegion: true, intensity: true, createdAt: true, exerciseId: true, exercise: { select: { name: true } } } }),
      db.sessionSafetyEvent.findMany({ where: { organizationId, workoutSession: { studentId: { in: studentIds } }, type: 'DISCOMFORT_OR_PAIN', source: 'EARLY_FINISH',
        createdAt: { gte: lower, lt: upper }, discomfortReport: { is: null } }, select: { workoutSession: { select: { studentId: true } }, bodyRegion: true, intensity: true, createdAt: true } }),
    ]);
    return { sessions, weightRows, discomfortRows, earlyEvents };
  }

  calculate(profile: StudentScope, organizationId: string, source: Sources, period: Period, now: Date) {
    const timezone = profile.timezone ?? profile.organization.timezone;
    const today = localDate(now, timezone);
    const sessions = source.sessions.filter((session) => session.studentId === profile.id);
    const performed = sessions.filter((session) => session.finishedAt && ['COMPLETED', 'PARTIAL'].includes(session.status) && inPeriod(localDate(session.finishedAt, timezone), period));
    const actualSets: PerformedSet[] = performed.flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets.map((set) => ({
      exerciseId: exercise.exerciseId, name: exercise.exerciseNameSnapshot, mode: exercise.performanceModeSnapshot, convention: exercise.loadEntryConventionSnapshot,
      multiplier: Number(exercise.loadMultiplierSnapshot), load: set.actualLoadKg === null ? null : Number(set.actualLoadKg), reps: set.actualRepetitions,
      completed: set.completionState === 'COMPLETED', performedAt: session.finishedAt!, sessionId: session.id,
    }))));
    const feedbackRows = performed.filter((session) => session.feedback).map((session) => ({ sessionRpe: session.feedback!.sessionRpe,
      recoveryState: session.feedback!.recoveryState, at: session.finishedAt! }));
    const partialReasons: Record<string, number> = {};
    for (const session of sessions.filter((row) => row.status === 'PARTIAL' && inPeriod(row.scheduledDate.toISOString().slice(0, 10), period))) {
      if (session.partialReason) partialReasons[session.partialReason] = (partialReasons[session.partialReason] ?? 0) + 1;
    }
    const reports: DiscomfortFact[] = [
      ...source.discomfortRows.filter((row) => row.studentId === profile.id && inPeriod(localDate(row.createdAt, timezone), period))
        .map((row) => ({ ...row, exerciseName: row.exercise?.name ?? null })),
      ...source.earlyEvents.filter((row) => row.workoutSession.studentId === profile.id && row.bodyRegion && inPeriod(localDate(row.createdAt, timezone), period))
        .map((row) => ({ bodyRegion: row.bodyRegion!, intensity: row.intensity, createdAt: row.createdAt, exerciseId: null, exerciseName: null })),
    ];
    const weightFacts = source.weightRows.filter((row) => row.studentId === profile.id).map((row) => ({ id: row.id, weightKg: Number(row.weightKg), measuredAt: row.measuredAt }));
    return { analyticsVersion: ANALYTICS_VERSION, studentId: profile.id, organizationId, studentName: profile.displayName, primaryGoal: profile.primaryGoal,
      timezone, period, adherence: adherence(sessions, period, today, timezone), volume: volume(actualSets), weights: weights(weightFacts, period, timezone),
      feedback: feedback(feedbackRows), duration: duration(performed), partialReasons, discomfort: discomfort(reports),
      // Current facts for the detailed exercise history; comparison is attached below.
      exerciseProgress: exerciseProgress([], actualSets),
    };
  }

  private async build(db: Store, profile: StudentScope, organizationId: string, period: Period, now: Date) {
    const timezone = profile.timezone ?? profile.organization.timezone;
    const monthly = period.label === 'current-month' || period.label === 'calendar-month';
    const monthAnchor = new Date(`${period.start}T12:00:00Z`);
    const previous = monthly ? periodFor('previous-month', timezone, monthAnchor) : null;
    const last30: Period = period.label === 'calendar-month'
      ? { start: new Date(Date.parse(`${period.end}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10), end: period.end, label: 'last-30-days' }
      : periodFor('last-30-days', timezone, now);
    const from = [period.start, previous?.start, last30.start].filter((row): row is string => !!row).sort()[0]!;
    const to = [period.end, previous?.end, last30.end].filter((row): row is string => !!row).sort().at(-1)!;
    const source = await this.sources(db, organizationId, [profile.id], from, to);
    const result = this.calculate(profile, organizationId, source, period, now);
    const recentDiscomfort = this.calculate(profile, organizationId, source, last30, now).discomfort;
    const prior = previous ? this.calculate(profile, organizationId, source, previous, now) : null;
    const currentSets = this.setsFor(source, profile.id, timezone, period);
    const previousSets = previous ? this.setsFor(source, profile.id, timezone, previous) : [];
    return { ...result, exerciseProgress: exerciseProgress(previousSets, currentSets), discomfortLast30Days: recentDiscomfort,
      previousMonth: prior ? { period: prior.period, adherence: prior.adherence, weights: prior.weights, feedback: prior.feedback } : null };
  }
  private setsFor(source: Sources, studentId: string, timezone: string, period: Period): PerformedSet[] {
    return source.sessions.filter((session) => session.studentId === studentId && session.finishedAt && ['COMPLETED', 'PARTIAL'].includes(session.status) && inPeriod(localDate(session.finishedAt, timezone), period))
      .flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ exerciseId: exercise.exerciseId, name: exercise.exerciseNameSnapshot,
        mode: exercise.performanceModeSnapshot, convention: exercise.loadEntryConventionSnapshot, multiplier: Number(exercise.loadMultiplierSnapshot),
        load: set.actualLoadKg === null ? null : Number(set.actualLoadKg), reps: set.actualRepetitions, completed: set.completionState === 'COMPLETED',
        performedAt: session.finishedAt!, sessionId: session.id }))));
  }

  async period(studentId: string, actor: Actor, raw: unknown) {
    const profile = await this.authorized(studentId, actor);
    const query = input(querySchema, raw);
    const now = new Date();
    let period: Period;
    try { period = periodFor(query.period, profile.timezone ?? profile.organization.timezone, now, query.start, query.end); }
    catch { throw new BadRequestException('Invalid analytics period or date range'); }
    return this.build(this.db, profile, actor.organizationId, period, now);
  }
  async month(studentId: string, actor: Actor, raw: unknown) {
    const profile = await this.authorized(studentId, actor);
    const { year, month } = input(monthSchema, raw);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const timezone = profile.timezone ?? profile.organization.timezone;
    const snapshot = await this.db.monthlyProgressSnapshot.findFirst({ where: { organizationId: actor.organizationId, studentId, year, month, supersededAt: null }, orderBy: { analyticsVersion: 'desc' } });
    if (snapshot) return { finalized: true, generatedAt: snapshot.generatedAt, revision: snapshot.revision, metrics: snapshot.metrics };
    const metrics = await this.build(this.db, profile, actor.organizationId, { start, end, label: 'calendar-month' }, new Date());
    return { finalized: false, generatedAt: null, revision: null, metrics: { ...metrics, timezone } };
  }
  async finalize(studentId: string, actor: Actor, raw: unknown, correction?: unknown) {
    const profile = await this.authorized(studentId, actor);
    const { year, month } = input(monthSchema, raw);
    const reason = correction === undefined ? null : input(monthlyProgressRevisionSchema, correction).reason;
    const timezone = profile.timezone ?? profile.organization.timezone;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    // Feedback can arrive until 24h after a late-night session. 48h after the
    // UTC calendar boundary covers every supported IANA offset plus that window.
    if (Date.now() < Date.parse(`${end}T00:00:00Z`) + 48 * 3_600_000) throw new BadRequestException('Wait 48 hours after month end before finalizing feedback');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentProfile" WHERE "id" = ${studentId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const active = await tx.monthlyProgressSnapshot.findFirst({ where: { organizationId: actor.organizationId, studentId, year, month, analyticsVersion: ANALYTICS_VERSION, supersededAt: null } });
      if (active && !reason) return { finalized: true, generatedAt: active.generatedAt, revision: active.revision, metrics: active.metrics };
      if (reason && !active) throw new BadRequestException('No snapshot to correct');
      const metrics = await this.build(tx, profile, actor.organizationId, { start, end, label: 'calendar-month' }, new Date());
      if (active) await tx.monthlyProgressSnapshot.update({ where: { id: active.id }, data: { supersededAt: new Date() } });
      const created = await tx.monthlyProgressSnapshot.create({ data: { organizationId: actor.organizationId, studentId, year, month, analyticsVersion: ANALYTICS_VERSION,
        revision: (active?.revision ?? 0) + 1, periodStart: new Date(`${start}T00:00:00Z`), periodEnd: new Date(`${end}T00:00:00Z`), timezone,
        metrics: JSON.parse(JSON.stringify(metrics)) as Prisma.InputJsonValue, correctionReason: reason } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
        action: reason ? 'MONTHLY_PROGRESS_REVISED' : 'MONTHLY_PROGRESS_FINALIZED', resourceType: 'MonthlyProgressSnapshot', resourceId: created.id } });
      return { finalized: true, generatedAt: created.generatedAt, revision: created.revision, metrics: created.metrics };
    });
  }
  async roster(actor: Actor) {
    const roster = await this.students.list(actor);
    const ids = roster.students.map((row) => row.id);
    if (!ids.length) return { students: [], nextCursor: roster.nextCursor };
    const profiles = await this.db.studentProfile.findMany({ where: { organizationId: actor.organizationId, id: { in: ids },
      ...(actor.role === 'TRAINER' ? { assignments: { some: { trainerId: actor.trainerId ?? '__none__', active: true } } } : {}) },
      select: { id: true, displayName: true, primaryGoal: true, timezone: true, organization: { select: { timezone: true } } } });
    const now = new Date();
    const periods = profiles.map((row) => periodFor('current-month', row.timezone ?? row.organization.timezone, now));
    const thirtyDays = profiles.map((row) => periodFor('last-30-days', row.timezone ?? row.organization.timezone, now));
    const from = [...periods, ...thirtyDays].map((row) => row.start).sort()[0]!;
    const to = [...periods, ...thirtyDays].map((row) => row.end).sort().at(-1)!;
    const source = await this.sources(this.db, actor.organizationId, ids, from, to);
    return { students: profiles.map((profile) => { const summary = this.calculate(profile, actor.organizationId, source, periodFor('current-month', profile.timezone ?? profile.organization.timezone, now), now);
      return { studentId: profile.id, name: profile.displayName, adherence: summary.adherence, averageRpe: summary.feedback.averageRpe,
        feedbackCount: summary.feedback.sampleSize, partialReasons: summary.partialReasons,
        discomfort: this.calculate(profile, actor.organizationId, source, periodFor('last-30-days', profile.timezone ?? profile.organization.timezone, now), now).discomfort }; }), nextCursor: roster.nextCursor };
  }
}

@Controller()
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}
  @Get('student/me/analytics') @Roles('STUDENT') own(@Req() req: AppRequest, @Query() query: unknown) { return this.analytics.period(req.actor!.studentId!, req.actor!, query); }
  @Get('student/me/analytics/monthly/:year/:month') @Roles('STUDENT') ownMonth(@Req() req: AppRequest, @Param() params: unknown) { return this.analytics.month(req.actor!.studentId!, req.actor!, params); }
  @Get('students/:id/analytics') @Roles('ADMIN', 'TRAINER') student(@Req() req: AppRequest, @Param('id') id: string, @Query() query: unknown) { return this.analytics.period(id, req.actor!, query); }
  @Get('students/:id/analytics/monthly/:year/:month') @Roles('ADMIN', 'TRAINER') studentMonth(@Req() req: AppRequest, @Param('id') id: string, @Param() params: unknown) { return this.analytics.month(id, req.actor!, params); }
  @Post('students/:id/analytics/monthly/:year/:month/finalize') @Roles('ADMIN', 'TRAINER') finalize(@Req() req: AppRequest, @Param('id') id: string, @Param() params: unknown) { return this.analytics.finalize(id, req.actor!, params); }
  @Post('students/:id/analytics/monthly/:year/:month/revise') @Roles('ADMIN', 'TRAINER') revise(@Req() req: AppRequest, @Param('id') id: string, @Param() params: unknown, @Body() body: unknown) { return this.analytics.finalize(id, req.actor!, params, body); }
  @Get('trainer/analytics/roster') @Roles('ADMIN', 'TRAINER') roster(@Req() req: AppRequest) { return this.analytics.roster(req.actor!); }
}
