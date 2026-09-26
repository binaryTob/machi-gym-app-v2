import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Prisma, TrainingPlan } from '@prisma/client';
import { draftVersionEditSchema, newPlanVersionSchema, planArchiveSchema, planCloneSchema, planCreateSchema, planEditSchema, planListSchema, planRevisionSchema, voidPlanVersionSchema } from '@machi-gym/contracts';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';
import { claimDraft, cloneVersionContent, versionDetail } from './programming';

@Injectable()
export class PlanService {
  constructor(@Inject(Db) private readonly db: Db) {}
  private async owned(id: string, actor: Actor): Promise<TrainingPlan> {
    const plan = await this.db.trainingPlan.findFirst({ where: { id: requireId(id), organizationId: actor.organizationId } });
    if (!plan) throw new NotFoundException();
    return plan;
  }
  private async audit(tx: Prisma.TransactionClient, actor: Actor, id: string, action: string): Promise<void> {
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action, resourceType: 'TrainingPlan', resourceId: id } });
  }
  async list(raw: unknown, actor: Actor) {
    const filters = input(planListSchema, raw);
    const where: Prisma.TrainingPlanWhereInput = { organizationId: actor.organizationId, ...(filters.status ? { status: filters.status } : {}), ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {}) };
    if (filters.cursor && !(await this.db.trainingPlan.findFirst({ where: { id: filters.cursor, organizationId: actor.organizationId }, select: { id: true } }))) throw new NotFoundException();
    const rows = await this.db.trainingPlan.findMany({ where, orderBy: { id: 'asc' }, take: 26, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), include: { versions: { where: { status: { in: ['DRAFT', 'ACTIVE'] } }, select: { id: true, status: true, versionNumber: true, revision: true } } } });
    return { items: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24]?.id ?? null : null };
  }
  async detail(id: string, actor: Actor) {
    await this.owned(id, actor);
    return this.db.trainingPlan.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { versionNumber: 'desc' }, select: { id: true, versionNumber: true, title: true, status: true, revision: true, publishedAt: true, retiredAt: true } }, assignments: { where: { active: true }, select: { id: true, studentId: true } } } });
  }
  async create(raw: unknown, actor: Actor) {
    const fields = input(planCreateSchema, raw);
    const plan = await this.db.$transaction(async (tx) => {
      const created = await tx.trainingPlan.create({ data: { organizationId: actor.organizationId, createdByMembershipId: actor.membershipId, ...fields } });
      await tx.trainingPlanVersion.create({ data: { organizationId: actor.organizationId, trainingPlanId: created.id, versionNumber: 1, title: fields.name, description: fields.description, goal: fields.goal, createdByMembershipId: actor.membershipId } });
      await this.audit(tx, actor, created.id, 'PLAN_CREATED');
      return created;
    });
    return this.detail(plan.id, actor);
  }
  async edit(id: string, raw: unknown, actor: Actor) {
    const { version, ...fields } = input(planEditSchema, raw);
    const plan = await this.owned(id, actor);
    await this.db.$transaction(async (tx) => {
      const updated = await tx.trainingPlan.updateMany({ where: { id: plan.id, organizationId: actor.organizationId, version, status: 'DRAFT' }, data: { ...fields, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('Plan changed or is no longer a draft');
      const draft = await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: id, status: 'DRAFT' } });
      if (!draft) throw new ConflictException('No editable plan version');
      await tx.trainingPlanVersion.update({ where: { id: draft.id }, data: { ...(fields.name ? { title: fields.name } : {}), ...(fields.description !== undefined ? { description: fields.description } : {}), ...(fields.goal ? { goal: fields.goal } : {}), revision: { increment: 1 } } });
    });
    return this.detail(id, actor);
  }
  async version(id: string, actor: Actor) { return versionDetail(this.db, id, actor.organizationId); }
  async editVersion(id: string, raw: unknown, actor: Actor) {
    const { revision, ...fields } = input(draftVersionEditSchema, raw);
    await this.version(id, actor);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, id, actor, revision);
      await tx.trainingPlanVersion.update({ where: { id }, data: fields });
    });
    return this.version(id, actor);
  }
  async nextVersion(planId: string, raw: unknown, actor: Actor) {
    const { planVersion, sourceVersionId } = input(newPlanVersionSchema, raw);
    const plan = await this.owned(planId, actor);
    if (plan.status === 'ARCHIVED') throw new ConflictException('Archived plans cannot be revised');
    const next = await this.db.$transaction(async (tx) => {
      const updated = await tx.trainingPlan.updateMany({ where: { id: planId, organizationId: actor.organizationId, version: planVersion }, data: { version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('Plan changed; refresh before creating a revision');
      if (await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: planId, status: 'DRAFT' } })) throw new ConflictException('Finish or void the existing draft first');
      const source = sourceVersionId ? await tx.trainingPlanVersion.findFirst({ where: { id: sourceVersionId, organizationId: actor.organizationId, trainingPlanId: planId, status: { in: ['ACTIVE', 'RETIRED'] } } }) : await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: planId, status: 'ACTIVE' } });
      if (sourceVersionId && !source) throw new NotFoundException();
      const latest = await tx.trainingPlanVersion.aggregate({ where: { trainingPlanId: planId }, _max: { versionNumber: true } });
      const created = await tx.trainingPlanVersion.create({ data: { organizationId: actor.organizationId, trainingPlanId: planId, versionNumber: (latest._max.versionNumber ?? 0) + 1, title: source?.title ?? plan.name, description: source?.description ?? plan.description, goal: source?.goal ?? plan.goal, createdByMembershipId: actor.membershipId } });
      if (source) await cloneVersionContent(tx, source.id, created.id, actor.organizationId);
      return created;
    });
    return this.version(next.id, actor);
  }
  async duplicate(id: string, raw: unknown, actor: Actor) {
    const { name } = input(planCloneSchema, raw);
    const source = await this.owned(id, actor);
    const copied = await this.db.$transaction(async (tx) => {
      const latest = await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: source.id, status: { in: ['ACTIVE', 'DRAFT', 'RETIRED'] } }, orderBy: { versionNumber: 'desc' } });
      if (!latest) throw new BadRequestException('No version is available to duplicate');
      const cloneName = name ?? `${source.name.slice(0, 112)} (copia)`;
      const plan = await tx.trainingPlan.create({ data: { organizationId: actor.organizationId, createdByMembershipId: actor.membershipId, name: cloneName, description: latest.description, goal: latest.goal } });
      const version = await tx.trainingPlanVersion.create({ data: { organizationId: actor.organizationId, trainingPlanId: plan.id, versionNumber: 1, title: cloneName, description: latest.description, goal: latest.goal, createdByMembershipId: actor.membershipId } });
      await cloneVersionContent(tx, latest.id, version.id, actor.organizationId);
      await this.audit(tx, actor, plan.id, 'PLAN_DUPLICATED');
      return plan;
    });
    return this.detail(copied.id, actor);
  }
  async void(id: string, raw: unknown, actor: Actor) {
    const { revision, reason } = input(voidPlanVersionSchema, raw);
    await this.version(id, actor);
    await this.db.$transaction(async (tx) => {
      const changed = await tx.trainingPlanVersion.updateMany({ where: { id, organizationId: actor.organizationId, status: 'DRAFT', revision }, data: { status: 'VOID', revision: { increment: 1 }, voidReason: reason, voidedAt: new Date(), voidedByMembershipId: actor.membershipId } });
      if (changed.count !== 1) throw new ConflictException('Draft changed or was already voided');
    });
    return this.version(id, actor);
  }
  async publish(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(planRevisionSchema, raw);
    const version = await this.version(id, actor);
    if (!version.workouts.length || version.workouts.some((workout) => workout.exercises.length === 0)) throw new BadRequestException('Publishing requires at least one workout with exercises');
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, id, actor, revision);
      const workouts = await tx.workoutTemplate.findMany({ where: { trainingPlanVersionId: id }, include: { exercises: true } });
      if (!workouts.length || workouts.some((workout) => !workout.exercises.length)) throw new BadRequestException('Every workout needs at least one exercise');
      const exerciseIds = [...new Set(workouts.flatMap((workout) => workout.exercises.map((entry) => entry.exerciseId)))].sort();
      for (const exerciseId of exerciseIds) {
        await tx.$queryRaw`SELECT "id" FROM "Exercise" WHERE "id" = ${exerciseId} AND "organizationId" = ${actor.organizationId} FOR SHARE`;
        const exercise = await tx.exercise.findFirst({ where: { id: exerciseId, organizationId: actor.organizationId, active: true } });
        if (!exercise) throw new BadRequestException('A programmed exercise is inactive or belongs to another organization');
        for (const entry of workouts.flatMap((workout) => workout.exercises).filter((row) => row.exerciseId === exerciseId)) {
          await tx.programmedExercise.update({ where: { id: entry.id }, data: { exerciseVersionSnapshot: exercise.version, exerciseNameSnapshot: exercise.name, primaryMuscleSnapshot: exercise.primaryMuscleGroup, performanceModeSnapshot: exercise.performanceMode, loadEntryConventionSnapshot: exercise.loadEntryConvention, loadMultiplierSnapshot: exercise.loadMultiplier, instructionsSnapshot: exercise.instructions, commonMistakesSnapshot: exercise.commonMistakes, cautionNotesSnapshot: exercise.cautionNotes } });
        }
      }
      const previous = await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: version.trainingPlanId, status: 'ACTIVE' } });
      if (previous) await tx.trainingPlanVersion.update({ where: { id: previous.id }, data: { status: 'RETIRED', retiredAt: new Date(), retiredByMembershipId: actor.membershipId } });
      await tx.trainingPlanVersion.update({ where: { id }, data: { status: 'ACTIVE', publishedAt: new Date(), publishedByMembershipId: actor.membershipId } });
      await tx.trainingPlan.update({ where: { id: version.trainingPlanId }, data: { name: version.title, description: version.description, goal: version.goal, status: 'ACTIVE', version: { increment: 1 } } });
      await this.audit(tx, actor, version.trainingPlanId, 'PLAN_PUBLISHED');
    });
    return this.version(id, actor);
  }
  async archive(id: string, raw: unknown, actor: Actor) {
    const { version } = input(planArchiveSchema, raw);
    const plan = await this.owned(id, actor);
    if (plan.status === 'ARCHIVED') throw new ConflictException('Plan is already archived');
    await this.db.$transaction(async (tx) => {
      const checked = await tx.trainingPlan.updateMany({ where: { id, organizationId: actor.organizationId, version, status: { in: ['ACTIVE', 'DRAFT'] } }, data: { version: { increment: 1 } } });
      if (checked.count !== 1) throw new ConflictException('Plan changed; refresh before archiving');
      if (await tx.studentPlanAssignment.findFirst({ where: { trainingPlanId: id, active: true } })) throw new ConflictException('Replace or end active student assignments first');
      if (await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: id, status: 'DRAFT' } })) throw new ConflictException('Void the unfinished draft first');
      const active = await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: id, status: 'ACTIVE' } });
      if (active) await tx.trainingPlanVersion.update({ where: { id: active.id }, data: { status: 'RETIRED', retiredAt: new Date(), retiredByMembershipId: actor.membershipId } });
      await tx.trainingPlan.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
      await this.audit(tx, actor, id, 'PLAN_ARCHIVED');
    });
    return this.detail(id, actor);
  }
}

