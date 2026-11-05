import { test as setup, expect } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';

export const FICHIER_SESSION = 'e2e/.auth/owner.json';

/**
 * Une connexion pour toute la suite, et une seule.
 *
 * Better-Auth limite les tentatives de connexion par fenêtre glissante, et le
 * budget est petit : trois. L'en-tête de `loto-teacher.e2e.spec.ts` le disait
 * déjà — « la suite entière partage ce budget » — et le 05/11 l'ajout d'un
 * quatrième test qui se connectait a fait tomber ce fichier sur
 * « Too many requests », après onze exécutions vertes d'affilée. Le test qui
 * cassait portait la réponse dans son propre commentaire.
 *
 * Chaque nouveau test qui se connectait lui-même rapprochait donc la suite du
 * mur, sans que rien ne le signale avant la rupture. Ici, la connexion est
 * faite une fois et son état est partagé : le nombre de tests n'entre plus
 * dans le budget.
 *
 * `hello.smoke.spec.ts` garde volontairement sa propre connexion par
 * l'interface : c'est lui qui prouve que l'écran de connexion fonctionne, et
 * il repart donc d'un contexte vierge. Deux connexions au total.
 */
setup('se connecter une fois pour toute la suite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/e-mail|email/i).fill(EMAIL);
  await page.getByLabel(/password|mot de passe|contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|se connecter|iniciar/i }).click();
  await page.waitForURL(/\/dashboard/);

  // Vérifier que la session est réelle avant de l'enregistrer : un état vide
  // ferait echouer toute la suite plus loin, avec des messages trompeurs.
  const jeton = await page.request.get('/api/auth/token');
  expect(jeton.ok(), 'la session doit rendre un JWT avant d être enregistrée').toBeTruthy();

  await page.context().storageState({ path: FICHIER_SESSION });
});
