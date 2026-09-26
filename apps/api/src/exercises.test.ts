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
const password = 'library-test-password-12345';
function cookies(result: request.Response) {
  const raw = result.headers['set-cookie'] as unknown;
  if (!Array.isArray(raw)) throw new Error('Missing session cookies');
  const cookie = raw.map((value: string) => value.split(';')[0]).join('; ');
  return { cookie, csrf: decodeURIComponent((cookie.match(/machi_csrf=([^;]+)/) ?? [])[1] ?? '') };
}
const custom = {
  name: 'Press de pecho en máquina', slug: 'press-pecho-maquina', aliases: ['empuje guiado'],
  description: 'Empuje guiado sentado con apoyo estable y recorrido controlado de los brazos.',
  primaryMuscleGroup: 'CHEST', secondaryMuscleGroups: ['TRICEPS'], equipment: ['MACHINE'],
  movementPattern: 'HORIZONTAL_PUSH', difficulty: 'BEGINNER', performanceMode: 'WEIGHT_REPS',
  loadEntryConvention: 'MACHINE_STACK', loadMultiplier: 1,
  instructions: 'Sentate con la espalda apoyada; empujá las manijas hacia adelante sin perder la postura.',
  commonMistakes: 'Separar la espalda del apoyo o extender los codos de golpe.', cautionNotes: null,
} as const;

