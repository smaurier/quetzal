import { test, expect, type Page } from '@playwright/test';


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
const ADD_CARD_LABEL = /^(ajouter une carte|add a card|añadir una carta)$/i;
const NEW_CARD_NAME_LABEL = /^(nom de la nouvelle carte|name of the new card|nombre de la nueva carta)$/i;

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

  // `isTemplate` et non `cardCount >= 54` : le compte n identifie rien d unique
  // des lors que des copies de travail existent, et `find` prendrait la
  // premiere venue — y compris une copie qu un autre test a laissee derriere
  // lui, peut-etre verrouillee par une partie en cours. Le gabarit du seed est
  // le seul jeu dont `isTemplate` soit vrai : `duplicate` le met a `false`.
  const gabarit = decks.find((candidate) => candidate.isTemplate);
  expect(gabarit, 'le seed doit avoir posé la lotería traditionnelle comme gabarit').toBeDefined();

  // ⚠️ Ce test AJOUTE une carte, et `addCard` passe par `requireUnlocked`. Les
  // deux faits en font un danger pour les autres tests s il travaille sur le
  // gabarit : mesure du 07/11, la base locale portait 58 cartes au lieu de 54,
  // soit quatre executions qui avaient chacune laisse la leur. Un test qui
  // modifie une donnee partagee rend l ordre des tests significatif, et la
  // suite devient instable sans que rien ne soit casse dans le produit.
  // D ou une copie, que ce test possede et supprime en partant. Dupliquer ne
  // prend aucun verrou, c est explicitement prevu pour ca.
  const copieRes = await page.request.post('/api/modules/loto/decks', {
    headers: auth,
    data: { name: `e2e animatrice ${Date.now()}`, duplicateOf: gabarit?.id },
  });
  expect(copieRes.ok(), 'la copie de travail doit pouvoir être créée').toBeTruthy();
  const deck = (await copieRes.json()) as Deck;
  expect(deck.cards.length, 'la copie doit porter les cartes du gabarit').toBeGreaterThanOrEqual(54);

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

  // --- Issue #26 : le bouton d ajout. Il appelait PATCH avec un rang calcule
  // cote client, donc un updateMany qui ne touchait aucune ligne, et un
  // libelle vide que le schema du PATCH refusait de toute facon. Partir d un
  // jeu vierge etait impossible. Ici le geste complet, de l ecran jusqu a la
  // relecture par l API. ---
  const avant = deck.cards.length;

  // #102 : une carte est toujours nommee. Sans nom, le bouton ne cree rien.
  const ajouter = page.getByRole('button', { name: ADD_CARD_LABEL });
  await expect(ajouter).toBeDisabled();
  await page.getByLabel(NEW_CARD_NAME_LABEL).fill('El Nopal');
  await expect(ajouter).toBeEnabled();
  await ajouter.click();

  // La carte apparait a l ecran, au rang que le SERVEUR a decide.
  const cartes = page.getByTestId('deck-cards').getByRole('listitem');
  await expect(cartes).toHaveCount(avant + 1);
  await expect(page.getByLabel(cardNameLabel(avant + 1), { exact: true })).toBeVisible();

  // Et elle existe vraiment en base, pas seulement dans l etat React.
  const relu = await page.request.get(`/api/modules/loto/decks/${deck.id}`, { headers: auth });
  expect(relu.ok()).toBeTruthy();
  const apres = (await relu.json()) as Deck;
  expect(apres.cards).toHaveLength(avant + 1);
  expect(apres.cards.at(-1)?.rank).toBe(avant + 1);
  expect(apres.cards.at(-1)?.label, 'la carte porte le nom saisi avant sa creation').toBe('El Nopal');

  // Rendre la base telle qu on l a trouvee. Sans ca, chaque execution laisse
  // une copie derriere elle et `list()` se remplit de jeux morts.
  const menage = await page.request.delete(`/api/modules/loto/decks/${deck.id}`, { headers: auth });
  expect(menage.ok(), 'la copie de travail doit pouvoir être supprimée').toBeTruthy();
});
