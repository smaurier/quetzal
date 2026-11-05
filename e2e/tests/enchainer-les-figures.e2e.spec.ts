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
 * s affiche à l écran de l animatrice en direct, le code d entrée inchangé.
 *
 * Le statut n est volontairement pas asserti : voir le commentaire en fin de
 * test. Ce qui prouve la non-recréation est le code d entrée, pas le statut.
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

  // Tirer par l API et reclamer par l ecran de l eleve, jusqu a ce que le
  // serveur dise que la figure a change.
  //
  // ⚠️ Pourquoi l API pour tirer, alors qu un E2E devrait passer par l ecran.
  // Mesure du 05/11 : une boucle qui cliquait le bouton de tirage avec un
  // delai de quatre secondes sortait parfois tot, et le test echouait une fois
  // sur deux sans que rien ne soit casse. Le tirage n est pas le sujet de ce
  // test et il est deja couvert par `loto-teacher` et `loto-guest` ; ce qui est
  // teste ici, c est l enchainement des figures et son arrivee a l ecran. On
  // rend donc deterministe ce qui n est que decor, et on garde l interface la
  // ou elle prouve quelque chose : la reclamation de l eleve, et la lecture
  // finale de la progression.
  //
  // Le serveur ignore tout marquage client (decision D1 du domaine, cf.
  // claim.ts) : seules les cartes reellement tirees comptent, donc reclamer
  // sans rien marquer sur la tabla est fidele a ce que le serveur verifie.
  // La boucle ne calcule jamais quand `esquinas` est complete : elle tire,
  // reclame, et demande au serveur ou il en est.
  let avance = false;
  for (let i = 0; i < 54 && !avance; i++) {
    const tirage = await page.request.post(`/api/modules/loto/games/${game.id}/draw`, { headers: auth });
    if (!tirage.ok()) break; // paquet epuise

    try {
      await guest.getByTestId('claim').click({ timeout: 3000 });
    } catch {
      // Bloque par une penalite, ou partie finie : rien a faire ce tour.
    }

    const vu = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
    const etat = (await vu.json()) as { game: { patternPosition: number } };
    avance = etat.game.patternPosition === 2;
  }

  expect(avance, 'la premiere figure doit avoir ete gagnee et l index avance').toBe(true);

  // Et la preuve qui compte vraiment : l ecran de l animatrice l a appris en
  // direct, par la socket, sans rechargement. C est cette assertion qui a
  // trouve le 05/11 que `pattern-changed` etait emis et ecoute par personne.

  await expect(page.getByTestId('pattern-progress')).toHaveText(PROGRESS_2);

  // Tout l objet de l issue : la partie n a pas été recréée, donc les
  // téléphones n ont rien à rescanner.
  const relu = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  expect(relu.ok()).toBeTruthy();
  const apres = (await relu.json()) as { game: { joinCode: string; status: string } };
  expect(apres.game.joinCode).toBe(codeInitial);

  // Le statut n est PAS asserti a `running`, et c est delibere. Mesure du
  // 05/11 : l eleve gagne souvent la seconde figure dans la foulee, et la
  // partie se termine alors legitimement. Exiger `running` ici faisait echouer
  // le test sur un succes. Ce que l issue #30 doit prouver est ailleurs : le
  // code d entree n a pas change, donc la partie n a pas ete recreee, donc les
  // telephones n ont rien eu a rescanner. La progression lue plus haut
  // (figure 2 sur 2) prouve l enchainement lui-meme.
  expect(['running', 'finished']).toContain(apres.game.status);

  // Terminer la partie avant de rendre la main. Sans ça, ce test laisse une
  // partie en cours sur le jeu semé, et `requireUnlocked` leve alors
  // `DeckLockedError` sur toute modification de ce jeu : `loto-teacher`, qui y
  // ajoute une carte, echouait avec 54 cartes au lieu de 55. Mesure du 05/11.
  // Les tests ne sont pas isoles (`fullyParallel: false`, une seule base), donc
  // celui qui laisse de l etat durable casse ses voisins.
  if (apres.game.status !== 'finished') {
    const fin = await page.request.post(`/api/modules/loto/games/${game.id}/finish`, { headers: auth });
    expect(fin.ok(), 'la partie doit se terminer pour ne pas verrouiller le jeu').toBeTruthy();
  }

  // Le jeu doit etre libre en sortant, sinon le voisin casse. On le verifie
  // plutot que de l esperer : relire la partie et exiger `finished`.
  const verif = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  const final = (await verif.json()) as { game: { status: string } };
  expect(final.game.status, 'le jeu reste verrouille si la partie court encore').toBe('finished');

  await guestContext.close();
});
