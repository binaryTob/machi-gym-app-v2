import { Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://localhost:3000';
type Fixture = { coach: BrowserContext; coachPage: Page; student: BrowserContext; studentPage: Page; studentId: string; sessionId: string; setId: string };
async function prepare(browser: Browser): Promise<Fixture> {
  const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Configure seed owner credentials for Phase 4 Playwright tests');
  const studentEmail = `workout-e2e-${randomUUID()}@example.test`;
  const coach = await browser.newContext(); const coachPage = await coach.newPage();
  await coachPage.goto('/login');
  await coachPage.getByLabel('Correo electrónico').fill(email);
  await coachPage.getByLabel('Contraseña').fill(password);
  await coachPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(coachPage.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
  await coachPage.getByLabel('Nombre del alumno').fill(`Entrena ${randomUUID().slice(0, 7)}`);
  await coachPage.getByLabel('Correo electrónico').fill(studentEmail);
  await coachPage.getByRole('button', { name: 'Crear alumno y enlace' }).click();
  const invitation = await coachPage.locator('.notice .mono').first().innerText();
  const studentLink = await coachPage.locator('.roster a').first().getAttribute('href');
  if (!studentLink) throw new Error('Student profile link not returned');
  if (!studentLink.endsWith('/progress')) throw new Error('Student progress link missing');
  const studentId = studentLink.split('/').at(-2)!;
  const student = await browser.newContext(); const studentPage = await student.newPage();
  await studentPage.goto(invitation);
  await studentPage.getByLabel('Creá una contraseña').fill('workout-browser-student-12345');
  await studentPage.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(studentPage.getByText('Tu cuenta está lista. Ya podés ingresar.')).toBeVisible();
  await studentPage.goto('/login');
  await studentPage.getByLabel('Correo electrónico').fill(studentEmail);
  await studentPage.getByLabel('Contraseña').fill('workout-browser-student-12345');
  await studentPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(studentPage.getByRole('link', { name: 'Mi programa →' })).toBeVisible();
  const csrf = (await coach.cookies()).find((cookie) => cookie.name === 'machi_csrf')?.value;
  if (!csrf) throw new Error('Trainer CSRF cookie missing');
  const headers = { Origin: origin, 'X-CSRF-Token': csrf };
  const current = await coachPage.request.get('/api/v1/me');
  const me = (await current.json()) as { data: { organizationId: string } };
  const planId = `demo-plan-${me.data.organizationId}`;
  const assigned = await coachPage.request.post(`/api/v1/students/${studentId}/plan-assignment`, { headers, data: { planId, startDate: new Date().toISOString().slice(0, 10) } });
  expect(assigned.status()).toBe(201);
  const planVersionId = `demo-version-${me.data.organizationId}`;
  const versionResult = await coachPage.request.get(`/api/v1/plan-versions/${planVersionId}`);
  const version = (await versionResult.json()) as { data: { workouts: { id: string }[] } };
  const template = version.data.workouts[0];
  if (!template) throw new Error('Demo program is missing a workout template');
  const scheduled = await coachPage.request.post(`/api/v1/students/${studentId}/workout-sessions`, { headers, data: { workoutTemplateId: template.id, scheduledDate: new Date().toISOString().slice(0, 10), requestKey: randomUUID() } });
  expect(scheduled.status()).toBe(201);
  const workout = (await scheduled.json()) as { data: { id: string; exercises: { sets: { id: string }[] }[] } };
  const firstSet = workout.data.exercises[0]?.sets[0];
  if (!firstSet) throw new Error('Demo occurrence has no initialized set');
  return { coach, coachPage, student, studentPage, studentId, sessionId: workout.data.id, setId: firstSet.id };
}
async function completeFirstSet(page: Page, weight = '42.5') {
  const first = page.locator('.set-entry').first();
  await first.getByLabel('Peso realizado (kg)').fill(weight);
  await first.getByLabel('Repeticiones realizadas').fill('9');
  await first.getByLabel('RIR realizado (opcional)').fill('2');
  await first.getByRole('button', { name: 'Completar serie' }).click();
  await expect(page.locator('.workout-progress').getByText('1 de 9 series completadas')).toBeVisible();
}

test('alumno realiza todas las series y entrenador inspecciona el resultado', async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await prepare(browser);
  try {
    const page = fixture.studentPage;
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'Cuerpo completo A' })).toBeVisible();
    await page.getByRole('link', { name: 'Comenzar entrenamiento' }).click();
    await page.getByRole('button', { name: 'Comenzar entrenamiento' }).click();
    await expect(page.locator('.workout-progress').getByText('0 de 9 series completadas')).toBeVisible();
    await page.getByRole('button', { name: 'Ver técnica' }).first().click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sentadilla goblet' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/ilustración de referencia/i)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar técnica' }).click();
    await completeFirstSet(page);
    await expect(page.getByRole('timer')).toBeVisible();
    const entries = page.locator('.set-entry');
    const total = await entries.count();
    expect(total).toBe(9);
    for (let index = 1; index < total; index++) {
      const row = entries.nth(index);
      await row.getByLabel('Peso realizado (kg)').fill('40');
      await row.getByLabel('Repeticiones realizadas').fill('8');
      await row.getByLabel('RIR realizado (opcional)').fill('2');
      await row.getByRole('button', { name: 'Completar serie' }).click();
    }
    await expect(page.locator('.workout-progress').getByText('9 de 9 series completadas')).toBeVisible();
    await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
    await expect(page.getByRole('heading', { name: 'Todas las series quedaron guardadas.' })).toBeVisible();
    await page.goto('/student/workouts');
    await expect(page.getByRole('link', { name: /Cuerpo completo A.*Completado/ })).toBeVisible();
    await fixture.coachPage.goto(`/trainer/workouts/${fixture.sessionId}`);
    await expect(fixture.coachPage.getByRole('heading', { name: '9 de 9 series completadas' })).toBeVisible();
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});

