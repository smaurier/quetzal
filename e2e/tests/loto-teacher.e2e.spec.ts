import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';

/**
 * Preuve que les cinq contrôles étiquetés sur les écrans de l animatrice
 * tiennent réellement, par la voie qui les vérifie comme un lecteur d écran
 * le ferait : `getByLabel`. ESLint ne peut pas résoudre une association
 * htmlFor/id à travers l arbre — il a été essayé, une association correcte
 * était accusée cassée — donc rien d autre ne prouve qu un champ a un nom
 * accessible.
 *
 * `loto-guest.e2e.spec.ts` couvre déjà le parcours joueur ; celui-ci ne le
 * touche pas et prouve l autre moitié : la liste des jeux de cartes et
 * l éditeur, jamais gardés jusqu ici. Un seul test, une seule connexion :
 * l authentification Better-Auth limite les tentatives de connexion par
 * fenêtre glissante, et la suite entière (ce fichier compris) partage déjà
 * ce budget avec le smoke test et le parcours invité.
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

// Les trois catalogues (fr/en/es) portent le même texte pour chaque clé ; le
// test ne sait pas quelle locale le host va rendre, donc chacun des
// libellés couvre les trois plutôt que d en figer un seul.
const NEW_DECK_NAME_LABEL = /^(nom du nouveau jeu de cartes|new deck name|nombre de la nueva baraja)$/i;
const DECK_NAME_LABEL = /^(nom du jeu de cartes|deck name|nombre de la baraja)$/i;

function cardNameLabel(rank: number): RegExp {
  return new RegExp(`^(nom de la carte ${rank}|name of card ${rank}|nombre de la carta ${rank})$`, 'i');
}

function cardImageLabel(rank: number): RegExp {
  return new RegExp(
    `^(choisir une image pour la carte ${rank}|choose an image for card ${rank}|elegir una imagen para la carta ${rank})$`,
    'i',
  );
}

interface DeckSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
}

interface DeckCard {
  id: string;
  rank: number;
  label: string;
  imageId: string | null;
}

interface Deck extends DeckSummary {
  cards: DeckCard[];
}

test('écrans animatrice du Lotería : liste des jeux et éditeur exposent leurs champs par label', async ({
  page,
}) => {
  await login(page);

  // --- Liste des jeux de cartes : le champ de la tâche 38 (formulaire de
  // création), un champ texte sans role particulier, atteignable seulement
  // si htmlFor/id tiennent. ---
  await page.goto('/modules/loto');
  const newDeckName = page.getByLabel(NEW_DECK_NAME_LABEL, { exact: true });
  await expect(newDeckName).toBeVisible();
  await newDeckName.fill('Jeu de test e2e');
  await expect(newDeckName).toHaveValue('Jeu de test e2e');

  // --- Éditeur de jeu : nom du jeu, puis nom et image pour deux cartes
  // distinctes. ---
  const token = await bearer(page);
  const auth = { Authorization: `Bearer ${token}` };

  const decksRes = await page.request.get('/api/modules/loto/decks', { headers: auth });
  expect(decksRes.ok()).toBeTruthy();
  const { decks } = (await decksRes.json()) as { decks: DeckSummary[] };
  const deckSummary = decks.find((candidate) => candidate.cardCount >= 54);
  expect(deckSummary, 'le seed doit avoir posé la lotería traditionnelle à 54 cartes').toBeDefined();

  const deckRes = await page.request.get(`/api/modules/loto/decks/${deckSummary?.id ?? ''}`, { headers: auth });
  expect(deckRes.ok()).toBeTruthy();
  const deck = (await deckRes.json()) as Deck;

  // Deux cartes choisies loin l une de l autre dans l ordre des rangs : rien
  // ne garantit qu elles soient adjacentes, et le point à prouver est que
  // CHAQUE carte a son propre nom, pas seulement les voisines.
  const cardA = deck.cards[6];
  const cardB = deck.cards[16];
  expect(cardA, 'la lotería traditionnelle a au moins 17 cartes').toBeDefined();
  expect(cardB, 'la lotería traditionnelle a au moins 17 cartes').toBeDefined();
  if (cardA === undefined || cardB === undefined) return;
  expect(cardA.rank).not.toBe(cardB.rank);

  await page.goto(`/modules/loto/decks/${deck.id}`);

  const deckName = page.getByLabel(DECK_NAME_LABEL, { exact: true });
  await expect(deckName).toBeVisible();
  await expect(deckName).toHaveValue(deck.name);

  // Le point de la tâche 44 : le label dit explicitement de quelle carte il
  // s agit. Une régression qui donnerait le même libellé aux cinquante-
  // quatre cartes casserait `getByLabel(exact: true)` ici — soit en violation
  // de mode strict (plusieurs correspondances), soit en résolvant la
  // mauvaise carte — jamais silencieusement.
  const cardNameA = page.getByLabel(cardNameLabel(cardA.rank), { exact: true });
  const cardNameB = page.getByLabel(cardNameLabel(cardB.rank), { exact: true });
  await expect(cardNameA).toBeVisible();
  await expect(cardNameB).toBeVisible();
  await expect(cardNameA).toHaveValue(cardA.label);
  await expect(cardNameB).toHaveValue(cardB.label);

  // Remplir l une ne doit jamais affecter l autre : la preuve que ce sont
  // deux éléments distincts, pas deux fois le même par accident du filtre.
  await cardNameA.fill('Marqueur carte A');
  await expect(cardNameA).toHaveValue('Marqueur carte A');
  await expect(cardNameB).toHaveValue(cardB.label);

  const cardImageA = page.getByLabel(cardImageLabel(cardA.rank), { exact: true });
  const cardImageB = page.getByLabel(cardImageLabel(cardB.rank), { exact: true });
  await expect(cardImageA).toHaveCount(1);
  await expect(cardImageB).toHaveCount(1);
  await expect(cardImageA).toHaveAttribute('type', 'file');

  const idA = await cardImageA.getAttribute('id');
  const idB = await cardImageB.getAttribute('id');
  expect(idA, 'les deux champs image doivent être des éléments DOM différents').not.toBe(idB);
});
