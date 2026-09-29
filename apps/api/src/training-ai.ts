import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Patch, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { AiTrainingProposal, Prisma } from '@prisma/client';
import { aiDecisionSchema, aiEditSchema, aiProposalSchema, aiRejectSchema, aiRequestSchema, type AiProposal } from '@machi-gym/contracts';
import { z } from 'zod';
import { TrainingContextBuilder, validateAiProposal, type TrainingContext } from './ai-context';
import { AiProviderConfig, type AiProvider } from './ai-provider';
import { Actor, AppRequest, Db, input, requireId, Roles } from './common';
import { StudentService } from './students';

type Request = z.infer<typeof aiRequestSchema>;

@Injectable()
export class TrainingAiService {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService,
    @Inject(TrainingContextBuilder) private readonly builder: TrainingContextBuilder, @Inject(AiProviderConfig) private readonly config: AiProviderConfig) {}

  availability() { return { enabled: this.config.provider !== null }; }
  private async owned(id: string, actor: Actor) {
    const row = await this.db.aiTrainingProposal.findFirst({ where: { id: requireId(id), organizationId: actor.organizationId,
      ...(actor.role === 'TRAINER' ? { student: { assignments: { some: { active: true, trainerId: actor.trainerId ?? '__none__' } } } } : {}) } });
    if (!row) throw new NotFoundException();
    return row;
  }
  async list(studentId: string, actor: Actor) {
    await this.students.ensure(studentId, actor);
    return this.db.aiTrainingProposal.findMany({ where: { organizationId: actor.organizationId, studentId }, orderBy: { createdAt: 'desc' }, take: 20 });
  }
  async preview(studentId: string, actor: Actor) {
    const { context } = await this.builder.build(studentId, actor, { requestKey: '00000000-0000-4000-8000-000000000000', type: 'INITIAL', excludedExerciseIds: [], unavailableEquipment: [] });
    return { student: context.student, analytics: context.analytics, allowedExercises: context.allowedExercises.map((row) => ({ exerciseId: row.exerciseId, name: row.name, equipment: row.equipment })) };
  }
  async get(id: string, actor: Actor) {
    const row = await this.owned(id, actor);
    const summary = row.contextSummary as { allowedExerciseIds?: string[] };
    const catalog = await this.db.exercise.findMany({ where: { organizationId: actor.organizationId, id: { in: summary.allowedExerciseIds ?? [] }, active: true, aiEligible: true },
      select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return { ...row, catalog };
  }

  private provider(): AiProvider {
    const provider = this.config.provider;
    if (!provider) throw new ServiceUnavailableException('La generación con IA no está configurada');
    return provider;
  }
  private async generate(row: AiTrainingProposal, context: TrainingContext, provider: AiProvider) {
    try {
      const unknown: unknown = await provider.generateStructured<unknown>({ context, promptVersion: row.promptVersion });
      const parsed = aiProposalSchema.safeParse(unknown);
      const errors = parsed.success ? validateAiProposal(parsed.data, context) : parsed.error.issues.map((issue) => issue.path.join('.') || 'Formato de propuesta inválido');
      if (errors.length) {
        return this.db.aiTrainingProposal.update({ where: { id: row.id }, data: { status: 'VALIDATION_FAILED', validationResult: { valid: false, errors: errors.slice(0, 30) }, revision: { increment: 1 } } });
      }
      return this.db.aiTrainingProposal.update({ where: { id: row.id }, data: { status: 'READY', originalProposal: parsed.data as Prisma.InputJsonValue,
        validationResult: { valid: true, errors: [] }, revision: { increment: 1 } } });
    } catch {
      return this.db.aiTrainingProposal.update({ where: { id: row.id }, data: { status: 'PROVIDER_FAILED', validationResult: { valid: false, errors: ['El proveedor no respondió o devolvió datos inválidos'] }, revision: { increment: 1 } } });
    }
  }

  async request(studentId: string, raw: unknown, actor: Actor) {
    const fields = input(aiRequestSchema, raw);
    await this.students.ensure(studentId, actor);
    const prior = await this.db.aiTrainingProposal.findUnique({ where: { organizationId_requestKey: { organizationId: actor.organizationId, requestKey: fields.requestKey } } });
    if (prior) {
      if (prior.studentId !== studentId || prior.requestedByMembershipId !== actor.membershipId || prior.type !== fields.type) throw new ConflictException('Clave de solicitud ya utilizada');
      const previous = prior.contextSummary as { excludedExerciseIds: string[]; unavailableEquipment: Request['unavailableEquipment'] };
      if (JSON.stringify(previous.excludedExerciseIds) !== JSON.stringify(fields.excludedExerciseIds) || JSON.stringify(previous.unavailableEquipment) !== JSON.stringify(fields.unavailableEquipment))
        throw new ConflictException('La clave de solicitud corresponde a otros límites de generación');
      return prior;
    }
    if (await this.db.aiTrainingProposal.count({ where: { organizationId: actor.organizationId, studentId,
      createdAt: { gte: new Date(Date.now() - 86_400_000) } } }) >= 10) throw new ConflictException('Límite diario de propuestas alcanzado para este alumno');
    const provider = this.provider();
    const { context, hash, summary } = await this.builder.build(studentId, actor, fields);
    const promptVersion = fields.type === 'INITIAL' ? 'training-generation-v1' : 'training-adaptation-v1';
    let row: AiTrainingProposal;
    try {
      row = await this.db.aiTrainingProposal.create({ data: { organizationId: actor.organizationId, studentId, requestedByMembershipId: actor.membershipId,
        requestKey: fields.requestKey, type: fields.type, sourceVersionId: context.currentPlan?.versionId ?? null, provider: provider.providerName,
        model: provider.modelName, promptVersion, contextVersion: context.version, contextHash: hash,
        contextSummary: summary as Prisma.InputJsonValue, validationResult: { valid: false, errors: [] } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Solicitud simultánea; recargá la propuesta');
      throw error;
    }
    return this.generate(row, context, provider);
  }

  async retry(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(aiDecisionSchema, raw);
    const row = await this.owned(id, actor);
    const stale = row.status === 'GENERATING' && row.updatedAt.getTime() < Date.now() - 60_000;
    if (!stale && !['PROVIDER_FAILED', 'VALIDATION_FAILED'].includes(row.status)) throw new ConflictException('Sólo se puede reintentar una propuesta fallida o interrumpida');
    if (row.attempts >= 3) throw new ConflictException('Se agotaron los reintentos de esta propuesta');
    const provider = this.provider();
    const summary = row.contextSummary as { excludedExerciseIds: string[]; unavailableEquipment: Request['unavailableEquipment'] };
    const { context, hash } = await this.builder.build(row.studentId, actor, { requestKey: row.requestKey, type: row.type, excludedExerciseIds: summary.excludedExerciseIds, unavailableEquipment: summary.unavailableEquipment });
    if (hash !== row.contextHash || provider.providerName !== row.provider || provider.modelName !== row.model) throw new ConflictException('El contexto o proveedor cambió; solicitá una propuesta nueva');
    const claimed = await this.db.aiTrainingProposal.updateMany({ where: { id, organizationId: actor.organizationId, revision,
      attempts: { lt: 3 }, OR: [{ status: { in: ['PROVIDER_FAILED', 'VALIDATION_FAILED'] } }, { status: 'GENERATING', updatedAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { status: 'GENERATING', revision: { increment: 1 }, attempts: { increment: 1 } } });
    if (!claimed.count) throw new ConflictException('La propuesta ya cambió');
    return this.generate(row, context, provider);
  }

  async edit(id: string, raw: unknown, actor: Actor) {
    const { revision, proposal } = input(aiEditSchema, raw);
    const row = await this.owned(id, actor);
    if (row.status !== 'READY') throw new ConflictException('La propuesta no está lista para editar');
    const context = await this.reviewContext(row, actor);
    const errors = validateAiProposal(proposal, context);
    if (errors.length) throw new BadRequestException(errors.join('; '));
    const changed = await this.db.aiTrainingProposal.updateMany({ where: { id, organizationId: actor.organizationId, status: 'READY', revision },
      data: { editedProposal: proposal as Prisma.InputJsonValue, revision: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('La propuesta cambió; actualizá la página');
    return this.owned(id, actor);
  }

  private async reviewContext(row: AiTrainingProposal, actor: Actor) {
    const summary = row.contextSummary as { excludedExerciseIds: string[]; unavailableEquipment: Request['unavailableEquipment']; profileRevision: number };
    const profile = await this.db.studentProfile.findFirst({ where: { id: row.studentId, organizationId: actor.organizationId }, select: { planningRevision: true } });
    if (!profile || profile.planningRevision !== summary.profileRevision) throw new ConflictException('Cambió el perfil; generá una propuesta nueva');
    const { context } = await this.builder.build(row.studentId, actor, { requestKey: row.requestKey, type: row.type,
      excludedExerciseIds: summary.excludedExerciseIds, unavailableEquipment: summary.unavailableEquipment });
    if (row.type === 'ADAPTATION' && row.sourceVersionId !== context.currentPlan?.versionId) throw new ConflictException('Cambió la asignación; generá una propuesta nueva');
    return context;
  }

  async reject(id: string, raw: unknown, actor: Actor) {
    const { revision, reason } = input(aiRejectSchema, raw);
    await this.owned(id, actor);
    const changed = await this.db.aiTrainingProposal.updateMany({ where: { id, organizationId: actor.organizationId, status: 'READY', revision },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedByMembershipId: actor.membershipId, rejectionReason: reason, revision: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('La propuesta ya cambió');
    return this.owned(id, actor);
  }

  async approve(id: string, raw: unknown, actor: Actor) {
    const { revision } = input(aiDecisionSchema, raw);
    const row = await this.owned(id, actor);
    if (row.status !== 'READY') throw new ConflictException('La propuesta no está lista');
    const context = await this.reviewContext(row, actor);
    const proposal: AiProposal = input(aiProposalSchema, row.editedProposal ?? row.originalProposal);
    const errors = validateAiProposal(proposal, context);
    if (errors.length) throw new BadRequestException(errors.join('; '));
    const created = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentProfile" WHERE "id" = ${row.studentId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "AiTrainingProposal" WHERE "id" = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
      const current = await tx.aiTrainingProposal.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'READY' || current.revision !== revision) throw new ConflictException('La propuesta ya cambió');
      const profile = await tx.studentProfile.findUniqueOrThrow({ where: { id: row.studentId }, select: { planningRevision: true } });
      if (profile.planningRevision !== (row.contextSummary as { profileRevision: number }).profileRevision) throw new ConflictException('El perfil cambió');
      // Recheck the selected catalog under row locks before any draft is written.
      for (const exerciseId of new Set(proposal.workouts.flatMap((workout) => workout.exercises.map((entry) => entry.exerciseId)))) {
        await tx.$queryRaw`SELECT "id" FROM "Exercise" WHERE "id" = ${exerciseId} AND "organizationId" = ${actor.organizationId} FOR SHARE`;
        const catalog = await tx.exercise.findFirst({ where: { id: exerciseId, organizationId: actor.organizationId, active: true, aiEligible: true }, select: { version: true } });
        if (!catalog || catalog.version !== context.allowedExercises.find((entry) => entry.exerciseId === exerciseId)?.catalogVersion) throw new ConflictException('Cambió el catálogo; revisá la propuesta');
      }
      let planId: string; let versionNumber = 1;
      if (row.type === 'ADAPTATION') {
        const assignment = await tx.studentPlanAssignment.findFirst({ where: { organizationId: actor.organizationId, studentId: row.studentId, active: true, trainingPlanVersionId: row.sourceVersionId! } });
        if (!assignment) throw new ConflictException('Cambió la versión asignada');
        await tx.$queryRaw`SELECT "id" FROM "TrainingPlan" WHERE "id" = ${assignment.trainingPlanId} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
        const plan = await tx.trainingPlan.findFirst({ where: { id: assignment.trainingPlanId, organizationId: actor.organizationId, status: 'ACTIVE' } });
        if (!plan || await tx.trainingPlanVersion.findFirst({ where: { trainingPlanId: plan.id, status: 'DRAFT' } })) throw new ConflictException('Ya existe un borrador o el plan cambió');
        planId = plan.id;
        versionNumber = (await tx.trainingPlanVersion.aggregate({ where: { trainingPlanId: plan.id }, _max: { versionNumber: true } }))._max.versionNumber! + 1;
        await tx.trainingPlan.update({ where: { id: planId }, data: { version: { increment: 1 } } });
      } else {
        const plan = await tx.trainingPlan.create({ data: { organizationId: actor.organizationId, createdByMembershipId: actor.membershipId, name: proposal.planName,
          description: proposal.summary, goal: proposal.goal } });
        planId = plan.id;
      }
      const version = await tx.trainingPlanVersion.create({ data: { organizationId: actor.organizationId, trainingPlanId: planId, versionNumber,
        title: proposal.planName, description: proposal.summary, goal: proposal.goal, createdByMembershipId: actor.membershipId } });
      for (const [order, workout] of proposal.workouts.entries()) {
        const template = await tx.workoutTemplate.create({ data: { organizationId: actor.organizationId, trainingPlanVersionId: version.id,
          order: order + 1, name: workout.name, expectedDurationMinutes: workout.estimatedDurationMinutes } });
        for (const [position, entry] of workout.exercises.entries()) await tx.programmedExercise.create({ data: {
          organizationId: actor.organizationId, workoutTemplateId: template.id, order: position + 1, exerciseId: entry.exerciseId,
          targetSets: entry.sets, targetRepsMin: entry.repsMin, targetRepsMax: entry.repsMax, intensityMode: entry.intensityMode,
          targetRir: entry.targetRir, targetRpe: entry.targetRpe, restSeconds: entry.restSeconds, suggestedLoadKg: entry.suggestedLoadKg,
          trainerNotes: entry.reason,
        } });
      }
      await tx.aiTrainingProposal.update({ where: { id }, data: { status: 'APPROVED', approvedVersionId: version.id, reviewedAt: new Date(), reviewedByMembershipId: actor.membershipId, revision: { increment: 1 } } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId, action: 'AI_PROPOSAL_APPROVED_TO_DRAFT', resourceType: 'AiTrainingProposal', resourceId: id } });
      return { planId, versionId: version.id };
    });
    return created;
  }
}

@Controller()
export class TrainingAiController {
  constructor(@Inject(TrainingAiService) private readonly service: TrainingAiService) {}
  @Get('trainer/ai/availability') @Roles('ADMIN', 'TRAINER') availability() { return this.service.availability(); }
  @Get('students/:id/ai-context') @Roles('ADMIN', 'TRAINER') preview(@Param('id') id: string, @Req() req: AppRequest) { return this.service.preview(id, req.actor!); }
  @Get('students/:id/ai-proposals') @Roles('ADMIN', 'TRAINER') list(@Param('id') id: string, @Req() req: AppRequest) { return this.service.list(id, req.actor!); }
  @Post('students/:id/ai-proposals') @Roles('ADMIN', 'TRAINER') request(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.request(id, body, req.actor!); }
  @Get('ai-proposals/:id') @Roles('ADMIN', 'TRAINER') get(@Param('id') id: string, @Req() req: AppRequest) { return this.service.get(id, req.actor!); }
  @Post('ai-proposals/:id/retry') @Roles('ADMIN', 'TRAINER') retry(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.retry(id, body, req.actor!); }
  @Patch('ai-proposals/:id') @Roles('ADMIN', 'TRAINER') edit(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.edit(id, body, req.actor!); }
  @Post('ai-proposals/:id/reject') @Roles('ADMIN', 'TRAINER') reject(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.reject(id, body, req.actor!); }
  @Post('ai-proposals/:id/approve') @Roles('ADMIN', 'TRAINER') approve(@Param('id') id: string, @Body() body: unknown, @Req() req: AppRequest) { return this.service.approve(id, body, req.actor!); }
}