@Controller('training-plans')
export class PlanController {
  constructor(@Inject(PlanService) private readonly service: PlanService) {}
  @Get() @Roles('ADMIN', 'TRAINER') list(@Query() raw: unknown, @Req() req: AppRequest) { return this.service.list(raw, req.actor!); }
  @Post() @Roles('ADMIN', 'TRAINER') create(@Body() body: unknown, @Req() req: AppRequest) { return this.service.create(body, req.actor!); }
  @Get(':id') @Roles('ADMIN', 'TRAINER') detail(@Param('id') id: string, @Req() req: AppRequest) { return this.service.detail(id, req.actor!); }
  @Patch(':id') @Roles('ADMIN', 'TRAINER') edit(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.edit(id, body, req.actor!); }
  @Post(':id/versions') @Roles('ADMIN', 'TRAINER') version(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.nextVersion(id, body, req.actor!); }
  @Post(':id/duplicate') @Roles('ADMIN', 'TRAINER') duplicate(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.duplicate(id, body, req.actor!); }
  @Post(':id/archive') @Roles('ADMIN', 'TRAINER') archive(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.archive(id, body, req.actor!); }
}

@Controller('plan-versions')
export class PlanVersionController {
  constructor(@Inject(PlanService) private readonly service: PlanService) {}
  @Patch(':id') @Roles('ADMIN', 'TRAINER') edit(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.editVersion(id, body, req.actor!); }
  @Post(':id/publish') @Roles('ADMIN', 'TRAINER') publish(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.publish(id, body, req.actor!); }
  @Post(':id/void') @Roles('ADMIN', 'TRAINER') void(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.void(id, body, req.actor!); }
}
