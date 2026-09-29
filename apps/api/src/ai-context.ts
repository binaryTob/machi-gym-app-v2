import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type AiProposal, type aiRequestSchema } from '@machi-gym/contracts';
import { z } from 'zod';
import { AnalyticsService } from './analytics';
import { localDate, periodFor } from './analytics-calculations';
import { Actor, Db } from './common';
import { StudentService } from './students';

type Request = z.infer<typeof aiRequestSchema>;
export type TrainingContext = {
  version: 'training-context-v1'; type: Request['type'];
  student: { goal: string | null; frequency: number | null; availableDays: string[]; sessionMinutes: number | null; experience: string | null; activityLevel: string | null; ageBand: string | null; heightCm: number | null; latestRecordedWeightKg: number | null };
  untrustedStudentDeclarations: { constraints: { type: string; description: string }[]; activities: { name: string; weeklyFrequency: number | null }[] };
  analytics: { period: { start: string; end: string }; adherencePercent: number | null; averageRpe: number | null; recovery: Record<string, number>; volumeKgReps: number | null; weightDeltaKg: number | null; partialReasons: Record<string, number>; discomfort: { bodyRegion: string; count: number; averageIntensity: number | null }[]; exerciseProgress: { exerciseId: string; name: string; current: unknown; previous: unknown }[]; terminalSessions: number };
  currentPlan: null | { versionId: string; planId: string; title: string; goal: string; versionNumber: number; workouts: { name: string; estimatedDurationMinutes: number | null; exercises: { exerciseId: string; sets: number; repsMin: number; repsMax: number; targetRir: number | null; restSeconds: number }[] }[] };
  allowedExercises: { exerciseId: string; catalogVersion: number; name: string; primaryMuscle: string; secondaryMuscles: string[]; equipment: string[]; movementPattern: string; difficulty: string; cautionNotes: string | null; performanceMode: string; loadConvention: string | null }[];
};

export function validateAiProposal(proposal: AiProposal, context: TrainingContext): string[] {
  const errors: string[] = [];
  if (context.student.frequency !== null && proposal.workouts.length > context.student.frequency) errors.push('La cantidad de sesiones excede la frecuencia declarada');
  if (context.student.availableDays.length && proposal.workouts.length > new Set(context.student.availableDays).size) errors.push('Hay más sesiones que días disponibles');
  if (context.student.goal && proposal.goal !== context.student.goal && context.type === 'INITIAL') errors.push('El objetivo no coincide con el perfil');
  const allowed = new Map(context.allowedExercises.map((exercise) => [exercise.exerciseId, exercise]));
  for (const workout of proposal.workouts) {
    if (context.student.sessionMinutes !== null && workout.estimatedDurationMinutes > context.student.sessionMinutes) errors.push('La duración supera la disponible');
    const minimumSeconds = workout.exercises.reduce((total, entry) => total + entry.sets * 30 + (entry.sets - 1) * entry.restSeconds, 0);
    if (minimumSeconds > workout.estimatedDurationMinutes * 60) errors.push('Las series y descansos no caben en la duración propuesta');
    for (const entry of workout.exercises) {
      const exercise = allowed.get(entry.exerciseId);
      if (!exercise) errors.push('ID de ejercicio ajeno, inactivo, excluido o desconocido');
      else if (exercise.performanceMode === 'REPS_ONLY' && entry.suggestedLoadKg !== null) errors.push('Un ejercicio sin carga externa no acepta carga sugerida');
    }
  }
  if (context.type === 'ADAPTATION' && !context.currentPlan) errors.push('Falta la versión de origen');
  return [...new Set(errors)];
}

