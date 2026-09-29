import { expect, test } from '@playwright/test';

test('trainer roster opens scoped student metrics, progress and discomfort facts', async ({ page }) => {
  const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Development seed credentials required');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
  const row = page.getByRole('link', { name: /Alumno de demostración/ }).first();
  await expect(row).toContainText('adherencia');
  await row.click();
  await expect(page.getByRole('heading', { name: 'Progreso de Alumno de demostración' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrenamientos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progresión por ejercicio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Molestias reportadas' })).toBeVisible();
  await page.getByLabel('Período').selectOption('previous-month');
  await expect(page.getByText(/Mes anterior:|Sin series|kg ×/).first()).toBeVisible();
});

test('mobile student views monthly summary, exercise progression and recorded weight chart', async ({ browser }) => {
  const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_STUDENT_PASSWORD;
  if (!email || !password) throw new Error('Development seed credentials required');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    // The demo student's email uses the seed owner's organization id.
    const owner = await browser.newContext(); const ownerPage = await owner.newPage();
    try {
      await ownerPage.goto('/login');
      await ownerPage.getByLabel('Correo electrónico').fill(email);
      await ownerPage.getByLabel('Contraseña').fill(process.env.SEED_ADMIN_PASSWORD!);
      await ownerPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await expect(ownerPage.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
      const response = await ownerPage.request.get('/api/v1/me');
      expect(response.ok()).toBe(true);
      const payload = (await response.json()) as { data: { organizationId: string } };
      await page.getByLabel('Correo electrónico').fill(`demo-${payload.data.organizationId}@example.test`);
    } finally { await owner.close(); }
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.getByRole('link', { name: 'Ver mi progreso →' }).click();
    await expect(page.getByRole('heading', { name: 'Mi progreso' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial de peso' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Evolución del peso registrado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Progresión por ejercicio' })).toBeVisible();
    const month = new Date().toISOString().slice(0, 7);
    await page.getByLabel('Resumen mensual').fill(month);
    await expect(page.getByText('Informe provisional calculado desde los registros actuales')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resumen del período' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  } finally { await context.close(); }
});
