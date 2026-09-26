import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Patch, Req } from '@nestjs/common';
import { Prisma, ProgrammedExercise, WorkoutTemplate } from '@prisma/client';
import { planRevisionSchema as revisionSchema, programmedExerciseCreateSchema, programmedExerciseEditSchema, reorderSchema, workoutCreateSchema, workoutEditSchema } from '@machi-gym/contracts';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';

export async function versionDetail(db: Db, id: string, organizationId: string) {
  const version = await db.trainingPlanVersion.findFirst({ where: { id: requireId(id), organizationId }, include: {
    trainingPlan: { select: { id: true, name: true, status: true, version: true } },
    workouts: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: { select: { name: true, active: true, primaryMuscleGroup: true, media: { where: { active: true, licenseStatus: 'VERIFIED', type: 'THUMBNAIL' }, select: { url: true }, take: 1 } } } } } } },
  } });
  if (!version) throw new NotFoundException();
  return version;
}

export async function claimDraft(tx: Prisma.TransactionClient, versionId: string, actor: Actor, revision: number): Promise<void> {
  const updated = await tx.trainingPlanVersion.updateMany({ where: { id: versionId, organizationId: actor.organizationId, status: 'DRAFT', revision, trainingPlan: { status: { not: 'ARCHIVED' } } }, data: { revision: { increment: 1 } } });
  if (updated.count !== 1) throw new ConflictException('Draft changed or is no longer editable; refresh it');
}

export async function cloneVersionContent(tx: Prisma.TransactionClient, sourceVersionId: string, targetVersionId: string, organizationId: string): Promise<void> {
  const templates = await tx.workoutTemplate.findMany({ where: { trainingPlanVersionId: sourceVersionId, organizationId }, orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: { select: { active: true } } } } } });
  if (templates.some((template) => template.exercises.some((entry) => !entry.exercise.active))) throw new BadRequestException('An inactive exercise must be replaced before copying this program');
  for (const [index, template] of templates.entries()) {
    const copy = await tx.workoutTemplate.create({ data: { organizationId, trainingPlanVersionId: targetVersionId, name: template.name, description: template.description, order: index + 1, expectedDurationMinutes: template.expectedDurationMinutes, dayLabel: template.dayLabel, trainerNotes: template.trainerNotes } });
    for (const [position, exercise] of template.exercises.entries()) await tx.programmedExercise.create({ data: { organizationId, workoutTemplateId: copy.id, exerciseId: exercise.exerciseId, order: position + 1, targetSets: exercise.targetSets, targetRepsMin: exercise.targetRepsMin, targetRepsMax: exercise.targetRepsMax, intensityMode: exercise.intensityMode, targetRir: exercise.targetRir, targetRpe: exercise.targetRpe, restSeconds: exercise.restSeconds, suggestedLoadKg: exercise.suggestedLoadKg, trainerNotes: exercise.trainerNotes } });
  }
}

async function reorder(tx: Prisma.TransactionClient, kind: 'workoutTemplate' | 'programmedExercise', rows: { id: string; order: number }[], orderedIds: string[]): Promise<void> {
  if (orderedIds.length !== rows.length || new Set(orderedIds).size !== rows.length || orderedIds.some((id) => !rows.some((row) => row.id === id))) throw new BadRequestException('Ordered IDs must match the current children exactly');
  const offset = Math.max(0, ...rows.map((row) => row.order)) + rows.length + 1;
  for (const [index, row] of rows.entries()) {
    if (kind === 'workoutTemplate') await tx.workoutTemplate.update({ where: { id: row.id }, data: { order: offset + index } });
    else await tx.programmedExercise.update({ where: { id: row.id }, data: { order: offset + index } });
  }
  for (const [index, id] of orderedIds.entries()) {
    if (kind === 'workoutTemplate') await tx.workoutTemplate.update({ where: { id }, data: { order: index + 1 } });
    else await tx.programmedExercise.update({ where: { id }, data: { order: index + 1 } });
  }
}

function prescriptionFrom(row: ProgrammedExercise) {
  return { exerciseId: row.exerciseId, targetSets: row.targetSets, targetRepsMin: row.targetRepsMin, targetRepsMax: row.targetRepsMax, intensityMode: row.intensityMode, targetRir: row.targetRir, targetRpe: row.targetRpe === null ? null : Number(row.targetRpe), restSeconds: row.restSeconds, suggestedLoadKg: row.suggestedLoadKg === null ? null : String(row.suggestedLoadKg), trainerNotes: row.trainerNotes };
}