test('un set guardado y el descanso sobreviven una recarga; el workout continúa', async ({ browser }) => {
  test.setTimeout(120_000);
  const fixture = await prepare(browser);
  try {
    const page = fixture.studentPage;
    await page.goto(`/student/workouts/${fixture.sessionId}`);
    await page.getByRole('button', { name: 'Comenzar entrenamiento' }).click();
    await completeFirstSet(page, '37.5');
    const pending = page.locator('.set-entry').nth(1);
    await pending.getByLabel('Peso realizado (kg)').fill('28');
    await pending.getByLabel('Repeticiones realizadas').fill('7');
    await page.reload();
    await expect(page.locator('.workout-progress').getByText('1 de 9 series completadas')).toBeVisible();
    await expect(page.locator('.set-entry').first().getByLabel('Peso realizado (kg)')).toHaveValue('37.5');
    await expect(page.locator('.set-entry').nth(1).getByLabel('Peso realizado (kg)')).toHaveValue('28');
    await expect(page.locator('.set-entry').nth(1).getByText('Tenés cambios locales pendientes de guardar.')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.goto('/student');
    await expect(page.getByRole('link', { name: 'Continuar entrenamiento' })).toBeVisible();
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});

test('finalizar parcial registra motivo y preserva sets; no puede cambiar otro alumno', async ({ browser }) => {
  test.setTimeout(150_000);
  const fixture = await prepare(browser);
  try {
    const page = fixture.studentPage;
    await page.goto(`/student/workouts/${fixture.sessionId}`);
    await page.getByRole('button', { name: 'Comenzar entrenamiento' }).click();
    await completeFirstSet(page);
    await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
    await expect(page.getByText('Todavía quedan ejercicios sin completar.')).toBeVisible();
    await page.getByLabel('¿Por qué terminás antes?').selectOption('DISCOMFORT_OR_PAIN');
    await page.getByLabel('Zona de la molestia (opcional)').selectOption('RIGHT_KNEE');
    await page.getByRole('button', { name: 'Finalizar aunque falten series' }).click();
    await expect(page.getByRole('heading', { name: 'Guardamos el entrenamiento parcial y las series realizadas.' })).toBeVisible();
    await expect(page.getByText('Molestia o dolor')).toBeVisible();
    const own = await page.request.get(`/api/v1/workout-sessions/${fixture.sessionId}`);
    expect((await own.json()).data.safetyEvents).toHaveLength(1);
    const other = await prepare(browser);
    try {
      expect((await page.request.get(`/api/v1/workout-sessions/${other.sessionId}`)).status()).toBe(404);
      const csrf = (await fixture.student.cookies()).find((cookie) => cookie.name === 'machi_csrf')?.value;
      const illicit = await page.request.put(`/api/v1/workout-sessions/${other.sessionId}/sets/${other.setId}`, { headers: { Origin: origin, 'X-CSRF-Token': csrf ?? '' }, data: { version: 1, completionState: 'COMPLETED', actualLoadKg: '50', actualRepetitions: 8, rir: 2, rpe: null } });
      expect(illicit.status()).toBe(404);
    } finally { await other.student.close(); await other.coach.close(); }
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});
