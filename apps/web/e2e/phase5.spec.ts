import { Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://localhost:3000';
type Fixture = { coach: BrowserContext; coachPage: Page; student: BrowserContext; studentPage: Page; studentId: string; sessionId: string };
async function prepare(browser: Browser): Promise<Fixture> {
  const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Seed owner credentials are required');
  const coach = await browser.newContext(); const coachPage = await coach.newPage();
  await coachPage.goto('/login');
  await coachPage.getByLabel('Correo electrónico').fill(email);
  await coachPage.getByLabel('Contraseña').fill(password);
  await coachPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(coachPage.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
  const csrf = (await coach.cookies()).find((cookie) => cookie.name === 'machi_csrf')?.value;
  if (!csrf) throw new Error('CSRF cookie missing');
  const headers = { Origin: origin, 'X-CSRF-Token': csrf };
  const studentEmail = `feedback-e2e-${randomUUID()}@example.test`;
  const created = await coachPage.request.post('/api/v1/student-invitations', { headers, data: { email: studentEmail, displayName: `Alumno feedback ${randomUUID().slice(0, 6)}` } });
  expect(created.status()).toBe(201);
  const invited = (await created.json()) as { data: { id: string; invitationToken: string } };
  const student = await browser.newContext(); const studentPage = await student.newPage();
  await studentPage.goto(`/accept?token=${encodeURIComponent(invited.data.invitationToken)}`);
  await studentPage.getByLabel('Creá una contraseña').fill('feedback-browser-student-12345');
  await studentPage.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(studentPage.getByText('Tu cuenta está lista. Ya podés ingresar.')).toBeVisible();
  await studentPage.goto('/login');
  await studentPage.getByLabel('Correo electrónico').fill(studentEmail);
  await studentPage.getByLabel('Contraseña').fill('feedback-browser-student-12345');
  await studentPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(studentPage.getByRole('heading', { name: /Hola,/ })).toBeVisible();
  const me = (await (await coachPage.request.get('/api/v1/me')).json()) as { data: { organizationId: string } };
  const orgId = me.data.organizationId;
  const assignment = await coachPage.request.post(`/api/v1/students/${invited.data.id}/plan-assignment`, { headers, data: { planId: `demo-plan-${orgId}`, startDate: new Date().toISOString().slice(0, 10) } });
  expect(assignment.status()).toBe(201);
  const version = (await (await coachPage.request.get(`/api/v1/plan-versions/demo-version-${orgId}`)).json()) as { data: { workouts: { id: string }[] } };
  const template = version.data.workouts[0]; if (!template) throw new Error('Missing demo template');
  const scheduled = await coachPage.request.post(`/api/v1/students/${invited.data.id}/workout-sessions`, { headers, data: { workoutTemplateId: template.id, scheduledDate: new Date().toISOString().slice(0, 10), requestKey: randomUUID() } });
  expect(scheduled.status()).toBe(201);
  const occurrence = (await scheduled.json()) as { data: { id: string } };
  return { coach, coachPage, student, studentPage, studentId: invited.data.id, sessionId: occurrence.data.id };
}
async function finishWorkout(page: Page, sessionId: string, partial: boolean) {
  await page.goto(`/student/workouts/${sessionId}`);
  await page.getByRole('button', { name: 'Comenzar entrenamiento' }).click();
  const rows = page.locator('.set-entry');
  await expect(rows).toHaveCount(9);
  const total = partial ? 1 : await rows.count();
  for (let index = 0; index < total; index++) {
    const row = rows.nth(index);
    await row.getByLabel('Peso realizado (kg)').fill('30');
    await row.getByLabel('Repeticiones realizadas').fill('8');
    await row.getByLabel('RIR realizado (opcional)').fill('2');
    await row.getByRole('button', { name: 'Completar serie' }).click();
    await expect(page.locator('.workout-progress').getByText(`${index + 1} de 9 series completadas`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  if (partial) {
    await page.getByLabel('¿Por qué terminás antes?').selectOption('DISCOMFORT_OR_PAIN');
    await page.getByLabel('Zona de la molestia (opcional)').selectOption('RIGHT_KNEE');
    await page.getByLabel('Intensidad de la molestia (opcional)').fill('4');
    await page.getByRole('button', { name: 'Finalizar aunque falten series' }).click();
    await expect(page.getByRole('heading', { name: 'Guardamos el entrenamiento parcial y las series realizadas.' })).toBeVisible();
  } else await expect(page.getByRole('heading', { name: 'Todas las series quedaron guardadas.' })).toBeVisible();
}
async function chooseBasics(page: Page, effort: number, perceived: string, recovery: string) {
  await page.getByRole('group', { name: 'Esfuerzo general (1–10)' }).getByRole('button', { name: String(effort), exact: true }).click();
  await page.getByRole('group', { name: '¿Cómo te sentiste durante la sesión?' }).getByRole('button', { name: perceived, exact: true }).click();
  await page.getByRole('group', { name: '¿Cómo llegaste al entrenamiento?' }).getByRole('button', { name: recovery, exact: true }).click();
}

test('feedback normal después de completar: esfuerzo, estado, recuperación y sin molestias', async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await prepare(browser);
  try {
    await finishWorkout(fixture.studentPage, fixture.sessionId, false);
    await fixture.studentPage.getByRole('link', { name: 'Contar cómo me fue' }).click();
    await chooseBasics(fixture.studentPage, 7, 'Bien', 'Recuperado');
    await fixture.studentPage.getByRole('button', { name: 'No', exact: true }).click();
    await fixture.studentPage.getByLabel('Comentario general (opcional)').fill('Terminé con energía.');
    await fixture.studentPage.getByRole('button', { name: 'Guardar mis respuestas' }).click();
    await expect(fixture.studentPage.getByRole('heading', { name: '¡Entrenamiento registrado!' })).toBeVisible();
    await expect(fixture.studentPage.getByText('Sin molestias reportadas')).toBeVisible();
    await fixture.coachPage.goto(`/trainer/workouts/${fixture.sessionId}`);
    await expect(fixture.coachPage.getByRole('heading', { name: 'Feedback del alumno' })).toBeVisible();
    await expect(fixture.coachPage.getByText('7/10')).toBeVisible();
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});

test('molestia al terminar parcial: reutiliza evento temprano y admite otra zona', async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await prepare(browser);
  try {
    const page = fixture.studentPage;
    await finishWorkout(page, fixture.sessionId, true);
    const early = (await (await page.request.get(`/api/v1/workout-sessions/${fixture.sessionId}`)).json()) as { data: { safetyEvents: { id: string }[] } };
    await page.getByRole('link', { name: 'Contar cómo me fue' }).click();
    await expect(page.getByText('Ya registramos que finalizaste por una molestia.')).toBeVisible();
    await chooseBasics(page, 9, 'Muy pesado', 'Cansado');
    const first = page.locator('.discomfort-entry').first();
    await expect(first.getByLabel('¿Dónde sentiste la molestia?')).toHaveValue('RIGHT_KNEE');
    await first.getByLabel('Intensidad (1–10)').fill('5');
    await first.getByLabel('Ejercicio relacionado (opcional)').selectOption({ label: 'Sentadilla goblet' });
    await first.getByLabel('Detalle de esta molestia (opcional)').fill('La noté en el último descenso.');
    await page.getByRole('button', { name: 'Agregar otra zona' }).click();
    const second = page.locator('.discomfort-entry').nth(1);
    await second.getByLabel('¿Dónde sentiste la molestia?').selectOption('LOWER_BACK');
    await second.getByLabel('Intensidad (1–10)').fill('2');
    await page.getByRole('button', { name: 'Guardar mis respuestas' }).click();
    await expect(page.getByRole('heading', { name: '¡Entrenamiento registrado!' })).toBeVisible();
    await expect(page.getByText('Rodilla derecha · 5/10')).toBeVisible();
    await expect(page.getByText('Zona lumbar · 2/10')).toBeVisible();
    const saved = (await (await page.request.get(`/api/v1/workout-sessions/${fixture.sessionId}/feedback`)).json()) as { data: { feedback: { discomfortReports: { bodyRegion: string; safetyEventId: string }[] } } };
    expect(saved.data.feedback.discomfortReports.find((report) => report.bodyRegion === 'RIGHT_KNEE')?.safetyEventId).toBe(early.data.safetyEvents[0]?.id);
    await fixture.coachPage.goto(`/trainer/workouts/${fixture.sessionId}`);
    await expect(fixture.coachPage.getByText('Rodilla derecha · 5/10')).toBeVisible();
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});

test('omitir ahora y enviar desde historial durante la ventana vigente', async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await prepare(browser);
  try {
    const page = fixture.studentPage;
    await finishWorkout(page, fixture.sessionId, false);
    await page.getByRole('link', { name: 'Ahora no · Volver al inicio' }).click();
    await page.goto('/student/workouts');
    await page.getByRole('link', { name: /Cuerpo completo A.*Completado/ }).first().click();
    await page.getByRole('link', { name: 'Contar cómo me fue' }).click();
    await chooseBasics(page, 5, 'Normal', 'Normal');
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar mis respuestas' }).click();
    await expect(page.getByRole('heading', { name: '¡Entrenamiento registrado!' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Estas respuestas ya fueron enviadas y forman parte de tu historial.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar mis respuestas' })).toHaveCount(0);
  } finally { await fixture.student.close(); await fixture.coach.close(); }
});