@Injectable()
export class ProgrammingService {
  constructor(@Inject(Db) private readonly db: Db) {}
  private async template(id: string, actor: Actor): Promise<WorkoutTemplate> {
    const row = await this.db.workoutTemplate.findFirst({ where: { id: requireId(id), organizationId: actor.organizationId } });
    if (!row) throw new NotFoundException();
    return row;
  }
  private async programmed(id: string, actor: Actor): Promise<ProgrammedExercise & { workoutTemplate: WorkoutTemplate }> {
    const row = await this.db.programmedExercise.findFirst({ where: { id: requireId(id), organizationId: actor.organizationId }, include: { workoutTemplate: true } });
    if (!row) throw new NotFoundException();
    return row;
  }
  detail(id: string, actor: Actor) { return versionDetail(this.db, id, actor.organizationId); }

  async createWorkout(versionId: string, raw: unknown, actor: Actor) {
    const { revision, ...fields } = input(workoutCreateSchema, raw);
    const version = await versionDetail(this.db, versionId, actor.organizationId);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, version.id, actor, revision);
      const last = await tx.workoutTemplate.aggregate({ where: { trainingPlanVersionId: version.id }, _max: { order: true } });
      await tx.workoutTemplate.create({ data: { ...fields, organizationId: actor.organizationId, trainingPlanVersionId: version.id, order: (last._max.order ?? 0) + 1 } });
    });
    return this.detail(version.id, actor);
  }
  async editWorkout(id: string, raw: unknown, actor: Actor) {
    const { revision, ...fields } = input(workoutEditSchema, raw);
    const template = await this.template(id, actor);
    await this.db.$transaction(async (tx) => { await claimDraft(tx, template.trainingPlanVersionId, actor, revision); await tx.workoutTemplate.update({ where: { id }, data: fields }); });
    return this.detail(template.trainingPlanVersionId, actor);
  }
  async duplicateWorkout(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(revisionSchema, raw);
    const template = await this.template(id, actor);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, template.trainingPlanVersionId, actor, revision);
      const source = await tx.workoutTemplate.findUniqueOrThrow({ where: { id }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: { select: { active: true } } } } } });
      if (source.exercises.some((entry) => !entry.exercise.active)) throw new BadRequestException('Replace inactive exercises before duplicating');
      const last = await tx.workoutTemplate.aggregate({ where: { trainingPlanVersionId: template.trainingPlanVersionId }, _max: { order: true } });
      const copy = await tx.workoutTemplate.create({ data: { organizationId: actor.organizationId, trainingPlanVersionId: template.trainingPlanVersionId, order: (last._max.order ?? 0) + 1, name: `${source.name} (copia)`, description: source.description, dayLabel: source.dayLabel, expectedDurationMinutes: source.expectedDurationMinutes, trainerNotes: source.trainerNotes } });
      for (const [index, row] of source.exercises.entries()) await tx.programmedExercise.create({ data: { ...prescriptionFrom(row), organizationId: actor.organizationId, workoutTemplateId: copy.id, order: index + 1 } });
    });
    return this.detail(template.trainingPlanVersionId, actor);
  }
  async reorderWorkouts(versionId: string, raw: unknown, actor: Actor) {
    const { revision, orderedIds } = input(reorderSchema, raw);
    await versionDetail(this.db, versionId, actor.organizationId);
    await this.db.$transaction(async (tx) => { await claimDraft(tx, versionId, actor, revision); const rows = await tx.workoutTemplate.findMany({ where: { trainingPlanVersionId: versionId }, select: { id: true, order: true } }); await reorder(tx, 'workoutTemplate', rows, orderedIds); });
    return this.detail(versionId, actor);
  }
  async removeWorkout(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(revisionSchema, raw);
    const template = await this.template(id, actor);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, template.trainingPlanVersionId, actor, revision);
      await tx.programmedExercise.deleteMany({ where: { workoutTemplateId: id } });
      await tx.workoutTemplate.delete({ where: { id } });
      const rows = await tx.workoutTemplate.findMany({ where: { trainingPlanVersionId: template.trainingPlanVersionId }, select: { id: true, order: true }, orderBy: { order: 'asc' } });
      if (rows.length) await reorder(tx, 'workoutTemplate', rows, rows.map((row) => row.id));
    });
    return this.detail(template.trainingPlanVersionId, actor);
  }
  async addExercise(templateId: string, raw: unknown, actor: Actor) {
    const { revision, ...fields } = input(programmedExerciseCreateSchema, raw);
    const template = await this.template(templateId, actor);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, template.trainingPlanVersionId, actor, revision);
      const exercise = await tx.exercise.findFirst({ where: { id: fields.exerciseId, organizationId: actor.organizationId, active: true } });
      if (!exercise) throw new NotFoundException('Exercise unavailable in this organization');
      if (exercise.performanceMode === 'REPS_ONLY' && fields.suggestedLoadKg != null) throw new BadRequestException('This exercise does not record external load');
      const last = await tx.programmedExercise.aggregate({ where: { workoutTemplateId: template.id }, _max: { order: true } });
      await tx.programmedExercise.create({ data: { ...fields, organizationId: actor.organizationId, workoutTemplateId: template.id, order: (last._max.order ?? 0) + 1 } });
    });
    return this.detail(template.trainingPlanVersionId, actor);
  }
  async editExercise(id: string, raw: unknown, actor: Actor) {
    const { revision, ...patch } = input(programmedExerciseEditSchema, raw);
    const entry = await this.programmed(id, actor);
    const fields = input(programmedExerciseCreateSchema, { ...prescriptionFrom(entry), ...patch, revision });
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, entry.workoutTemplate.trainingPlanVersionId, actor, revision);
      const exercise = await tx.exercise.findFirst({ where: { id: fields.exerciseId, organizationId: actor.organizationId, active: true } });
      if (!exercise) throw new NotFoundException('Exercise unavailable in this organization');
      if (exercise.performanceMode === 'REPS_ONLY' && fields.suggestedLoadKg != null) throw new BadRequestException('This exercise does not record external load');
      const { revision: _revision, ...prescription } = fields;
      void _revision;
      await tx.programmedExercise.update({ where: { id }, data: prescription });
    });
    return this.detail(entry.workoutTemplate.trainingPlanVersionId, actor);
  }
  async reorderExercises(templateId: string, raw: unknown, actor: Actor) {
    const { revision, orderedIds } = input(reorderSchema, raw);
    const template = await this.template(templateId, actor);
    await this.db.$transaction(async (tx) => { await claimDraft(tx, template.trainingPlanVersionId, actor, revision); const rows = await tx.programmedExercise.findMany({ where: { workoutTemplateId: template.id }, select: { id: true, order: true } }); await reorder(tx, 'programmedExercise', rows, orderedIds); });
    return this.detail(template.trainingPlanVersionId, actor);
  }
  async removeExercise(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(revisionSchema, raw);
    const entry = await this.programmed(id, actor);
    await this.db.$transaction(async (tx) => {
      await claimDraft(tx, entry.workoutTemplate.trainingPlanVersionId, actor, revision);
      await tx.programmedExercise.delete({ where: { id } });
      const rows = await tx.programmedExercise.findMany({ where: { workoutTemplateId: entry.workoutTemplateId }, select: { id: true, order: true }, orderBy: { order: 'asc' } });
      if (rows.length) await reorder(tx, 'programmedExercise', rows, rows.map((row) => row.id));
    });
    return this.detail(entry.workoutTemplate.trainingPlanVersionId, actor);
  }
}

