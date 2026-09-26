import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activityCreateSchema, constraintSchema, noteSchema, readinessSchema, studentCreateSchema, studentProfileSchema, studentSelfProfileSchema, weightSchema } from '@machi-gym/contracts';
import { randomBytes } from 'node:crypto';
import { Actor, AppRequest, Db, hashToken, input, requireId, Roles } from './common';
import { z } from 'zod';

type StudentEdit = import('@machi-gym/contracts').StudentProfileInput;
const publicProfile = { id: true, displayName: true, birthDate: true, heightCm: true, trainingFrequencyPerWeek: true, availableDays: true, approximateSessionMinutes: true, activityLevel: true, experienceLevel: true, primaryGoal: true, timezone: true, status: true, version: true, planningRevision: true, profileReviewedAt: true } as const;
function changes(body: StudentEdit): Prisma.StudentProfileUpdateManyMutationInput {
  const data: Prisma.StudentProfileUpdateManyMutationInput = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.birthDate !== undefined) data.birthDate = body.birthDate === null ? null : new Date(`${body.birthDate}T00:00:00Z`);
  if (body.heightCm !== undefined) data.heightCm = body.heightCm;
  if (body.trainingFrequencyPerWeek !== undefined) data.trainingFrequencyPerWeek = body.trainingFrequencyPerWeek;
  if (body.availableDays !== undefined) data.availableDays = { set: body.availableDays };
  if (body.approximateSessionMinutes !== undefined) data.approximateSessionMinutes = body.approximateSessionMinutes;
  if (body.activityLevel !== undefined) data.activityLevel = body.activityLevel;
  if (body.experienceLevel !== undefined) data.experienceLevel = body.experienceLevel;
  if (body.primaryGoal !== undefined) data.primaryGoal = body.primaryGoal;
  if (body.timezone !== undefined) {
    if (body.timezone !== null) { try { Intl.DateTimeFormat(undefined, { timeZone: body.timezone }); } catch { throw new BadRequestException('Invalid timezone'); } }
    data.timezone = body.timezone;
  }
  return data;
}

@Injectable()
export class StudentService {
  constructor(@Inject(Db) private readonly db: Db) {}
  private scoped(actor: Actor): Prisma.StudentProfileWhereInput {
    return { organizationId: actor.organizationId, ...(actor.role === 'TRAINER' ? { assignments: { some: { trainerId: actor.trainerId ?? '__none__', active: true } } } : {}) };
  }
  async ensure(studentId: string, actor: Actor) {
    const student = await this.db.studentProfile.findFirst({ where: { id: requireId(studentId), ...this.scoped(actor) }, select: { id: true, version: true } });
    if (!student) throw new NotFoundException();
    return student;
  }
  async create(body: unknown, actor: Actor) {
    const { email, displayName } = input(studentCreateSchema, body);
    if (!actor.trainerId) throw new BadRequestException('Trainer profile required');
    const raw = randomBytes(32).toString('base64url');
    try {
      const student = await this.db.$transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { email } })) throw new ConflictException('Account already exists');
        const created = await tx.studentProfile.create({ data: { displayName, contactEmail: email, organizationId: actor.organizationId } });
        await tx.trainerStudentAssignment.create({ data: { trainerId: actor.trainerId!, studentId: created.id, organizationId: actor.organizationId } });
        await tx.studentInvitation.create({ data: { organizationId: actor.organizationId, studentId: created.id, invitedByMembershipId: actor.membershipId, email, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 48 * 3_600_000) } });
        await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action: 'STUDENT_INVITED', resourceType: 'StudentProfile', resourceId: created.id } });
        return created;
      });
      // Shown only once to the authenticated trainer for secure manual delivery.
      return { id: student.id, displayName: student.displayName, invitationToken: raw };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Student/invitation already exists');
      throw error;
    }
  }
  async list(actor: Actor, cursor?: string, rawQuery?: string) {
    const query = input(z.string().trim().max(80).optional(), rawQuery);
    const rows = await this.db.studentProfile.findMany({ where: { ...this.scoped(actor), ...(query ? { displayName: { contains: query, mode: 'insensitive' } } : {}) }, orderBy: { id: 'asc' }, take: 26, ...(cursor ? { skip: 1, cursor: { id: requireId(cursor) } } : {}), select: { id: true, displayName: true, status: true, createdAt: true, version: true, membershipId: true } });
    return { students: rows.slice(0, 25).map(({ membershipId, ...row }) => ({ ...row, onboarded: !!membershipId })), nextCursor: rows.length > 25 ? rows[24]?.id ?? null : null };
  }
  async get(id: string, actor: Actor) {
    await this.ensure(id, actor);
    return this.db.studentProfile.findUniqueOrThrow({ where: { id }, select: { ...publicProfile, constraints: { select: { id: true, type: true, description: true, active: true } }, activities: { select: { id: true, name: true, weeklyFrequency: true } } } });
  }
  async self(actor: Actor) {
    if (!actor.studentId) throw new NotFoundException();
    return this.db.studentProfile.findFirstOrThrow({ where: { id: actor.studentId, organizationId: actor.organizationId }, select: publicProfile });
  }
  async update(id: string, actor: Actor, body: unknown, self = false) {
    const parsed = input(self ? studentSelfProfileSchema : studentProfileSchema, body);
    const student = await this.ensure(id, actor);
    if (self && actor.studentId !== student.id) throw new NotFoundException();
    const count = await this.db.studentProfile.updateMany({ where: { id: student.id, version: parsed.version, organizationId: actor.organizationId }, data: { ...changes(parsed), version: { increment: 1 } } });
    if (count.count !== 1) throw new ConflictException('Profile changed; refresh before editing');
    return this.get(id, actor);
  }
  async confirm(id: string, actor: Actor, body: unknown) {
    const { version } = input(readinessSchema, body);
    const student = await this.get(id, actor);
    if (!student.primaryGoal || !student.trainingFrequencyPerWeek || !student.experienceLevel || student.availableDays.length === 0) throw new BadRequestException('Missing planning fields');
    const result = await this.db.studentProfile.updateMany({ where: { id, version, organizationId: actor.organizationId }, data: { status: 'READY', reviewedPlanningRevision: student.planningRevision, profileReviewedAt: new Date(), profileReviewedByMembershipId: actor.membershipId, version: { increment: 1 } } });
    if (result.count !== 1) throw new ConflictException('Profile changed; refresh before reviewing');
    await this.db.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action: 'PROFILE_CONFIRMED', resourceType: 'StudentProfile', resourceId: id } });
    return this.get(id, actor);
  }
  async constraint(id: string, actor: Actor, body: unknown) {
    const data = input(constraintSchema, body);
    await this.ensure(id, actor);
    return this.db.studentConstraint.create({ data: { ...data, studentId: id }, select: { id: true, type: true, description: true, active: true } });
  }
  async activity(id: string, actor: Actor, body: unknown) {
    const data = input(activityCreateSchema, body);
    await this.ensure(id, actor);
    return this.db.externalActivity.create({ data: { ...data, studentId: id }, select: { id: true, name: true, weeklyFrequency: true } });
  }
  async weight(id: string, actor: Actor, body: unknown) {
    const data = input(weightSchema, body);
    await this.ensure(id, actor);
    return this.db.bodyWeightMeasurement.create({ data: { ...data, studentId: id, organizationId: actor.organizationId, recordedByMembershipId: actor.membershipId }, select: { id: true, weightKg: true, measuredAt: true } });
  }
  async note(id: string, actor: Actor, body: unknown) {
    const data = input(noteSchema, body);
    await this.ensure(id, actor);
    return this.db.trainerNote.create({ data: { ...data, studentId: id, organizationId: actor.organizationId, authorMembershipId: actor.membershipId }, select: { id: true, content: true, createdAt: true } });
  }
}

