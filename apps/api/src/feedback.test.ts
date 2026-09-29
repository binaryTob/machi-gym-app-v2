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
import { seedDemoProgram } from '../prisma/plans';

const origin = 'http://localhost:3000'; const password = 'feedback-test-password-12345';
type Auth = { cookie: string; csrf: string };
function session(response: request.Response): Auth {
  const raw = response.headers['set-cookie'] as unknown;
  if (!Array.isArray(raw)) throw new Error('Missing cookies');
  const cookie = raw.map((value: string) => value.split(';')[0]).join('; ');
  return { cookie, csrf: decodeURIComponent((cookie.match(/machi_csrf=([^;]+)/) ?? [])[1] ?? '') };
}
const auth = (who: Auth) => ({ Cookie: who.cookie, Origin: origin, 'X-CSRF-Token': who.csrf });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const noDiscomfort = { sessionRpe: 6, perceivedState: 'GOOD', recoveryState: 'RECOVERED', discomfortPresent: false, generalNotes: 'Me sentí con energía.', discomfortReports: [] };
const withDiscomfort = { sessionRpe: 9, perceivedState: 'VERY_DIFFICULT', recoveryState: 'TIRED', discomfortPresent: true,
  generalNotes: 'Terminé antes por una molestia.', discomfortReports: [
    { bodyRegion: 'RIGHT_KNEE', intensity: 5, otherLocation: null, exerciseId: null, notes: 'La noté en las últimas series.' },
    { bodyRegion: 'LOWER_BACK', intensity: 2, otherLocation: null, exerciseId: null, notes: null },
  ] };

