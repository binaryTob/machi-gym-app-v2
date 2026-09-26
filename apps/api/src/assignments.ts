import { Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assignmentSchema } from '@machi-gym/contracts';
import { z } from 'zod';
import { Actor, AppRequest, Db, input, Roles } from './common';
import { StudentService } from './students';

const emptyCommand = z.object({}).strict();
export function localToday(timezone: string): string { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

@Injectable()
export class AssignmentService {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService) {}
  private async audit(tx: Prisma.TransactionClient, actor: Actor, studentId: string, action: string) {
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, resourceType: 'StudentPlanAssignment', resourceId: studentId, action } });
  }
  async current(studentId: string, actor: Actor) {
    await this.students.ensure(studentId, actor);
    return this.db.studentPlanAssignment.findFirst({ where: { studentId, organizationId: actor.organizationId, active: true }, include: { plan: { select: { name: true, status: true } }, planVersion: { select: { id: true, versionNumber: true, title: true, status: true, goal: true } } } });
  }
  async assign(studentId: string, raw: unknown, actor: Actor, replace: boolean) {
    const fields = input(assignmentSchema, raw);
    await this.students.ensure(studentId, actor);
    const organization = await this.db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    if (fields.startDate > localToday(organization.timezone)) throw new ConflictException('A current assignment cannot start in the future');
    const assigned = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentProfile" WHERE "id" = ${studentId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "TrainingPlan" WHERE "id" = ${fields.planId} AND "organizationId" = ${actor.organizationId} FOR SHARE`;
      const plan = await tx.trainingPlan.findFirst({ where: { id: fields.planId, organizationId: actor.organizationId, status: 'ACTIVE' }, include: { versions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } } });
      if (!plan?.versions[0]) throw new NotFoundException('Active organization plan not found');
      const existing = await tx.studentPlanAssignment.findFirst({ where: { studentId, organizationId: actor.organizationId, active: true } });
      if (replace && !existing) throw new ConflictException('No active assignment to replace');
      if (!replace && existing) throw new ConflictException('Student already has a primary plan; use replace');
      if (existing) await tx.studentPlanAssignment.update({ where: { id: existing.id }, data: { active: false, endedAt: new Date() } });
      const row = await tx.studentPlanAssignment.create({ data: { organizationId: actor.organizationId, studentId, trainingPlanId: plan.id, trainingPlanVersionId: plan.versions[0].id, assignedByMembershipId: actor.membershipId, startDate: new Date(`${fields.startDate}T00:00:00.000Z`), endDate: fields.endDate ? new Date(`${fields.endDate}T00:00:00.000Z`) : null } });
      await this.audit(tx, actor, studentId, replace ? 'PLAN_ASSIGNMENT_REPLACED' : 'PLAN_ASSIGNED');
      return row;
    });
    return this.db.studentPlanAssignment.findUniqueOrThrow({ where: { id: assigned.id }, include: { planVersion: { select: { id: true, title: true, status: true, versionNumber: true } } } });
  }
  async end(studentId: string, raw: unknown, actor: Actor) {
    input(emptyCommand, raw);
    await this.students.ensure(studentId, actor);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentProfile" WHERE "id" = ${studentId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const previous = await tx.studentPlanAssignment.findFirst({ where: { studentId, organizationId: actor.organizationId, active: true } });
      if (!previous) throw new ConflictException('No active assignment to end');
      await tx.studentPlanAssignment.update({ where: { id: previous.id }, data: { active: false, endedAt: new Date() } });
      await this.audit(tx, actor, studentId, 'PLAN_ASSIGNMENT_ENDED');
    });
    return { active: false };
  }
  async studentProgram(actor: Actor) {
    if (!actor.studentId) throw new NotFoundException();
    const assignment = await this.db.studentPlanAssignment.findFirst({ where: { organizationId: actor.organizationId, studentId: actor.studentId, active: true }, include: { planVersion: { include: { workouts: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: { select: { media: { where: { active: true, licenseStatus: 'VERIFIED', type: 'THUMBNAIL' }, select: { url: true }, take: 1 } } } } } } } } } } });
    if (!assignment) return null;
    const version = assignment.planVersion;
    return {
      title: version.title, description: version.description, goal: version.goal,
      startDate: assignment.startDate, endDate: assignment.endDate,
      workouts: version.workouts.map((workout) => ({ id: workout.id, name: workout.name, description: workout.description, order: workout.order, dayLabel: workout.dayLabel, expectedDurationMinutes: workout.expectedDurationMinutes, exercises: workout.exercises.map((entry) => ({
        exerciseId: entry.exerciseId, name: entry.exerciseNameSnapshot, order: entry.order,
        targetSets: entry.targetSets, targetRepsMin: entry.targetRepsMin, targetRepsMax: entry.targetRepsMax,
        intensityMode: entry.intensityMode, targetRir: entry.targetRir, targetRpe: entry.targetRpe,
        restSeconds: entry.restSeconds, suggestedLoadKg: entry.suggestedLoadKg,
        instructions: entry.instructionsSnapshot, commonMistakes: entry.commonMistakesSnapshot, cautionNotes: entry.cautionNotesSnapshot,
        thumbnailUrl: entry.exercise.media[0]?.url ?? null,
      })) })),
    };
  }
}

@Controller()
export class AssignmentController {
  constructor(@Inject(AssignmentService) private readonly service: AssignmentService) {}
  @Get('students/:id/plan-assignment') @Roles('ADMIN', 'TRAINER') current(@Param('id') id: string, @Req() req: AppRequest) { return this.service.current(id, req.actor!); }
  @Post('students/:id/plan-assignment') @Roles('ADMIN', 'TRAINER') assign(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.assign(id, body, req.actor!, false); }
  @Post('students/:id/plan-assignment/replace') @Roles('ADMIN', 'TRAINER') replace(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.assign(id, body, req.actor!, true); }
  @Post('students/:id/plan-assignment/end') @Roles('ADMIN', 'TRAINER') end(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.end(id, body, req.actor!); }
  @Get('student/me/plan') @Roles('STUDENT') student(@Req() req: AppRequest) { return this.service.studentProgram(req.actor!); }
}