@Controller()
export class StudentController {
  constructor(@Inject(StudentService) private readonly students: StudentService) {}
  @Post('student-invitations') @Roles('ADMIN', 'TRAINER') create(@Req() req: AppRequest, @Body() body: unknown) { return this.students.create(body, req.actor!); }
  @Get('students') @Roles('ADMIN', 'TRAINER') list(@Req() req: AppRequest, @Query('cursor') cursor?: string, @Query('q') q?: string) { return this.students.list(req.actor!, cursor, q); }
  @Get('students/:id') @Roles('ADMIN', 'TRAINER') get(@Req() req: AppRequest, @Param('id') id: string) { return this.students.get(id, req.actor!); }
  @Patch('students/:id/profile') @Roles('ADMIN', 'TRAINER') update(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.update(id, req.actor!, body); }
  @Post('students/:id/profile/confirm-ready') @Roles('ADMIN', 'TRAINER') confirm(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.confirm(id, req.actor!, body); }
  @Post('students/:id/constraints') @Roles('ADMIN', 'TRAINER') constraint(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.constraint(id, req.actor!, body); }
  @Post('students/:id/external-activities') @Roles('ADMIN', 'TRAINER') activity(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.activity(id, req.actor!, body); }
  @Post('students/:id/weight-measurements') @Roles('ADMIN', 'TRAINER') weight(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.weight(id, req.actor!, body); }
  @Post('students/:id/notes') @Roles('ADMIN', 'TRAINER') note(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.students.note(id, req.actor!, body); }
  @Get('student/me/profile') @Roles('STUDENT') self(@Req() req: AppRequest) { return this.students.self(req.actor!); }
  @Patch('student/me/profile') @Roles('STUDENT') editSelf(@Req() req: AppRequest, @Body() body: unknown) { return this.students.update(req.actor!.studentId!, req.actor!, body, true); }
  @Post('student/me/constraints') @Roles('STUDENT') ownConstraint(@Req() req: AppRequest, @Body() body: unknown) { return this.students.constraint(req.actor!.studentId!, req.actor!, body); }
  @Post('student/me/external-activities') @Roles('STUDENT') ownActivity(@Req() req: AppRequest, @Body() body: unknown) { return this.students.activity(req.actor!.studentId!, req.actor!, body); }
}

@Controller()
export class DashboardController {
  constructor(@Inject(StudentService) private readonly students: StudentService) {}
  @Get('trainer/dashboard') @Roles('ADMIN', 'TRAINER') async trainer(@Req() req: AppRequest) {
    const roster = await this.students.list(req.actor!);
    return { roster: roster.students, onboardingPending: roster.students.filter((s) => !s.onboarded).length };
  }
}