describe('Phase 5 scoped, immutable structured feedback', () => {
  let app: INestApplication; let db: Db; let trainer: Auth; let studentA: Auth; let studentB: Auth; let foreignTrainer: Auth; let unassignedTrainer: Auth;
  let orgId: string; let studentAId: string; let studentBId: string; let templateId: string;
  let completeId: string; let partialId: string; let activeId: string; let cancelledId: string; let skippedId: string; let earlyEventId: string;
  beforeAll(async () => {
    process.env.WEB_ORIGIN = origin;
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api/v1'); app.useGlobalInterceptors(new Envelope()); app.useGlobalFilters(new Problems()); await app.init(); db = app.get(Db);
    const org = await db.organization.create({ data: { name: 'Feedback A' } }); const otherOrg = await db.organization.create({ data: { name: 'Feedback B' } }); orgId = org.id;
    async function user(organizationId: string, role: 'ADMIN' | 'TRAINER' | 'STUDENT') {
      const email = `feedback-${randomUUID()}@example.test`;
      const created = await db.user.create({ data: { email, displayName: role, passwordHash: await argon2.hash(password) } });
      const membership = await db.membership.create({ data: { organizationId, userId: created.id, role } });
      if (role !== 'STUDENT') await db.trainerProfile.create({ data: { organizationId, membershipId: membership.id } });
      else await db.studentProfile.create({ data: { organizationId, membershipId: membership.id, displayName: 'Alumno', contactEmail: email } });
      return { email, membership };
    }
    const coach = await user(org.id, 'ADMIN'); const other = await user(otherOrg.id, 'ADMIN'); const unassigned = await user(org.id, 'TRAINER');
    const a = await user(org.id, 'STUDENT'); const b = await user(org.id, 'STUDENT');
    studentAId = (await db.studentProfile.findUniqueOrThrow({ where: { membershipId: a.membership.id } })).id;
    studentBId = (await db.studentProfile.findUniqueOrThrow({ where: { membershipId: b.membership.id } })).id;
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { membershipId: coach.membership.id } });
    for (const studentId of [studentAId, studentBId]) await db.trainerStudentAssignment.create({ data: { organizationId: org.id, trainerId: trainerProfile.id, studentId } });
    await seedExercises(db, org.id, coach.membership.id);
    await seedDemoProgram(db, org.id, coach.membership.id, password);
    templateId = (await db.workoutTemplate.findFirstOrThrow({ where: { organizationId: org.id, trainingPlanVersionId: `demo-version-${org.id}` }, orderBy: { order: 'asc' } })).id;
    const api = request(app.getHttpServer());
    const login = async (email: string) => session(await api.post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(200));
    trainer = await login(coach.email); studentA = await login(a.email); studentB = await login(b.email); foreignTrainer = await login(other.email); unassignedTrainer = await login(unassigned.email);
    for (const studentId of [studentAId, studentBId]) await api.post(`/api/v1/students/${studentId}/plan-assignment`).set(auth(trainer)).send({ planId: `demo-plan-${org.id}`, startDate: day(-2) }).expect(201);
    const schedule = async (studentId: string, offset: number) => {
      const result = await api.post(`/api/v1/students/${studentId}/workout-sessions`).set(auth(trainer)).send({ workoutTemplateId: templateId, scheduledDate: day(offset), requestKey: randomUUID() }).expect(201);
      return result.body.data as { id: string; exercises: { exerciseId: string; sets: { id: string }[] }[] };
    };
    const complete = await schedule(studentAId, -1); completeId = complete.id;
    await api.post(`/api/v1/workout-sessions/${completeId}/start`).set(auth(studentA)).send({}).expect(201);
    for (const exercise of complete.exercises) for (const set of exercise.sets) await api.put(`/api/v1/workout-sessions/${completeId}/sets/${set.id}`).set(auth(studentA)).send({ version: 1, completionState: 'COMPLETED', actualLoadKg: '30.00', actualRepetitions: 8, rir: 2, rpe: null }).expect(200);
    const completeState = await api.get(`/api/v1/workout-sessions/${completeId}`).set('Cookie', studentA.cookie).expect(200);
    await api.post(`/api/v1/workout-sessions/${completeId}/finish`).set(auth(studentA)).send({ version: completeState.body.data.version }).expect(201);
    const partial = await schedule(studentBId, -1); partialId = partial.id;
    await api.post(`/api/v1/workout-sessions/${partialId}/start`).set(auth(studentB)).send({}).expect(201);
    const firstSet = partial.exercises[0]?.sets[0];
    if (!firstSet) throw new Error('Fixture workout has no sets');
    await api.put(`/api/v1/workout-sessions/${partialId}/sets/${firstSet.id}`).set(auth(studentB)).send({ version: 1, completionState: 'COMPLETED', actualLoadKg: '25.00', actualRepetitions: 8, rir: 2, rpe: null }).expect(200);
    const partialState = await api.get(`/api/v1/workout-sessions/${partialId}`).set('Cookie', studentB.cookie).expect(200);
    const finished = await api.post(`/api/v1/workout-sessions/${partialId}/finish`).set(auth(studentB)).send({ version: partialState.body.data.version, partialReason: 'DISCOMFORT_OR_PAIN', bodyRegion: 'RIGHT_KNEE', intensity: 4 }).expect(201);
    earlyEventId = finished.body.data.safetyEvents[0].id as string;
    const active = await schedule(studentAId, 0); activeId = active.id;
    await api.post(`/api/v1/workout-sessions/${activeId}/start`).set(auth(studentA)).send({}).expect(201);
    const cancelled = await schedule(studentBId, 0); cancelledId = cancelled.id;
    await api.post(`/api/v1/workout-sessions/${cancelledId}/cancel`).set(auth(studentB)).send({ version: 1, reason: 'OTHER' }).expect(201);
    const skipped = await schedule(studentBId, -2); skippedId = skipped.id;
    await api.post(`/api/v1/workout-sessions/${skippedId}/skip`).set(auth(trainer)).send({ version: 1 }).expect(201);
  }, 120_000);
  afterAll(async () => { if (app) await app.close(); });

  it('isolates analytics by tenant and student, and preserves idempotent versioned monthly revisions', async () => {
    const api = request(app.getHttpServer());
    const own = await api.get('/api/v1/student/me/analytics?period=current-month').set('Cookie', studentA.cookie).expect(200);
    expect(own.body.data.studentId).toBe(studentAId);
    expect(own.body.data.organizationId).toBe(orgId);
    await api.get(`/api/v1/students/${studentBId}/analytics`).set('Cookie', studentA.cookie).expect(403);
    await api.get(`/api/v1/students/${studentAId}/analytics`).set('Cookie', foreignTrainer.cookie).expect(404);
    await api.get(`/api/v1/students/${studentAId}/analytics`).set('Cookie', unassignedTrainer.cookie).expect(404);
    expect((await api.get('/api/v1/trainer/analytics/roster').set('Cookie', unassignedTrainer.cookie).expect(200)).body.data.students).toEqual([]);
    await api.get(`/api/v1/students/${studentBId}/analytics`).set('Cookie', trainer.cookie).expect(200);
    const previous = new Date(); previous.setUTCDate(1); previous.setUTCMonth(previous.getUTCMonth() - 2);
    const monthPath = `/api/v1/students/${studentAId}/analytics/monthly/${previous.getUTCFullYear()}/${previous.getUTCMonth() + 1}`;
    const created = await api.post(`${monthPath}/finalize`).set(auth(trainer)).send({}).expect(201);
    const repeated = await api.post(`${monthPath}/finalize`).set(auth(trainer)).send({}).expect(201);
    expect(repeated.body.data).toEqual(created.body.data);
    expect(created.body.data.metrics.analyticsVersion).toBe(1);
    const studentRead = await api.get(`/api/v1/student/me/analytics/monthly/${previous.getUTCFullYear()}/${previous.getUTCMonth() + 1}`).set('Cookie', studentA.cookie).expect(200);
    expect(studentRead.body.data.finalized).toBe(true);
    await api.post(`${monthPath}/revise`).set(auth(studentA)).send({ reason: 'Corrección autorizada del registro original' }).expect(403);
    const revised = await api.post(`${monthPath}/revise`).set(auth(trainer)).send({ reason: 'Corrección autorizada del registro original' }).expect(201);
    expect(revised.body.data.revision).toBe(2);
    expect(await db.monthlyProgressSnapshot.count({ where: { organizationId: orgId, studentId: studentAId, year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1 } })).toBe(2);
    expect((await api.get(monthPath).set('Cookie', trainer.cookie).expect(200)).body.data.revision).toBe(2);
    await api.get(monthPath).set('Cookie', foreignTrainer.cookie).expect(404);
  }, 30_000);

  it('accepts completed feedback once, returns exact retries, locks different payloads and denies cross-tenant reads', async () => {
    const api = request(app.getHttpServer());
    const eligibility = await api.get(`/api/v1/workout-sessions/${completeId}/feedback`).set('Cookie', studentA.cookie).expect(200);
    expect(eligibility.body.data.eligible).toBe(true);
    const posted = await api.post(`/api/v1/workout-sessions/${completeId}/feedback`).set(auth(studentA)).send(noDiscomfort).expect(201);
    expect(posted.body.data.sessionRpe).toBe(6);
    expect(posted.body.data.discomfortReports).toEqual([]);
    const repeated = await api.post(`/api/v1/workout-sessions/${completeId}/feedback`).set(auth(studentA)).send(noDiscomfort).expect(201);
    expect(repeated.body.data.id).toBe(posted.body.data.id);
    expect(await db.sessionFeedback.count({ where: { workoutSessionId: completeId } })).toBe(1);
    await api.post(`/api/v1/workout-sessions/${completeId}/feedback`).set(auth(studentA)).send({ ...noDiscomfort, sessionRpe: 9 }).expect(409);
    await api.post(`/api/v1/workout-sessions/${completeId}/feedback`).set(auth(studentB)).send(noDiscomfort).expect(404);
    await api.get(`/api/v1/workout-sessions/${completeId}/feedback`).set('Cookie', foreignTrainer.cookie).expect(404);
    const trainerView = await api.get(`/api/v1/workout-sessions/${completeId}/feedback`).set('Cookie', trainer.cookie).expect(200);
    expect(trainerView.body.data.feedback.recoveryState).toBe('RECOVERED');
    expect((await api.get(`/api/v1/workout-sessions/${completeId}/feedback`).set('Cookie', studentA.cookie).expect(200)).body.data.reason).toBe('ALREADY_SUBMITTED');
    await expect(db.sessionFeedback.update({ where: { workoutSessionId: completeId }, data: { sessionRpe: 1 } })).rejects.toThrow();
    await expect(db.sessionFeedback.delete({ where: { workoutSessionId: completeId } })).rejects.toThrow();
  }, 30_000);

  it('rejects nonterminal/cancelled/skipped sessions and malformed subjective scores', async () => {
    const api = request(app.getHttpServer());
    for (const id of [activeId, cancelledId, skippedId]) {
      const authUser = id === activeId ? studentA : studentB;
      expect((await api.get(`/api/v1/workout-sessions/${id}/feedback`).set('Cookie', authUser.cookie).expect(200)).body.data.eligible).toBe(false);
      await api.post(`/api/v1/workout-sessions/${id}/feedback`).set(auth(authUser)).send(noDiscomfort).expect(409);
    }
    const pending = await api.post(`/api/v1/students/${studentBId}/workout-sessions`).set(auth(trainer)).send({ workoutTemplateId: templateId, scheduledDate: day(0), requestKey: randomUUID() }).expect(201);
    await api.post(`/api/v1/workout-sessions/${pending.body.data.id}/feedback`).set(auth(studentB)).send(noDiscomfort).expect(409);
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, sessionRpe: 0 }).expect(400);
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, recoveryState: 'DIAGNOSED' }).expect(400);
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, discomfortReports: [{ ...withDiscomfort.discomfortReports[0], intensity: 11 }] }).expect(400);
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, discomfortPresent: false, discomfortReports: [] }).expect(400);
  }, 30_000);

  it('reuses early discomfort, supports two distinct relational regions, validates exercise lineage and returns factual trainer signals', async () => {
    const api = request(app.getHttpServer());
    const allowed = (await db.sessionExercise.findFirstOrThrow({ where: { workoutSessionId: partialId }, orderBy: { order: 'asc' } })).exerciseId;
    const invalid = (await db.exercise.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgId, slug: 'curl-biceps-mancuernas' } } })).id;
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, discomfortReports: [{ ...withDiscomfort.discomfortReports[0], exerciseId: invalid }] }).expect(400);
    await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...withDiscomfort, discomfortReports: [{ ...withDiscomfort.discomfortReports[0], bodyRegion: 'OTHER', otherLocation: 'zona', exerciseId: allowed }, { ...withDiscomfort.discomfortReports[1], bodyRegion: 'OTHER', otherLocation: 'zona' }] }).expect(400);
    const payload = { ...withDiscomfort, discomfortReports: [{ ...withDiscomfort.discomfortReports[0], exerciseId: allowed }, withDiscomfort.discomfortReports[1]] };
    const saved = await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send(payload).expect(201);
    expect(saved.body.data.discomfortReports).toHaveLength(2);
    const linked = saved.body.data.discomfortReports.find((report: { bodyRegion: string }) => report.bodyRegion === 'RIGHT_KNEE');
    expect(linked.safetyEventId).toBe(earlyEventId);
    expect(linked.intensity).toBe(5);
    const early = await db.sessionSafetyEvent.findUniqueOrThrow({ where: { id: earlyEventId } });
    expect(early.intensity).toBe(4);
    expect(await db.sessionSafetyEvent.count({ where: { workoutSessionId: partialId } })).toBe(2);
    expect(await db.discomfortReport.count({ where: { workoutSessionId: partialId } })).toBe(2);
    const reversed = await api.post(`/api/v1/workout-sessions/${partialId}/feedback`).set(auth(studentB)).send({ ...payload, discomfortReports: [...payload.discomfortReports].reverse() }).expect(201);
    expect(reversed.body.data.id).toBe(saved.body.data.id);
    expect(await db.discomfortReport.count({ where: { workoutSessionId: partialId } })).toBe(2);
    await expect(db.discomfortReport.update({ where: { id: linked.id }, data: { intensity: 1 } })).rejects.toThrow();
    const signals = await api.get(`/api/v1/students/${studentBId}/feedback-signals`).set('Cookie', trainer.cookie).expect(200);
    expect(signals.body.data.latestFeedback.sessionRpe).toBe(9);
    expect(signals.body.data.sessionsWithDiscomfort28Days).toBe(1);
    await api.get(`/api/v1/students/${studentBId}/feedback-signals`).set('Cookie', foreignTrainer.cookie).expect(404);
    await api.get(`/api/v1/students/${studentBId}/feedback-signals`).set('Cookie', studentB.cookie).expect(403);
  }, 30_000);
});
