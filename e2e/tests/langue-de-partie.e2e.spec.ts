import { test, expect } from '@playwright/test';

// Le navigateur annonce le français. Si la page invité rend de l'espagnol,
// c'est que la langue de la partie a primé — et l'attribut lang doit suivre,
// sans quoi un lecteur d'écran prononcerait l'espagnol à la française.
test.use({ locale: 'fr-FR' });

test("la page invité déclare la langue de la partie, pas celle de l'appareil", async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant&lang=es');
  expect(await response!.text()).toMatch(/<html[^>]*lang="es"/);
});

test("sans langue de partie, l'appareil garde la sienne", async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant');
  expect(await response!.text()).toMatch(/<html[^>]*lang="fr"/);
});

test('une langue inconnue est ignorée, pas recopiée', async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant&lang=de');
  const html = await response!.text();
  expect(html).toMatch(/<html[^>]*lang="fr"/);
  expect(html).not.toContain('lang="de"');
});

test("le paramètre n'a aucun effet hors des pages invité", async ({ page }) => {
  // Restreindre la portée au segment /j/ évite qu'une URL partagée du
  // tableau de bord change la langue de qui la reçoit.
  const response = await page.goto('/login?lang=es');
  expect(await response!.text()).toMatch(/<html[^>]*lang="fr"/);
});
