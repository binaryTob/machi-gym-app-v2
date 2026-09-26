import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('entrenador invita y edita el perfil; alumno ingresa sin acceso al panel', async ({ page, browser }) => {
  const ownerEmail = process.env.SEED_ADMIN_EMAIL;
  const ownerPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!ownerEmail || !ownerPassword) throw new Error('Configure SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD for E2E');
  const email = `e2e-${randomUUID()}@example.test`;
  const studentName = 'Ana Prueba';
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(ownerEmail);
  await page.getByLabel('Contraseña').fill(ownerPassword);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Qué bueno verte/ })).toBeVisible();
  await page.getByLabel('Nombre del alumno').fill(studentName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Crear alumno y enlace' }).click();
  await expect(page.getByText('Compartí este enlace una sola vez')).toBeVisible();
  const invitation = await page.locator('.notice .mono').first().innerText();
  await page.getByRole('link', { name: /Ana Prueba/ }).click();
  await expect(page.getByRole('heading', { name: studentName })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana Actualizada');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Actualizada' })).toBeVisible();

  const student = await browser.newContext();
  try {
    const studentPage = await student.newPage();
    await studentPage.goto(invitation);
    await studentPage.getByLabel('Creá una contraseña').fill('clave-alumna-pruebas-123');
    await studentPage.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(studentPage.getByText('Tu cuenta está lista. Ya podés ingresar.')).toBeVisible();
    await studentPage.goto('/login');
    await studentPage.getByLabel('Correo electrónico').fill(email);
    await studentPage.getByLabel('Contraseña').fill('clave-alumna-pruebas-123');
    await studentPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(studentPage.getByRole('heading', { name: 'Hola, Ana Actualizada.' })).toBeVisible();
    const forbidden = await studentPage.request.get('/api/v1/trainer/dashboard');
    expect(forbidden.status()).toBe(403);
    await studentPage.goto('/trainer');
    await expect(studentPage).toHaveURL(/\/student$/);
  } finally { await student.close(); }
});
