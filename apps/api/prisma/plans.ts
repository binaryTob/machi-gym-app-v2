import { PrismaClient, TrainingGoal } from '@prisma/client';
import * as argon2 from 'argon2';

export async function seedDemoProgram(db: PrismaClient, organizationId: string, ownerMembershipId: string, studentPassword: string): Promise<void> {
  if (studentPassword.length < 12) throw new Error('SEED_STUDENT_PASSWORD must be at least 12 characters');
  const studentId = `demo-student-${organizationId}`;
  const planId = `demo-plan-${organizationId}`;
  const studentEmail = `demo-${organizationId}@example.test`;
  const owner = await db.trainerProfile.findUniqueOrThrow({ where: { membershipId: ownerMembershipId } });
  if (!(await db.studentProfile.findUnique({ where: { id: studentId } }))) {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: studentEmail, displayName: 'Alumno de demostración', passwordHash: await argon2.hash(studentPassword) } });
      const membership = await tx.membership.create({ data: { organizationId, userId: user.id, role: 'STUDENT' } });
      await tx.studentProfile.create({ data: { id: studentId, organizationId, membershipId: membership.id, displayName: 'Alumno de demostración', contactEmail: studentEmail, trainingFrequencyPerWeek: 3, primaryGoal: TrainingGoal.GENERAL_FITNESS, experienceLevel: 'BEGINNER' } });
      await tx.trainerStudentAssignment.create({ data: { organizationId, trainerId: owner.id, studentId } });
    });
  }
  if (!(await db.trainingPlan.findUnique({ where: { id: planId } }))) {
    const slugs = ['sentadilla-goblet', 'press-banca-barra', 'remo-sentado-polea', 'peso-muerto-rumano', 'press-militar-barra', 'jalon-pecho-polea'];
    const catalog = await db.exercise.findMany({ where: { organizationId, slug: { in: slugs }, active: true } });
    if (catalog.length !== slugs.length) throw new Error('Seed Phase 2 exercise library before seeding a demo plan');
    const bySlug = new Map(catalog.map((exercise) => [exercise.slug, exercise]));
    const versionId = `demo-version-${organizationId}`;
    await db.$transaction(async (tx) => {
      await tx.trainingPlan.create({ data: { id: planId, organizationId, createdByMembershipId: ownerMembershipId, name: 'Programa base · 3 sesiones', description: 'Dos entrenamientos de cuerpo completo que se alternan según disponibilidad.', goal: 'GENERAL_FITNESS' } });
      await tx.trainingPlanVersion.create({ data: { id: versionId, organizationId, trainingPlanId: planId, versionNumber: 1, title: 'Programa base · 3 sesiones', description: 'Cuerpo completo A/B sin días fijos de calendario.', goal: 'GENERAL_FITNESS', createdByMembershipId: ownerMembershipId } });
      for (const [index, template] of [
        { id: `demo-workout-a-${organizationId}`, name: 'Cuerpo completo A', exercises: slugs.slice(0, 3) },
        { id: `demo-workout-b-${organizationId}`, name: 'Cuerpo completo B', exercises: slugs.slice(3, 6) },
      ].entries()) {
        await tx.workoutTemplate.create({ data: { id: template.id, organizationId, trainingPlanVersionId: versionId, name: template.name, order: index + 1, expectedDurationMinutes: 50, dayLabel: `Sesión ${index === 0 ? 'A' : 'B'}` } });
        for (const [position, slug] of template.exercises.entries()) {
          const exercise = bySlug.get(slug)!;
          await tx.programmedExercise.create({ data: {
            id: `demo-entry-${slug}-${organizationId}`, organizationId, workoutTemplateId: template.id, exerciseId: exercise.id,
            order: position + 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'RIR', targetRir: 2, restSeconds: 90,
            exerciseVersionSnapshot: exercise.version, exerciseNameSnapshot: exercise.name, primaryMuscleSnapshot: exercise.primaryMuscleGroup,
            performanceModeSnapshot: exercise.performanceMode, loadEntryConventionSnapshot: exercise.loadEntryConvention,
            loadMultiplierSnapshot: exercise.loadMultiplier, instructionsSnapshot: exercise.instructions,
            commonMistakesSnapshot: exercise.commonMistakes, cautionNotesSnapshot: exercise.cautionNotes,
          } });
        }
      }
      await tx.trainingPlanVersion.update({ where: { id: versionId }, data: { status: 'ACTIVE', publishedAt: new Date(), publishedByMembershipId: ownerMembershipId } });
      await tx.trainingPlan.update({ where: { id: planId }, data: { status: 'ACTIVE' } });
    });
  }
  if (!(await db.studentPlanAssignment.findFirst({ where: { organizationId, studentId } }))) {
    await db.studentPlanAssignment.create({ data: {
      organizationId, studentId, trainingPlanId: planId, trainingPlanVersionId: `demo-version-${organizationId}`,
      assignedByMembershipId: ownerMembershipId, startDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 1)),
    } });
  }
}
