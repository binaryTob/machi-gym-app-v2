import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const origin = 'http://localhost:3000';
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}
async function coach(page: Page): Promise<string> {
  await login(page, process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
  await expect(page.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
  const response = await page.request.get('/api/v1/me');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: { organizationId: string } }).data.organizationId;
}
async function getStudent(browser: Browser, organizationId: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(); const page = await context.newPage();
  await login(page, `demo-${organizationId}@example.test`, process.env.SEED_STUDENT_PASSWORD!);
  await expect(page.getByRole('link', { name: 'Ver mi progreso →' })).toBeVisible();
  return { context, page };
}
async function ensureRecentSession(coachPage: Page, studentPage: Page, org: string) {
  const trainerCsrf = (await coachPage.context().cookies()).find((item) => item.name === 'machi_csrf')?.value;
  const studentCsrf = (await studentPage.context().cookies()).find((item) => item.name === 'machi_csrf')?.value;
  const studentId = `demo-student-${org}`;
  const result = await coachPage.request.post(`/api/v1/students/${studentId}/workout-sessions`, { headers: { Origin: origin, 'X-CSRF-Token': trainerCsrf ?? '' },
    data: { workoutTemplateId: `demo-workout-a-${org}`, scheduledDate: new Date().toISOString().slice(0, 10), requestKey: crypto.randomUUID() } });
  expect(result.status()).toBe(201);
  const session = (await result.json()) as { data: { id: string; exercises: { sets: { id: string }[] }[] } };
  const id = session.data.id;
  const headers = { Origin: origin, 'X-CSRF-Token': studentCsrf ?? '' };
  expect((await studentPage.request.post(`/api/v1/workout-sessions/${id}/start`, { headers, data: {} })).status()).toBe(201);
  const firstSet = session.data.exercises[0]?.sets[0]?.id;
  if (!firstSet) throw new Error('Demo workout is missing sets');
  expect((await studentPage.request.put(`/api/v1/workout-sessions/${id}/sets/${firstSet}`, { headers, data: { version: 1, completionState: 'COMPLETED', actualLoadKg: '25', actualRepetitions: 8, rir: 2, rpe: null } })).status()).toBe(200);
  const current = await studentPage.request.get(`/api/v1/workout-sessions/${id}`);
  const workout = (await current.json()) as { data: { version: number } };
  expect((await studentPage.request.post(`/api/v1/workout-sessions/${id}/finish`, { headers, data: { version: workout.data.version, partialReason: 'LACK_OF_TIME' } })).status()).toBe(201);
}

test('trainer edits and approves an initial AI suggestion into a separate draft; student sees no controls', async ({ page, browser }) => {
  const org = await coach(page); const studentId = `demo-student-${org}`;
  await page.goto(`/trainer/students/${studentId}/ai`);
  await page.getByRole('button', { name: 'Generar propuesta inicial' }).click();
  await expect(page.getByRole('heading', { name: 'Propuesta inicial basada en perfil · READY' })).toBeVisible();
  await expect(page.getByText('La IA sólo sugiere.')).toBeVisible();
  await page.getByLabel('Series').first().fill('2');
  await page.getByRole('button', { name: 'Guardar edición' }).click();
  await page.getByRole('button', { name: 'Aprobar y crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Propuesta inicial basada en perfil · APPROVED' })).toBeVisible();
  const draft = page.getByRole('link', { name: /Ver borrador y publicar por separado/ });
  await expect(draft).toBeVisible();
  await draft.click();
  await expect(page.getByRole('button', { name: 'Publicar versión' })).toBeVisible();
  const student = await getStudent(browser, org);
  try {
    await student.page.goto(`/trainer/students/${studentId}/ai`);
    await expect(student.page).toHaveURL(/\/student$/);
    expect((await student.page.request.get(`/api/v1/students/${studentId}/ai-proposals`)).status()).toBe(403);
  } finally { await student.context.close(); }
});

test('trainer sees adaptation differences, can reject and approve a fresh proposal without changing assignment', async ({ page, browser }) => {
  const org = await coach(page); const studentId = `demo-student-${org}`;
  const planResponse = await page.request.get(`/api/v1/training-plans/demo-plan-${org}`);
  const plan = (await planResponse.json()) as { data: { versions: { id: string; status: string; revision: number }[] } };
  const priorDraft = plan.data.versions.find((version) => version.status === 'DRAFT');
  if (priorDraft) {
    const csrf = (await page.context().cookies()).find((item) => item.name === 'machi_csrf')?.value;
    expect((await page.request.post(`/api/v1/plan-versions/${priorDraft.id}/void`, { headers: { Origin: origin, 'X-CSRF-Token': csrf ?? '' },
      data: { revision: priorDraft.revision, reason: 'Limpieza del borrador previo de la prueba E2E' } })).status()).toBe(201);
  }
  const student = await getStudent(browser, org);
  try { await ensureRecentSession(page, student.page, org); }
  finally { await student.context.close(); }
  await page.goto(`/trainer/students/${studentId}/ai`);
  await page.getByRole('button', { name: 'Adaptar rutina actual' }).click();
  await expect(page.getByRole('heading', { name: 'Adaptación basada en progreso · READY' })).toBeVisible();
  await expect(page.getByText(/Series .* → .*/).first()).toBeVisible();
  page.once('dialog', (dialog) => { void dialog.accept('Prefiero mantener el plan actual.'); });
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByRole('heading', { name: 'Adaptación basada en progreso · REJECTED' })).toBeVisible();
  await page.getByRole('button', { name: 'Adaptar rutina actual' }).click();
  await expect(page.getByRole('heading', { name: 'Adaptación basada en progreso · READY' })).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar y crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Adaptación basada en progreso · APPROVED' })).toBeVisible();
  const assignment = await page.request.get(`/api/v1/students/${studentId}/plan-assignment`);
  const data = (await assignment.json()) as { data: { trainingPlanVersionId: string } };
  expect(data.data.trainingPlanVersionId).toBe(`demo-version-${org}`);
});
