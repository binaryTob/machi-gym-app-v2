import { Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';
import { exerciseCreateSchema, exerciseListSchema, exerciseMediaSchema, exerciseStatusSchema, exerciseUpdateSchema, normalizeExerciseSearch, type ExerciseCreateInput } from '@machi-gym/contracts';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';

function currentInput(exercise: Exercise): ExerciseCreateInput {
  return { name: exercise.name, slug: exercise.slug, aliases: exercise.aliases, description: exercise.description, primaryMuscleGroup: exercise.primaryMuscleGroup, secondaryMuscleGroups: exercise.secondaryMuscleGroups, equipment: exercise.equipment, movementPattern: exercise.movementPattern, difficulty: exercise.difficulty, performanceMode: exercise.performanceMode, loadEntryConvention: exercise.loadEntryConvention, loadMultiplier: Number(exercise.loadMultiplier), instructions: exercise.instructions, commonMistakes: exercise.commonMistakes, cautionNotes: exercise.cautionNotes };
}
const mediaSelect = { id: true, type: true, url: true, source: true, licenseName: true, attributionText: true, licenseStatus: true, active: true } as const;
function publicRecord<T extends { aiEligible: boolean; version: number; media: unknown[] }>(record: T, role: Actor['role']): T | Omit<T, 'aiEligible' | 'version'> {
  if (role !== 'STUDENT') return record;
  const { aiEligible: _aiEligible, version: _version, ...studentView } = record;
  void _aiEligible; void _version;
  return studentView;
}

@Injectable()
export class ExerciseService {
  constructor(@Inject(Db) private readonly db: Db) {}

  private where(actor: Actor): Prisma.ExerciseWhereInput {
    return { organizationId: actor.organizationId, ...(actor.role === 'STUDENT' ? { active: true } : {}) };
  }
  private async owned(id: string, actor: Actor): Promise<Exercise> {
    const exercise = await this.db.exercise.findFirst({ where: { id: requireId(id), ...this.where(actor) } });
    if (!exercise) throw new NotFoundException();
    return exercise;
  }
  private async audit(actor: Actor, id: string, action: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action, resourceType: 'Exercise', resourceId: id } });
  }
  private async detail(id: string, actor: Actor) {
    let allowAssignedInactive = false;
    if (actor.role === 'STUDENT' && actor.studentId) {
      allowAssignedInactive = Boolean(await this.db.programmedExercise.findFirst({ where: { exerciseId: id, organizationId: actor.organizationId, workoutTemplate: { trainingPlanVersion: { assignments: { some: { studentId: actor.studentId, active: true } } } } }, select: { id: true } }));
    }
    const exercise = await this.db.exercise.findFirst({
      where: { id, organizationId: actor.organizationId, ...(actor.role === 'STUDENT' && !allowAssignedInactive ? { active: true } : {}) },
      include: { media: { where: actor.role === 'STUDENT' ? { active: true, licenseStatus: 'VERIFIED' } : {}, select: mediaSelect, orderBy: { createdAt: 'asc' } } },
    });
    if (!exercise) throw new NotFoundException();
    return publicRecord(exercise, actor.role);
  }
  get(id: string, actor: Actor) { return this.detail(requireId(id), actor); }

  async list(raw: unknown, actor: Actor) {
    const filters = input(exerciseListSchema, raw);
    const where: Prisma.ExerciseWhereInput = {
      ...this.where(actor),
      ...(actor.role !== 'STUDENT' && filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.muscle ? { OR: [{ primaryMuscleGroup: filters.muscle }, { secondaryMuscleGroups: { has: filters.muscle } }] } : {}),
      ...(filters.equipment ? { equipment: { has: filters.equipment } } : {}),
      ...(filters.pattern ? { movementPattern: filters.pattern } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters.q ? { searchText: { contains: normalizeExerciseSearch(filters.q) } } : {}),
    };
    if (filters.cursor && !(await this.db.exercise.findFirst({ where: { id: filters.cursor, ...this.where(actor) }, select: { id: true } }))) throw new NotFoundException();
    const rows = await this.db.exercise.findMany({ where, orderBy: { id: 'asc' }, take: 25, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), include: { media: { where: { active: true, licenseStatus: 'VERIFIED', type: 'THUMBNAIL' }, select: mediaSelect, take: 1 } } });
    const hasMore = rows.length > 24;
    return { items: rows.slice(0, 24).map((row) => publicRecord(row, actor.role)), nextCursor: hasMore ? rows[23]?.id ?? null : null, hasMore };
  }

  async create(raw: unknown, actor: Actor) {
    const values = input(exerciseCreateSchema, raw);
    try {
      const created = await this.db.$transaction(async (tx) => {
        const row = await tx.exercise.create({ data: { ...values, organizationId: actor.organizationId, searchText: normalizeExerciseSearch([values.name, ...values.aliases].join(' ')) } });
        await this.audit(actor, row.id, 'EXERCISE_CREATED', tx);
        return row;
      });
      return this.detail(created.id, actor);
    } catch (error) { this.unique(error); }
  }
  async update(id: string, raw: unknown, actor: Actor) {
    const patch = input(exerciseUpdateSchema, raw);
    const existing = await this.owned(id, actor);
    const { version: _version, ...fields } = patch;
    void _version;
    const merged = input(exerciseCreateSchema, { ...currentInput(existing), ...fields });
    try {
      await this.db.$transaction(async (tx) => {
        const result = await tx.exercise.updateMany({ where: { id: existing.id, organizationId: actor.organizationId, version: patch.version }, data: { ...merged, aliases: { set: merged.aliases }, secondaryMuscleGroups: { set: merged.secondaryMuscleGroups }, equipment: { set: merged.equipment }, searchText: normalizeExerciseSearch([merged.name, ...merged.aliases].join(' ')), version: { increment: 1 } } });
        if (result.count !== 1) throw new ConflictException('Exercise changed; refresh and retry');
        await this.audit(actor, existing.id, 'EXERCISE_UPDATED', tx);
      });
      return this.detail(existing.id, actor);
    } catch (error) { this.unique(error); }
  }
  async status(id: string, raw: unknown, actor: Actor) {
    const { active, aiEligible, version } = input(exerciseStatusSchema, raw);
    const existing = await this.owned(id, actor);
    await this.db.$transaction(async (tx) => {
      const result = await tx.exercise.updateMany({ where: { id: existing.id, organizationId: actor.organizationId, version }, data: { ...(active === undefined ? {} : { active }), ...(aiEligible === undefined ? {} : { aiEligible }), version: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException('Exercise changed; refresh and retry');
      await this.audit(actor, id, active === undefined ? 'EXERCISE_AI_ELIGIBILITY_CHANGED' : active ? 'EXERCISE_ACTIVATED' : 'EXERCISE_DEACTIVATED', tx);
    });
    return this.detail(id, actor);
  }
  async addMedia(id: string, raw: unknown, actor: Actor) {
    const values = input(exerciseMediaSchema, raw);
    await this.owned(id, actor);
    try {
      const media = await this.db.exerciseMedia.create({ data: { ...values, organizationId: actor.organizationId, exerciseId: id, active: false, licenseStatus: 'PENDING' }, select: mediaSelect });
      return media;
    } catch (error) { this.unique(error); }
  }
  async verifyMedia(id: string, mediaId: string, actor: Actor) {
    await this.owned(id, actor);
    const media = await this.db.exerciseMedia.findFirst({ where: { id: requireId(mediaId), exerciseId: id, organizationId: actor.organizationId, licenseStatus: 'PENDING' } });
    if (!media) throw new NotFoundException();
    // Media URLs are restricted by Zod and the database to bundled original assets.
    try {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.exerciseMedia.updateMany({ where: { id: media.id, exerciseId: id, organizationId: actor.organizationId, licenseStatus: 'PENDING' }, data: { licenseStatus: 'VERIFIED', verifiedAt: new Date(), verifiedByMembershipId: actor.membershipId, active: true } });
        if (updated.count !== 1) throw new ConflictException('Media already reviewed');
        await this.audit(actor, id, 'EXERCISE_MEDIA_VERIFIED', tx);
      });
      return this.detail(id, actor);
    } catch (error) { this.unique(error); }
  }
  private unique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Exercise name, slug or media already exists');
    throw error;
  }
}

@Controller('exercises')
export class ExerciseController {
  constructor(@Inject(ExerciseService) private readonly service: ExerciseService) {}
  @Get() list(@Req() req: AppRequest, @Query() filters: unknown) { return this.service.list(filters, req.actor!); }
  @Get(':id') get(@Req() req: AppRequest, @Param('id') id: string) { return this.service.get(id, req.actor!); }
  @Post() @Roles('ADMIN', 'TRAINER') create(@Req() req: AppRequest, @Body() body: unknown) { return this.service.create(body, req.actor!); }
  @Patch(':id') @Roles('ADMIN', 'TRAINER') update(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.update(id, body, req.actor!); }
  @Patch(':id/status') @Roles('ADMIN', 'TRAINER') status(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.status(id, body, req.actor!); }
  @Post(':id/media') @Roles('ADMIN', 'TRAINER') media(@Req() req: AppRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.addMedia(id, body, req.actor!); }
  @Post(':id/media/:mediaId/verify') @Roles('ADMIN', 'TRAINER') verify(@Req() req: AppRequest, @Param('id') id: string, @Param('mediaId') mediaId: string) { return this.service.verifyMedia(id, mediaId, req.actor!); }
}
