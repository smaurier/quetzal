import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';
const PROGRESS_1 = /(figure 1 sur 2|pattern 1 of 2|figura 1 de 2)/i;
const PROGRESS_2 = /(figure 2 sur 2|pattern 2 of 2|figura 2 de 2)/i;

/**
 * Issue #30 : l animatrice enchaîne plusieurs figures sans que la partie soit
 * recréée, donc sans que les téléphones des élèves aient quoi que ce soit à
 * rescanner. La preuve tient en trois temps : un invité rejoint comme dans
 * `loto-guest.e2e.spec.ts`, la première figure (esquinas) est gagnée par une
 * réclamation réelle passée par le serveur, et la seconde figure (linea)
 * s affiche sans que le joinCode ni le statut `running` n aient changé.
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

interface DeckSummary {
  id: string;
  cardCount: number;
}

test('une partie enchaine deux figures sans etre recreee', async ({ page, browser }) => {
  test.slow();

  await login(page);
  const token = await bearer(page);
  const auth = { Authorization: `Bearer ${token}` };

  // Le jeu traditionnel vient du seed du module, comme dans loto-teacher.
  const decksRes = await page.request.get('/api/modules/loto/decks', { headers: auth });
  expect(decksRes.ok()).toBeTruthy();
  const { decks } = (await decksRes.json()) as { decks: DeckSummary[] };
  const deck = decks.find((candidate) => candidate.cardCount >= 54);
  expect(deck, 'le seed du Lotería doit avoir posé la lotería traditionnelle').toBeDefined();

  // `esquinas` puis `linea` : les deux tombent avant la fin du paquet de
  // cinquante-quatre cartes. La `llena` demanderait presque tout le paquet
  // en plus d une réclamation gagnante de plus, pour prouver la même chose.
  const createRes = await page.request.post('/api/modules/loto/games', {
    headers: auth,
    data: {
      deckId: deck?.id,
      patterns: ['esquinas', 'linea'],
      maxTeams: 6,
      falseClaimPenaltyDraws: 0,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const game = (await createRes.json()) as { id: string; joinCode: string };
  const codeInitial = game.joinCode;

  const openRes = await page.request.post(`/api/modules/loto/games/${game.id}/open`, { headers: auth });
  expect(openRes.ok()).toBeTruthy();

  // L écran animateur, celui qui est projeté au tableau.
  await page.goto(`/modules/loto/games/${game.id}`);
  await expect(page.getByTestId('join-code')).toHaveText(game.joinCode);
  const joinUrl = await page.getByTestId('join-url').innerText();

  // Un élève entre par l adresse que porte le QR code, depuis un contexte de
  // navigateur neuf : aucun cookie de session, exactement comme un téléphone.
  // C est la pièce qui manquait au squelette de départ (voir le rapport) :
  // sans cette équipe, aucune réclamation ne peut exister et l index de
  // figure ne peut jamais avancer.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(joinUrl);
  await guest.getByLabel(/nom|name|nombre/i).fill('Ana');
  await guest.getByRole('button', { name: /rejoindre|join|entrar/i }).click();

  const tabla = guest.getByTestId('tabla');
  await expect(tabla).toBeVisible();

  // L animatrice voit l équipe arriver, en temps réel.
  await expect(page.getByTestId('teams')).toContainText('Ana');

  // La progression n existe PAS encore à l écran ici : le composant sort tôt
  // pour les statuts `draft` et `open`, et la ligne vit dans le retour final,
  // qui ne couvre que `running` et `finished`. D où ce premier tirage.
  await page.getByTestId('draw').click();
  await expect(page.getByTestId('pattern-progress')).toHaveText(PROGRESS_1);

  // Tirer jusqu à ce que la progression passe à la seconde figure, en
  // réclamant à chaque tour comme le ferait un élève qui croit avoir gagné.
  // Le serveur ignore tout marquage client (décision D1 du domaine, cf.
  // claim.ts) : seules les cartes réellement tirées comptent, donc réclamer
  // sans rien marquer sur la tabla est fidèle à ce que le serveur vérifie
  // vraiment. La boucle ne calcule pas quand `esquinas` est complète : elle
  // tire et réclame, ce qui ne duplique pas la règle du domaine dans le test.
  for (let i = 0; i < 54; i++) {
    const progress = await page.getByTestId('pattern-progress').textContent();
    if (PROGRESS_2.test(progress ?? '')) break;
    // La partie peut se terminer entre ce contrôle et le clic, ou pendant le
    // clic lui-même : le bouton se désactive alors et Playwright réessaierait
    // longtemps avant d échouer sur un message trompeur. Un délai court et
    // une sortie propre valent mieux qu un garde préalable.
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

  await expect(page.getByTestId('pattern-progress')).toHaveText(PROGRESS_2);

  // Tout l objet de l issue : la partie n a pas été recréée, donc les
  // téléphones n ont rien à rescanner.
  const relu = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  expect(relu.ok()).toBeTruthy();
  const apres = (await relu.json()) as { game: { joinCode: string; status: string } };
  expect(apres.game.joinCode).toBe(codeInitial);
  expect(apres.game.status).toBe('running');

  await guestContext.close();
});
