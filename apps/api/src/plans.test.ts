import 'reflect-metadata';
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { AppModule } from './module';
import { Db, Envelope, Problems } from './common';
import { seedExercises } from '../prisma/exercises';

const origin = 'http://localhost:3000';
const password = 'plan-test-password-12345';
type Session = { cookie: string; csrf: string };
function session(response: request.Response): Session {
  const raw = response.headers['set-cookie'] as unknown;
  if (!Array.isArray(raw)) throw new Error('No cookies');
  const cookie = raw.map((value: string) => value.split(';')[0]).join('; ');
  return { cookie, csrf: decodeURIComponent((cookie.match(/machi_csrf=([^;]+)/) ?? [])[1] ?? '') };
}
const headers = (actor: Session) => ({ Cookie: actor.cookie, Origin: origin, 'X-CSRF-Token': actor.csrf });

describe('Phase 3 prescribed programs and assignment provenance', () => {
  let app: INestApplication; let db: Db; let owner: Session; let student: Session; let other: Session;
  let studentId: string; let otherStudentId: string; let orgId: string; let ownerMembershipId: string; let exerciseId: string; let otherExerciseId: string;
  let planId: string; let versionId: string; let versionNumber: number;
  beforeAll(async () => {
    process.env.WEB_ORIGIN = origin;
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api/v1'); app.useGlobalInterceptors(new Envelope()); app.useGlobalFilters(new Problems()); await app.init(); db = app.get(Db);
    const orgA = await db.organization.create({ data: { name: 'Plan A' } }); const orgB = await db.organization.create({ data: { name: 'Plan B' } }); orgId = orgA.id;
    async function account(organizationId: string, role: 'ADMIN' | 'STUDENT') {
      const email = `plan-${randomUUID()}@example.test`;
      const user = await db.user.create({ data: { email, passwordHash: await argon2.hash(password), displayName: role } });
      const membership = await db.membership.create({ data: { organizationId, userId: user.id, role } });
      if (role === 'ADMIN') await db.trainerProfile.create({ data: { organizationId, membershipId: membership.id } });
      else {
        const profile = await db.studentProfile.create({ data: { organizationId, membershipId: membership.id, contactEmail: email, displayName: 'Alumno prueba' } });
        const trainer = await db.trainerProfile.findFirst({ where: { organizationId } });
        if (trainer) await db.trainerStudentAssignment.create({ data: { organizationId, trainerId: trainer.id, studentId: profile.id } });
        if (organizationId === orgA.id) studentId = profile.id; else otherStudentId = profile.id;
      }
      return email;
    }
    const adminA = await account(orgA.id, 'ADMIN'); const adminB = await account(orgB.id, 'ADMIN'); const studentA = await account(orgA.id, 'STUDENT');
    await account(orgB.id, 'STUDENT');
    const trainerA = await db.membership.findFirstOrThrow({ where: { organizationId: orgA.id, role: 'ADMIN' } });
    ownerMembershipId = trainerA.id;
    const trainerB = await db.membership.findFirstOrThrow({ where: { organizationId: orgB.id, role: 'ADMIN' } });
    await seedExercises(db, orgA.id, trainerA.id); await seedExercises(db, orgB.id, trainerB.id);
    exerciseId = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgA.id, slug: 'sentadilla-goblet' } } })).id;
    otherExerciseId = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgB.id, slug: 'sentadilla-goblet' } } })).id;
    const api = request(app.getHttpServer());
    const login = async (email: string) => session(await api.post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(200));
    owner = await login(adminA); other = await login(adminB); student = await login(studentA);
  }, 90_000);
  afterAll(async () => { if (app) await app.close(); });

  it('creates a plan with ordered workouts and canonical organization exercises, validates and publishes', async () => {
    const api = request(app.getHttpServer());
    await api.post('/api/v1/training-plans').set(headers(student)).send({ name: 'Sin permiso', goal: 'STRENGTH' }).expect(403);
    const created = await api.post('/api/v1/training-plans').set(headers(owner)).send({ name: 'Fuerza tres días', goal: 'STRENGTH', description: 'Programa reutilizable' }).expect(201);
    planId = created.body.data.id as string; versionId = created.body.data.versions[0].id as string;
    await api.get(`/api/v1/training-plans/${planId}`).set('Cookie', other.cookie).expect(404);
    await api.get(`/api/v1/training-plans/${planId}`).set('Cookie', student.cookie).expect(403);
    const first = await api.post(`/api/v1/plan-versions/${versionId}/workouts`).set(headers(owner)).send({ revision: 1, name: 'Cuerpo completo A', dayLabel: 'Sesión A', expectedDurationMinutes: 50 }).expect(201);
    const workoutA = first.body.data.workouts[0].id as string;
    await api.post(`/api/v1/plan-versions/${versionId}/workouts`).set(headers(owner)).send({ revision: 1, name: 'Edición simultánea' }).expect(409);
    const second = await api.post(`/api/v1/plan-versions/${versionId}/workouts`).set(headers(owner)).send({ revision: 2, name: 'Cuerpo completo B', dayLabel: 'Sesión B' }).expect(201);
    const workoutB = second.body.data.workouts[1].id as string;
    await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(owner)).send({ revision: 3, exerciseId: otherExerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'RIR', targetRir: 2, restSeconds: 90 }).expect(404);
    await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(other)).send({ revision: 3, exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'NONE', restSeconds: 90 }).expect(404);
    await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(owner)).send({ revision: 3, exerciseId, targetSets: 0, targetRepsMin: 10, targetRepsMax: 8, intensityMode: 'NONE', restSeconds: 90 }).expect(400);
    await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(owner)).send({ revision: 3, exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'RIR', targetRpe: 7, restSeconds: 90 }).expect(400);
    const added = await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(owner)).send({ revision: 3, exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'RIR', targetRir: 2, restSeconds: 90, suggestedLoadKg: '18.50' }).expect(201);
    expect(added.body.data.workouts[0].exercises[0].exerciseId).toBe(exerciseId);
    const entryId = added.body.data.workouts[0].exercises[0].id as string;
    await api.post(`/api/v1/plan-versions/${versionId}/publish`).set(headers(owner)).send({ revision: 4 }).expect(400);
    const otherA = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgId, slug: 'press-banca-barra' } } })).id;
    const twice = await api.post(`/api/v1/workout-templates/${workoutA}/exercises`).set(headers(owner)).send({ revision: 4, exerciseId: otherA, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'NONE', restSeconds: 120 }).expect(201);
    await api.post(`/api/v1/workout-templates/${workoutA}/exercises/reorder`).set(headers(owner)).send({ revision: 5, orderedIds: [entryId, entryId] }).expect(400);
    const reordered = await api.post(`/api/v1/workout-templates/${workoutA}/exercises/reorder`).set(headers(owner)).send({ revision: 5, orderedIds: twice.body.data.workouts[0].exercises.map((entry: { id: string }) => entry.id).reverse() }).expect(201);
    expect(reordered.body.data.workouts[0].exercises[0].order).toBe(1);
    const copied = await api.post(`/api/v1/workout-templates/${workoutB}/duplicate`).set(headers(owner)).send({ revision: 6 }).expect(201);
    expect(copied.body.data.workouts).toHaveLength(3);
    await api.post(`/api/v1/workout-templates/${copied.body.data.workouts[2].id}/remove`).set(headers(owner)).send({ revision: 7 }).expect(201);
    const exerciseB = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgId, slug: 'jalon-pecho-polea' } } })).id;
    const withB = await api.post(`/api/v1/workout-templates/${workoutB}/exercises`).set(headers(owner)).send({ revision: 8, exerciseId: exerciseB, targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, intensityMode: 'NONE', restSeconds: 75 }).expect(201);
    const published = await api.post(`/api/v1/plan-versions/${versionId}/publish`).set(headers(owner)).send({ revision: withB.body.data.revision }).expect(201);
    expect(published.body.data.status).toBe('ACTIVE'); versionNumber = published.body.data.versionNumber as number;
    expect(published.body.data.workouts[0].exercises[0].exerciseNameSnapshot).toBeTruthy();
    await api.patch(`/api/v1/programmed-exercises/${entryId}`).set(headers(owner)).send({ revision: published.body.data.revision, targetSets: 5 }).expect(409);
    await api.post(`/api/v1/plan-versions/${versionId}/workouts`).set(headers(student)).send({ revision: published.body.data.revision, name: 'No permitido' }).expect(403);
    await expect(db.programmedExercise.update({ where: { id: entryId }, data: { targetSets: 10 } })).rejects.toThrow();
  }, 45_000);

  it('pins the student to an immutable version until explicit replacement and archives only after ending assignment', async () => {
    const api = request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);
    await api.post(`/api/v1/students/${otherStudentId}/plan-assignment`).set(headers(owner)).send({ planId, startDate: today }).expect(404);
    await api.post(`/api/v1/students/${studentId}/plan-assignment`).set(headers(other)).send({ planId, startDate: today }).expect(404);
    const initial = await api.post(`/api/v1/students/${studentId}/plan-assignment`).set(headers(owner)).send({ planId, startDate: today }).expect(201);
    expect(initial.body.data.planVersion.versionNumber).toBe(versionNumber);
    await expect(db.studentPlanAssignment.create({ data: { organizationId: orgId, studentId, trainingPlanId: planId, trainingPlanVersionId: versionId, assignedByMembershipId: ownerMembershipId, startDate: new Date(`${today}T00:00:00Z`) } })).rejects.toThrow();
    await api.post(`/api/v1/students/${studentId}/plan-assignment`).set(headers(owner)).send({ planId, startDate: today }).expect(409);
    const studentView = await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200);
    expect(studentView.body.data.workouts).toHaveLength(2);
    expect(studentView.body.data.workouts[0].exercises[0].exerciseId).toBeTruthy();
    expect(studentView.body.data.workouts[0].exercises[0].trainerNotes).toBeUndefined();
    const initialExerciseName = studentView.body.data.workouts.flatMap((workout: { exercises: { exerciseId: string; name: string }[] }) => workout.exercises).find((entry: { exerciseId: string }) => entry.exerciseId === exerciseId)?.name;
    await db.exercise.update({ where: { id: exerciseId }, data: { name: 'Sentadilla goblet renombrada', version: { increment: 1 } } });
    const afterCatalogEdit = await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200);
    expect(afterCatalogEdit.body.data.workouts.flatMap((workout: { exercises: { exerciseId: string; name: string }[] }) => workout.exercises).find((entry: { exerciseId: string }) => entry.exerciseId === exerciseId)?.name).toBe(initialExerciseName);
    await api.get(`/api/v1/students/${studentId}/plan-assignment`).set('Cookie', student.cookie).expect(403);
    await api.post(`/api/v1/training-plans/${planId}/duplicate`).set(headers(student)).send({}).expect(403);
    const duplicate = await api.post(`/api/v1/training-plans/${planId}/duplicate`).set(headers(owner)).send({ name: 'Segundo programa' }).expect(201);
    expect(duplicate.body.data.status).toBe('DRAFT');
    const duplicateVersionId = duplicate.body.data.versions[0].id as string;
    const duplicateDraft = await api.get(`/api/v1/plan-versions/${duplicateVersionId}`).set('Cookie', owner.cookie).expect(200);
    expect(duplicateDraft.body.data.workouts).toHaveLength(2);
    const revised = await api.post(`/api/v1/training-plans/${planId}/versions`).set(headers(owner)).send({ planVersion: (await db.trainingPlan.findUniqueOrThrow({ where: { id: planId } })).version }).expect(201);
    expect(revised.body.data.workouts).toHaveLength(2);
    const revisedVersionId = revised.body.data.id as string;
    await api.post(`/api/v1/plan-versions/${revisedVersionId}/workouts`).set(headers(owner)).send({ revision: 1, name: 'Sesion adicional' }).expect(201);
    const afterEdit = await api.get(`/api/v1/plan-versions/${revisedVersionId}`).set('Cookie', owner.cookie).expect(200);
    await api.post(`/api/v1/plan-versions/${revisedVersionId}/publish`).set(headers(owner)).send({ revision: afterEdit.body.data.revision }).expect(400);
    const versionAfter = await api.get(`/api/v1/plan-versions/${revisedVersionId}`).set('Cookie', owner.cookie).expect(200);
    const extra = versionAfter.body.data.workouts.at(-1);
    const exercise = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgId, slug: 'curl-biceps-mancuernas' } } })).id;
    const completed = await api.post(`/api/v1/workout-templates/${extra.id}/exercises`).set(headers(owner)).send({ revision: versionAfter.body.data.revision, exerciseId: exercise, targetSets: 2, targetRepsMin: 12, targetRepsMax: 12, intensityMode: 'NONE', restSeconds: 60 }).expect(201);
    await api.post(`/api/v1/plan-versions/${revisedVersionId}/publish`).set(headers(owner)).send({ revision: completed.body.data.revision }).expect(201);
    expect((await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200)).body.data.workouts).toHaveLength(2);
    const replaced = await api.post(`/api/v1/students/${studentId}/plan-assignment/replace`).set(headers(owner)).send({ planId, startDate: today }).expect(201);
    expect(replaced.body.data.planVersion.versionNumber).toBe(versionNumber + 1);
    expect((await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200)).body.data.workouts).toHaveLength(3);
    await db.exercise.update({ where: { id: exerciseId }, data: { active: false } });
    expect((await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200)).body.data.workouts[0].exercises.some((entry: { exerciseId: string }) => entry.exerciseId === exerciseId)).toBe(true);
    await api.get(`/api/v1/exercises/${exerciseId}`).set('Cookie', student.cookie).expect(200);
    await api.post(`/api/v1/training-plans/${planId}/archive`).set(headers(owner)).send({ version: (await db.trainingPlan.findUniqueOrThrow({ where: { id: planId } })).version }).expect(409);
    await api.post(`/api/v1/students/${studentId}/plan-assignment/end`).set(headers(owner)).send({}).expect(201);
    const archived = await api.post(`/api/v1/training-plans/${planId}/archive`).set(headers(owner)).send({ version: (await db.trainingPlan.findUniqueOrThrow({ where: { id: planId } })).version }).expect(201);
    expect(archived.body.data.status).toBe('ARCHIVED');
    expect((await api.get('/api/v1/student/me/plan').set('Cookie', student.cookie).expect(200)).body.data).toBeNull();
    await api.get(`/api/v1/exercises/${exerciseId}`).set('Cookie', student.cookie).expect(404);
    expect(await db.studentPlanAssignment.count({ where: { studentId } })).toBe(2);
    expect((await db.trainingPlanVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe('RETIRED');
    await api.post(`/api/v1/students/${studentId}/plan-assignment`).set(headers(owner)).send({ planId, startDate: today }).expect(404);
  }, 45_000);

  it('voids an unpublished draft before archiving its reusable plan', async () => {
    const api = request(app.getHttpServer());
    const created = await api.post('/api/v1/training-plans').set(headers(owner)).send({ name: 'Programa descartado', goal: 'STRENGTH' }).expect(201);
    const id = created.body.data.id as string;
    const draftId = created.body.data.versions[0].id as string;
    await api.post(`/api/v1/training-plans/${id}/archive`).set(headers(owner)).send({ version: 1 }).expect(409);
    const voided = await api.post(`/api/v1/plan-versions/${draftId}/void`).set(headers(owner)).send({ revision: 1, reason: 'No se utilizará este borrador' }).expect(201);
    expect(voided.body.data.status).toBe('VOID');
    const archived = await api.post(`/api/v1/training-plans/${id}/archive`).set(headers(owner)).send({ version: 1 }).expect(201);
    expect(archived.body.data.status).toBe('ARCHIVED');
    await api.post(`/api/v1/training-plans/${id}/versions`).set(headers(owner)).send({ planVersion: archived.body.data.version }).expect(409);
  });
});
