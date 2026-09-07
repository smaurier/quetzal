import { test, expect, type BrowserContext } from '@playwright/test';

const THEME_COOKIE = 'quetzal-theme';

async function setTheme(context: BrowserContext, value: string) {
  const url = process.env['E2E_HOST_URL'] ?? 'http://localhost:3000';
  await context.addCookies([{ name: THEME_COOKIE, value, url }]);
}

test('la classe dark est dans la première réponse, pas ajoutée après coup', async ({
  page,
  context,
}) => {
  await setTheme(context, 'dark');
  // On lit le HTML servi, pas le DOM après hydratation : c'est la différence
  // entre « pas de clignotement » et « clignotement qu'on n'a pas vu ».
  const response = await page.goto('/login');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*dark/);
});

test('le mode clair explicite pose .light, qui retire la main au système', async ({
  page,
  context,
}) => {
  await setTheme(context, 'light');
  const response = await page.goto('/login');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*light/);
});

test('le mode système ne pose aucune classe', async ({ page, context }) => {
  await setTheme(context, 'system');
  const response = await page.goto('/login');
  // React rend `class=""` plutôt que d'omettre l'attribut : l'assertion porte
  // donc sur l'absence des deux noms, pas sur l'absence de l'attribut.
  expect(await response!.text()).not.toMatch(/<html[^>]*class="[^"]*(?:dark|light)/);
});

test('le fond suit réellement le mode, jeton compris', async ({ page, context }) => {
  await setTheme(context, 'dark');
  await page.goto('/login');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // hsl(165 24% 7%) une fois résolu par le navigateur.
  expect(background).toBe('rgb(14, 22, 20)');
});

test("la page invité respecte la préférence, alors qu'elle n'a pas de session", async ({
  page,
  context,
}) => {
  // Le cas que la colonne en base ne couvrirait pas : un élève arrivé par QR.
  await setTheme(context, 'dark');
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*dark/);
});

test('la couleur du navigateur mobile est déclarée pour les deux modes', async ({ page }) => {
  // Une seule valeur remplacerait un décalage par un autre : la barre
  // d'adresse resterait claire sous une page sombre, ou l'inverse.
  const response = await page.goto('/login');
  const html = await response!.text();
  expect(html).toMatch(
    /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="[^"]+"/,
  );
  expect(html).toMatch(
    /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="[^"]+"/,
  );
});