@Controller()
export class ProgrammingController {
  constructor(@Inject(ProgrammingService) private readonly service: ProgrammingService) {}
  @Get('plan-versions/:id') @Roles('ADMIN', 'TRAINER') get(@Param('id') id: string, @Req() req: AppRequest) { return this.service.detail(id, req.actor!); }
  @Post('plan-versions/:id/workouts') @Roles('ADMIN', 'TRAINER') create(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.createWorkout(id, body, req.actor!); }
  @Post('plan-versions/:id/workouts/reorder') @Roles('ADMIN', 'TRAINER') reorder(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.reorderWorkouts(id, body, req.actor!); }
  @Patch('workout-templates/:id') @Roles('ADMIN', 'TRAINER') update(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.editWorkout(id, body, req.actor!); }
  @Post('workout-templates/:id/duplicate') @Roles('ADMIN', 'TRAINER') duplicate(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.duplicateWorkout(id, body, req.actor!); }
  @Post('workout-templates/:id/remove') @Roles('ADMIN', 'TRAINER') remove(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.removeWorkout(id, body, req.actor!); }
  @Post('workout-templates/:id/exercises') @Roles('ADMIN', 'TRAINER') add(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.addExercise(id, body, req.actor!); }
  @Post('workout-templates/:id/exercises/reorder') @Roles('ADMIN', 'TRAINER') reorderEntries(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.reorderExercises(id, body, req.actor!); }
  @Patch('programmed-exercises/:id') @Roles('ADMIN', 'TRAINER') edit(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.editExercise(id, body, req.actor!); }
  @Post('programmed-exercises/:id/remove') @Roles('ADMIN', 'TRAINER') removeEntry(@Param('id') id: string, @Req() req: AppRequest, @Body() body: unknown) { return this.service.removeExercise(id, body, req.actor!); }
}
