import { test, expect } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'sylvain.maurier@gmail.com';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';

test('Elda logs in, sees Hello in sidebar, greets, pings', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/e-mail|email/i).fill(EMAIL);
  await page.getByLabel(/password|mot de passe|contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|se connecter|iniciar/i }).click();
  await page.waitForURL(/\/dashboard/);

  await expect(page.getByRole('link', { name: /hello|hola/i })).toBeVisible();
  await page.getByRole('link', { name: /hello|hola/i }).click();

  await page.getByRole('button', { name: /greet|saluer|saludar/i }).click();
  await expect(page.getByTestId('greet-result')).toContainText('Hello');

  await page.getByRole('button', { name: /^ping$/i }).click();
  await expect(page.getByTestId('ping-result')).toContainText(/latency/i);
});