describe('exercise catalog: tenant isolation and trainer-controlled media', () => {
  let app: INestApplication; let db: Db; let owner: { cookie: string; csrf: string }; let student: { cookie: string; csrf: string }; let other: { cookie: string; csrf: string }; let orgId: string;
  beforeAll(async () => {
    process.env.WEB_ORIGIN = origin;
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1'); app.useGlobalInterceptors(new Envelope()); app.useGlobalFilters(new Problems());
    await app.init(); db = app.get(Db);
    const orgA = await db.organization.create({ data: { name: 'Biblioteca A' } });
    orgId = orgA.id;
    const orgB = await db.organization.create({ data: { name: 'Biblioteca B' } });
    const makeUser = async (email: string, organizationId: string, role: 'ADMIN' | 'STUDENT') => {
      const user = await db.user.create({ data: { email, displayName: role, passwordHash: await argon2.hash(password) } });
      const membership = await db.membership.create({ data: { userId: user.id, organizationId, role } });
      if (role === 'ADMIN') await db.trainerProfile.create({ data: { membershipId: membership.id, organizationId } });
      else await db.studentProfile.create({ data: { membershipId: membership.id, organizationId, displayName: 'Alumno', contactEmail: email } });
      return membership;
    };
    const adminAEmail = `library-a-${randomUUID()}@example.test`;
    const adminBEmail = `library-b-${randomUUID()}@example.test`;
    const studentEmail = `library-student-${randomUUID()}@example.test`;
    const adminA = await makeUser(adminAEmail, orgA.id, 'ADMIN');
    await makeUser(adminBEmail, orgB.id, 'ADMIN');
    await makeUser(studentEmail, orgA.id, 'STUDENT');
    await seedExercises(db, orgA.id, adminA.id);
    const api = request(app.getHttpServer());
    const login = async (email: string) => cookies(await api.post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(200));
    owner = await login(adminAEmail); other = await login(adminBEmail); student = await login(studentEmail);
  }, 90_000);
  afterAll(async () => { if (app) await app.close(); });

  it('filters accent-insensitive names, aliases, muscles, equipment and movement; paginates', async () => {
    const api = request(app.getHttpServer());
    const byAccent = await api.get('/api/v1/exercises?q=jalon').set('Cookie', owner.cookie).expect(200);
    expect(byAccent.body.data.items.some((item: { slug: string }) => item.slug === 'jalon-pecho-polea')).toBe(true);
    const byAlias = await api.get('/api/v1/exercises?q=bench').set('Cookie', owner.cookie).expect(200);
    expect(byAlias.body.data.items[0].slug).toBe('press-banca-barra');
    const filtered = await api.get('/api/v1/exercises?muscle=BACK&equipment=CABLE&pattern=VERTICAL_PULL&difficulty=BEGINNER').set('Cookie', owner.cookie).expect(200);
    expect(filtered.body.data.items.map((item: { slug: string }) => item.slug)).toEqual(['jalon-pecho-polea']);
    const invalid = await api.get('/api/v1/exercises?muscle=ANYTHING').set('Cookie', owner.cookie).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('creates, updates, verifies bundled media, deactivates and protects students/other organizations', async () => {
    const api = request(app.getHttpServer());
    const write = (session: { cookie: string; csrf: string }) => ({ Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf });
    await api.post('/api/v1/exercises').set(write(student)).send(custom).expect(403);
    const created = await api.post('/api/v1/exercises').set(write(owner)).send(custom).expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.version).toBe(1);
    await api.post('/api/v1/exercises').set(write(owner)).send(custom).expect(409);
    await api.post('/api/v1/exercises').set(write(owner)).send({ ...custom, primaryMuscleGroup: 'TRICEPS', secondaryMuscleGroups: ['TRICEPS'] }).expect(400);
    await api.get(`/api/v1/exercises/${id}`).set('Cookie', other.cookie).expect(404);
    await api.patch(`/api/v1/exercises/${id}`).set(write(other)).send({ version: 1, name: 'No permitido' }).expect(404);
    const studentDetail = await api.get(`/api/v1/exercises/${id}`).set('Cookie', student.cookie).expect(200);
    expect(studentDetail.body.data.aiEligible).toBeUndefined();
    expect(studentDetail.body.data.version).toBeUndefined();
    await api.patch(`/api/v1/exercises/${id}`).set(write(student)).send({ version: 1, name: 'No permitido' }).expect(403);
    await api.patch(`/api/v1/exercises/${id}/status`).set(write(student)).send({ version: 1, active: false }).expect(403);
    await api.post(`/api/v1/exercises/${id}/media`).set(write(owner)).send({ type: 'THUMBNAIL', url: 'https://example.com/unlicensed.gif', source: 'PROJECT_ORIGINAL', licenseName: 'Arte original Machi Gym', attributionText: 'Machi Gym · ilustración original' }).expect(400);
    const media = await api.post(`/api/v1/exercises/${id}/media`).set(write(owner)).send({ type: 'THUMBNAIL', url: '/media/exercises/press.svg', source: 'PROJECT_ORIGINAL', licenseName: 'Arte original Machi Gym', attributionText: 'Machi Gym · ilustración original' }).expect(201);
    expect(media.body.data.active).toBe(false);
    const mediaId = media.body.data.id as string;
    await expect(db.exerciseMedia.update({ where: { id: mediaId }, data: { active: true } })).rejects.toThrow();
    expect((await api.get(`/api/v1/exercises/${id}`).set('Cookie', student.cookie).expect(200)).body.data.media).toEqual([]);
    await api.post(`/api/v1/exercises/${id}/media/${mediaId}/verify`).set(write(student)).expect(403);
    await api.post(`/api/v1/exercises/${id}/media/${mediaId}/verify`).set(write(owner)).expect(201);
    expect((await api.get(`/api/v1/exercises/${id}`).set('Cookie', student.cookie).expect(200)).body.data.media).toHaveLength(1);
    const updated = await api.patch(`/api/v1/exercises/${id}`).set(write(owner)).send({ version: 1, name: 'Press de pecho guiado', aliases: ['guíado'] }).expect(200);
    expect(updated.body.data.version).toBe(2);
    await api.patch(`/api/v1/exercises/${id}`).set(write(owner)).send({ version: 1, name: 'Edición vieja' }).expect(409);
    expect((await api.get('/api/v1/exercises?q=guiado').set('Cookie', owner.cookie).expect(200)).body.data.items.some((item: { id: string }) => item.id === id)).toBe(true);
    await api.patch(`/api/v1/exercises/${id}/status`).set(write(owner)).send({ version: 2, active: false }).expect(200);
    await api.get(`/api/v1/exercises/${id}`).set('Cookie', student.cookie).expect(404);
    await api.get(`/api/v1/exercises/${id}`).set('Cookie', owner.cookie).expect(200);
    expect((await db.exercise.findUniqueOrThrow({ where: { id } })).active).toBe(false);
    expect((await api.get('/api/v1/exercises?active=false').set('Cookie', student.cookie).expect(200)).body.data.items.some((item: { id: string }) => item.id === id)).toBe(false);
    expect((await api.get('/api/v1/exercises?active=false').set('Cookie', owner.cookie).expect(200)).body.data.items.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await db.exercise.count({ where: { organizationId: orgId } }))).toBeGreaterThanOrEqual(23);
  }, 30_000);
  it('returns a stable cursor without repeating an exercise across pages', async () => {
    const api = request(app.getHttpServer());
    for (let n = 1; n <= 2; n++) await api.post('/api/v1/exercises').set({ Origin: origin, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf }).send({ ...custom, name: `Remo de prueba ${n}`, slug: `remo-prueba-${n}` }).expect(201);
    const first = await api.get('/api/v1/exercises').set('Cookie', owner.cookie).expect(200);
    expect(first.body.data.items).toHaveLength(24);
    expect(first.body.data.hasMore).toBe(true);
    const next = await api.get(`/api/v1/exercises?cursor=${encodeURIComponent(first.body.data.nextCursor as string)}`).set('Cookie', owner.cookie).expect(200);
    expect(next.body.data.items.length).toBeGreaterThan(0);
    const firstIds = new Set((first.body.data.items as { id: string }[]).map((item) => item.id));
    expect((next.body.data.items as { id: string }[]).every((item) => !firstIds.has(item.id))).toBe(true);
  });
});
