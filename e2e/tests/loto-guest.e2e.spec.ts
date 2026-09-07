import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';

/**
 * Parcours invité complet du Lotería. Il solde le point laissé en réserve à la
 * fermeture de la dette du sous-projet 1 : le smoke existant ne couvre que
 * l utilisateur connecté, jamais l entrée par QR code.
 *
 * La partie est créée par l API et non par un écran : le formulaire de création
 * arrive à la tâche 38, et ce que ce test doit prouver est le parcours du
 * joueur, pas le formulaire de l animatrice.
 */

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/e-mail|email/i).fill(EMAIL);
  await page.getByLabel(/password|mot de passe|contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|se connecter|iniciar/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function bearer(page: Page): Promise<string> {
  const res = await page.request.get('/api/auth/token');
  expect(res.ok(), 'le host doit rendre un JWT à une session connectée').toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token, 'le JWT doit être présent').toBeTruthy();
  return body.token ?? '';
}

test('une partie entière, de la création à la victoire d un invité', async ({ page, browser }) => {
  test.slow();

  await login(page);
  const token = await bearer(page);
  const auth = { Authorization: `Bearer ${token}` };

  // Le jeu traditionnel vient du seed du module.
  const decksRes = await page.request.get('/api/modules/loto/decks', { headers: auth });
  expect(decksRes.ok()).toBeTruthy();
  const { decks } = (await decksRes.json()) as { decks: { id: string; cardCount: number }[] };
  const deck = decks.find((candidate) => candidate.cardCount >= 16);
  expect(deck, 'le seed du Lotería doit avoir posé la lotería traditionnelle').toBeDefined();

  // Pénalité à zéro : la boucle de tirage plus bas réclame à chaque tour et ne
  // doit pas se bloquer elle-même.
  const createRes = await page.request.post('/api/modules/loto/games', {
    headers: auth,
    data: { deckId: deck?.id, pattern: 'linea', maxTeams: 6, falseClaimPenaltyDraws: 0 },
  });
  expect(createRes.ok()).toBeTruthy();
  const game = (await createRes.json()) as { id: string; joinCode: string };
  expect(game.joinCode).toHaveLength(6);
  expect(game.joinCode, 'aucun caractère confondable de loin').not.toMatch(/[O0I1L]/);

  const openRes = await page.request.post(`/api/modules/loto/games/${game.id}/open`, { headers: auth });
  expect(openRes.ok()).toBeTruthy();

  // L écran animateur, celui qui est projeté au tableau.
  await page.goto(`/modules/loto/games/${game.id}`);
  await expect(page.getByTestId('join-code')).toHaveText(game.joinCode);

  const joinUrl = await page.getByTestId('join-url').innerText();
  expect(joinUrl, 'sans tenantId, la page d entrée rend « Missing tenantId »').toContain('tenantId=');

  // Un élève entre par l adresse que porte le QR code, depuis un contexte de
  // navigateur neuf : aucun cookie de session, exactement comme un téléphone.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(joinUrl);
  await guest.getByLabel(/nom|name|nombre/i).fill('Ana');
  await guest.getByRole('button', { name: /rejoindre|join|entrar/i }).click();

  // La tabla arrive sans qu on ait rien demandé : l affectation à une équipe se
  // fait au handshake, il n existe pas de message d entrée.
  const tabla = guest.getByTestId('tabla');
  await expect(tabla).toBeVisible();
  await expect(tabla.locator('button')).toHaveCount(16);

  // L animatrice voit l équipe arriver, en temps réel.
  await expect(page.getByTestId('teams')).toContainText('Ana');

  // Avant le premier tirage la partie est `open`, pas `running` : l écran
  // désactive la réclamation au lieu de la laisser partir pour se faire
  // refuser. Le serveur la refuserait de toute façon — c est la ceinture en
  // plus des bretelles, et c est le bon ordre des deux.
  await expect(guest.getByTestId('claim')).toBeDisabled();

  // Premier tirage : la partie passe en `running` et le bouton s active. Une
  // réclamation immédiate ne peut pas gagner — une carte ne fait pas une ligne
  // — et c est le SERVEUR qui doit la refuser. Le prouver de bout en bout, et
  // pas seulement en test unitaire, est le seul moyen de savoir que le refus
  // traverse vraiment la passerelle jusqu à l écran de l élève.
  await page.getByTestId('draw').click();
  await expect(guest.getByTestId('claim')).toBeEnabled();
  await guest.getByTestId('claim').click();
  await expect(guest.getByRole('alert')).toBeVisible();

  // Puis tirer jusqu à la victoire. La boucle réclame à chaque tour plutôt que
  // de calculer quand la figure est complète : le test ne doit pas
  // réimplémenter la règle qu il vérifie.
  for (let i = 0; i < 54; i++) {
    if (await page.getByTestId('winner').isVisible()) break;
    // La partie peut se terminer entre ce contrôle et le clic : le bouton se
    // désactive alors, et cliquer dessus bloquerait le test quatre-vingt-dix
    // secondes pour finir sur un message trompeur.
    // La partie peut se terminer pendant le clic lui-même : le bouton se
    // désactive alors et Playwright réessaierait quatre-vingt-dix secondes
    // avant d échouer sur un message trompeur. Un délai court et une sortie
    // propre valent mieux qu un garde préalable, qui laisse la fenêtre ouverte.
    try {
      await page.getByTestId('draw').click({ timeout: 4000 });
    } catch {
      break;
    }
    await guest.waitForTimeout(60);
    try {
      await guest.getByTestId('claim').click({ timeout: 2000 });
    } catch {
      // Bouton bloqué par une pénalité ou partie finie : rien à faire ce tour.
    }
    await guest.waitForTimeout(60);
  }

  await expect(page.getByTestId('winner')).toBeVisible();
  await expect(guest.getByTestId('finished')).toBeVisible();

  await guestContext.close();
});
