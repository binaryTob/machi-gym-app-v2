import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('entrenador publica y asigna un programa; alumno ve solo su prescripción', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Configure seed owner credentials for browser tests');
  const unique = randomUUID().slice(0, 7);
  const name = `Fuerza guiada ${unique}`;
  const studentName = `Alumno Programa ${unique}`;
  const studentEmail = `plan-e2e-${randomUUID()}@example.test`;

  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('link', { name: 'Diseñar programas →' }).click();
  await page.getByLabel('Nombre del programa').fill(name);
  await page.getByLabel('Objetivo del programa').selectOption('STRENGTH');
  await Promise.all([page.waitForURL(/\/trainer\/plans\/c[a-z0-9]+$/, { timeout: 30_000 }), page.getByRole('button', { name: 'Crear borrador' }).click()]);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByLabel('Nombre del entrenamiento').fill('Entrenamiento A');
  await page.getByLabel('Etiqueta de sesión (opcional)').fill('Sesión A');
  await page.getByRole('button', { name: 'Añadir entrenamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento A' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir ejercicio de la biblioteca' }).click();
  await page.getByLabel('Buscar ejercicio para agregar').fill('Sentadilla goblet');
  await expect(page.getByText('Sentadilla goblet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar ejercicio' }).click();
  await expect(page.getByText('3 × 8–10 repeticiones')).toBeVisible();
  await page.getByLabel('Series').fill('4');
  await page.getByLabel('Repeticiones mínimas').fill('8');
  await page.getByLabel('Repeticiones máximas').fill('10');
  await page.getByLabel('Esfuerzo objetivo').selectOption('RIR');
  await page.getByLabel('Repeticiones en reserva (RIR)').fill('2');
  await page.getByLabel('Descanso en segundos').fill('120');
  await page.getByRole('button', { name: 'Guardar indicación' }).click();
  await expect(page.getByText('4 × 8–10 repeticiones')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar versión' }).click();
  await expect(page.getByText('Versión publicada.')).toBeVisible();

  await page.goto('/trainer');
  await page.getByLabel('Nombre del alumno').fill(studentName);
  await page.getByLabel('Correo electrónico').fill(studentEmail);
  await page.getByRole('button', { name: 'Crear alumno y enlace' }).click();
  const invitation = await page.locator('.notice .mono').first().innerText();
  await page.goto(`/trainer/plans`);
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByLabel('Buscar alumno por nombre').fill(studentName);
  await page.getByRole('combobox', { name: 'Alumno', exact: true }).selectOption({ label: studentName });
  await expect(page.getByText('Este alumno no tiene un programa asignado.')).toBeVisible();
  await page.getByRole('button', { name: 'Asignar programa' }).click();
  await expect(page.getByText('Programa asignado.')).toBeVisible();

  const student = await browser.newContext();
  try {
    const view = await student.newPage();
    await view.goto(invitation);
    await view.getByLabel('Creá una contraseña').fill('plan-student-password-12345');
    await view.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(view.getByText('Tu cuenta está lista. Ya podés ingresar.')).toBeVisible();
    await view.goto('/login');
    await view.getByLabel('Correo electrónico').fill(studentEmail);
    await view.getByLabel('Contraseña').fill('plan-student-password-12345');
    await view.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await view.getByRole('link', { name: 'Mi programa →' }).click();
    await expect(view.getByRole('heading', { name: name })).toBeVisible();
    await expect(view.getByText('4 × 8–10 repeticiones')).toBeVisible();
    await expect(view.getByRole('link', { name: 'Ver ejercicio →' })).toBeVisible();
    await expect(view.getByRole('button', { name: 'Guardar indicación' })).toHaveCount(0);
    await expect(view.getByRole('button', { name: 'Publicar versión' })).toHaveCount(0);
    const forbidden = await view.request.post('/api/v1/training-plans', { headers: { Origin: 'http://localhost:3000' }, data: { name: 'No permitido', goal: 'STRENGTH' } });
    expect(forbidden.status()).toBe(403);
    await view.getByRole('link', { name: 'Ver ejercicio →' }).click();
    await expect(view.getByRole('heading', { name: 'Sentadilla goblet' })).toBeVisible();
  } finally { await student.close(); }
});