@Injectable()
export class TrainingContextBuilder {
  constructor(@Inject(Db) private readonly db: Db, @Inject(StudentService) private readonly students: StudentService, @Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  async build(studentId: string, actor: Actor, request: Request): Promise<{ context: TrainingContext; hash: string; summary: Record<string, unknown> }> {
    await this.students.ensure(studentId, actor);
    const profile = await this.db.studentProfile.findFirstOrThrow({ where: { id: studentId, organizationId: actor.organizationId },
      select: { birthDate: true, heightCm: true, primaryGoal: true, trainingFrequencyPerWeek: true, availableDays: true, approximateSessionMinutes: true, experienceLevel: true, activityLevel: true, planningRevision: true, timezone: true,
        organization: { select: { timezone: true } }, constraints: { where: { active: true }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, description: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 10, select: { name: true, weeklyFrequency: true } },
        weights: { orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }], take: 1, select: { weightKg: true } } } });
    const allowedRows = await this.db.exercise.findMany({ where: { organizationId: actor.organizationId, active: true, aiEligible: true }, orderBy: { id: 'asc' }, take: 101,
      select: { id: true, version: true, name: true, primaryMuscleGroup: true, secondaryMuscleGroups: true, equipment: true, movementPattern: true, difficulty: true, cautionNotes: true, performanceMode: true, loadEntryConvention: true } });
    if (allowedRows.length > 100) throw new BadRequestException('El catálogo habilitado para IA supera el límite de contexto');
    if (request.excludedExerciseIds.some((id) => !allowedRows.some((row) => row.id === id))) throw new BadRequestException('Un ejercicio excluido no pertenece al catálogo habilitado');
    const excluded = new Set(request.excludedExerciseIds);
    const allowedExercises = allowedRows.filter((row) => !excluded.has(row.id) && !row.equipment.some((item) => request.unavailableEquipment.includes(item)))
      .map((row) => ({ exerciseId: row.id, catalogVersion: row.version, name: row.name, primaryMuscle: row.primaryMuscleGroup, secondaryMuscles: row.secondaryMuscleGroups,
        equipment: row.equipment, movementPattern: row.movementPattern, difficulty: row.difficulty, cautionNotes: row.cautionNotes?.slice(0, 250) ?? null, performanceMode: row.performanceMode, loadConvention: row.loadEntryConvention }));
    if (!allowedExercises.length) throw new BadRequestException('No hay ejercicios habilitados para IA con el equipamiento y exclusiones indicados');
    const assignment = await this.db.studentPlanAssignment.findFirst({ where: { studentId, organizationId: actor.organizationId, active: true },
      include: { planVersion: { include: { workouts: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' } } } } } } } });
    if (request.type === 'ADAPTATION' && !assignment) throw new BadRequestException('Se requiere un plan asignado para adaptar');
    const timezone = profile.timezone ?? profile.organization.timezone;
    const period = periodFor('last-30-days', timezone, new Date());
    const today = localDate(new Date(), timezone);
    const birth = profile.birthDate?.toISOString().slice(0, 10);
    const age = birth ? Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0) : null;
    const ageBand = age === null ? null : age < 18 ? 'menor de 18' : age < 25 ? '18–24' : age < 35 ? '25–34' : age < 50 ? '35–49' : age < 65 ? '50–64' : '65+';
    const metrics = await this.analytics.period(studentId, actor, { period: 'last-30-days' });
    const terminalSessions = await this.db.workoutSession.findMany({ where: { organizationId: actor.organizationId, studentId, status: { in: ['COMPLETED', 'PARTIAL'] }, finishedAt: { gte: new Date(Date.parse(`${period.start}T00:00:00Z`) - 86_400_000) } }, select: { finishedAt: true }, take: 100 });
    const count = terminalSessions.filter((row) => row.finishedAt && localDate(row.finishedAt, timezone) >= period.start && localDate(row.finishedAt, timezone) < period.end).length;
    if (request.type === 'ADAPTATION' && count < 3) throw new BadRequestException('Hay pocos datos de entrenamiento para generar una adaptación basada en progreso (mínimo tres sesiones finalizadas recientes)');
    const version = request.type === 'ADAPTATION' ? assignment!.planVersion : null;
    const currentPlan = version ? { versionId: version.id, planId: version.trainingPlanId, title: version.title, goal: version.goal, versionNumber: version.versionNumber,
      workouts: version.workouts.map((row) => ({ name: row.name, estimatedDurationMinutes: row.expectedDurationMinutes,
        exercises: row.exercises.map((entry) => ({ exerciseId: entry.exerciseId, sets: entry.targetSets, repsMin: entry.targetRepsMin, repsMax: entry.targetRepsMax, targetRir: entry.targetRir, restSeconds: entry.restSeconds })) })) } : null;
    const context: TrainingContext = { version: 'training-context-v1', type: request.type,
      student: { goal: profile.primaryGoal, frequency: profile.trainingFrequencyPerWeek, availableDays: profile.availableDays, sessionMinutes: profile.approximateSessionMinutes,
        experience: profile.experienceLevel, activityLevel: profile.activityLevel, ageBand, heightCm: profile.heightCm === null ? null : Number(profile.heightCm), latestRecordedWeightKg: profile.weights[0] ? Number(profile.weights[0].weightKg) : null },
      untrustedStudentDeclarations: { constraints: profile.constraints.map((row) => ({ type: row.type, description: row.description.slice(0, 250) })), activities: profile.activities.map((row) => ({ name: row.name.slice(0, 120), weeklyFrequency: row.weeklyFrequency })) },
      analytics: { period: { start: period.start, end: period.end }, adherencePercent: metrics.adherence.adherencePercent,
        averageRpe: metrics.feedback.averageRpe, recovery: metrics.feedback.recovery, volumeKgReps: metrics.volume.volumeKgReps, weightDeltaKg: metrics.weights.deltaKg, partialReasons: metrics.partialReasons,
        discomfort: metrics.discomfort.map((row) => ({ bodyRegion: row.bodyRegion, count: row.count, averageIntensity: row.averageIntensity })),
        exerciseProgress: metrics.exerciseProgress.slice(0, 30).map((row) => ({ exerciseId: row.exerciseId, name: row.name, current: row.current, previous: row.previous })), terminalSessions: count },
      currentPlan, allowedExercises };
    const hash = createHash('sha256').update(JSON.stringify(context)).digest('hex');
    const summary = { contextVersion: context.version, contextHash: hash, profileRevision: profile.planningRevision,
      excludedExerciseIds: request.excludedExerciseIds, unavailableEquipment: request.unavailableEquipment,
      sourceVersionId: currentPlan?.versionId ?? null, allowedExerciseIds: allowedExercises.map((row) => row.exerciseId),
      period: context.analytics.period, adherencePercent: context.analytics.adherencePercent, averageRpe: context.analytics.averageRpe,
      volumeKgReps: context.analytics.volumeKgReps, weightDeltaKg: context.analytics.weightDeltaKg, recovery: context.analytics.recovery,
      discomfort: context.analytics.discomfort, terminalSessions: count, partialReasons: context.analytics.partialReasons };
    return { context, hash, summary };
  }
}
