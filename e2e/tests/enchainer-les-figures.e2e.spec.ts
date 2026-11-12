import { test, expect, type Page } from '@playwright/test';

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


async function bearer(page: Page): Promise<string> {
  const res = await page.request.get('/api/auth/token');
  expect(res.ok(), 'le host doit rendre un JWT à une session connectée').toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token, 'le JWT doit être présent').toBeTruthy();
  return body.token ?? '';
}

interface DeckSummary {
  id: string;
  isTemplate: boolean;
  cardCount: number;
}

test('une partie enchaine deux figures sans etre recreee', async ({ page, browser }) => {
  test.slow();

  const token = await bearer(page);
  const auth = { Authorization: `Bearer ${token}` };

  // Le jeu traditionnel vient du seed du module, comme dans loto-teacher.
  const decksRes = await page.request.get('/api/modules/loto/decks', { headers: auth });
  expect(decksRes.ok()).toBeTruthy();
  const { decks } = (await decksRes.json()) as { decks: DeckSummary[] };

  // `isTemplate` et non `cardCount >= 54` : une fois que des copies de travail
  // existent, le compte n identifie plus rien d unique et `find` prendrait la
  // premiere venue. `duplicate` met `isTemplate` a `false`, donc le gabarit du
  // seed reste le seul a le porter.
  const gabarit = decks.find((candidate) => candidate.isTemplate);
  expect(gabarit, 'le seed du Lotería doit avoir posé la lotería traditionnelle').toBeDefined();

  // ⚠️ Ce test ouvre une partie, et une partie `draft`/`open`/`running`
  // VERROUILLE son jeu : `ManageDecksUseCase.addCard` passe par
  // `requireUnlocked` et leve `DeckLockedError`. Ouvrir la partie sur le
  // gabarit rendrait donc le jeu semé inmodifiable pour tout test qui suit,
  // selon que celui-ci finit sa partie ou pas — c est-a-dire un couplage dont
  // l effet depend de l ordre et du hasard. La partie se joue sur une copie.
  const copieRes = await page.request.post('/api/modules/loto/decks', {
    headers: auth,
    data: { name: `e2e enchainement ${Date.now()}`, duplicateOf: gabarit?.id },
  });
  expect(copieRes.ok(), 'la copie de travail doit pouvoir être créée').toBeTruthy();
  const deck = (await copieRes.json()) as DeckSummary & { cards: unknown[] };
  const nbCartes = deck.cards.length;
  expect(nbCartes, 'la copie doit porter les cartes du gabarit').toBeGreaterThanOrEqual(54);

  // `esquinas` puis `linea` : les deux tombent avant la fin du paquet de
  // cinquante-quatre cartes. La `llena` demanderait presque tout le paquet
  // en plus d une réclamation gagnante de plus, pour prouver la même chose.
  const createRes = await page.request.post('/api/modules/loto/games', {
    headers: auth,
    data: {
      deckId: deck.id,
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
  //
  /**
   * ⛔ LA CAUSE DOMINANTE, ET ELLE TENAIT A CE SEUL CLIC. Mesure du 07/11/2026.
   *
   * Ce premier tirage etait le dernier a passer par le bouton, tous les autres
   * allant deja par l API — et c est lui qui faisait tomber le test une fois
   * sur deux en local. L artefact le disait sans ambiguite : echec sur
   * `PROGRESS_1`, `pattern-progress` **introuvable**, alors que l ecran
   * montrait le code d entree, l equipe arrivee et le bouton de tirage. Or
   * cette ligne n existe qu aux statuts `running` et `finished` : la partie
   * etait donc restee `open`, donc le clic n avait rien tire.
   *
   * Le clic part avant que le client soit en mesure de le traiter — le tirage
   * voyage par la socket, et `click()` ne garantit ni que le gestionnaire soit
   * accroche ni que la socket soit ouverte. Rien ne le signale : un clic dans
   * le vide reussit.
   *
   * Le test avait deja tranche ce debat pour les tirages suivants, et sa
   * raison s applique mot pour mot ici : « on rend deterministe ce qui n est
   * que decor, et on garde l interface la ou elle prouve quelque chose ». Le
   * bouton de tirage est prouve par `loto-teacher` et `loto-guest`. Ce qui se
   * joue ici est l enchainement des figures, pas le tirage.
   *
   * Ce qui reste prouve par l ecran, et c est l essentiel : la progression
   * s affiche chez l animatrice en DIRECT, par la socket, sans rechargement —
   * l assertion ci-dessous l attend sur un tirage qu elle n a pas declenche.
   */
  const premierTirage = await page.request.post(
    `/api/modules/loto/games/${game.id}/draw`,
    { headers: auth },
  );
  // Le corps dans le message, pas seulement `ok()` : un `toBeTruthy` nu dit
  // « Received: false » et laisse chercher. Mesure du 07/11 : c est exactement
  // ce qui est arrive, et il a fallu une execution de plus pour savoir quoi.
  expect(
    premierTirage.ok(),
    `le premier tirage doit passer — HTTP ${premierTirage.status()} ${await premierTirage.text()}`,
  ).toBeTruthy();
  const progression = page.getByTestId('pattern-progress');
  await expect(progression).toHaveText(PROGRESS_1);

  // Tirer par l API, reclamer par l ecran de l eleve, et demander au serveur
  // ou il en est. Deux choix a expliquer.
  //
  // **Pourquoi l API pour tirer**, alors qu un E2E devrait passer par l ecran.
  // Mesure du 05/11 : une boucle qui cliquait le bouton de tirage avec un
  // delai de quatre secondes sortait parfois tot, et le test passait une fois
  // sur deux sans que rien ne soit casse. Le tirage n est pas le sujet de ce
  // test, et il est deja couvert par `loto-teacher` et `loto-guest` ; ce qui se
  // joue ici, c est l enchainement des figures et son arrivee a l ecran. On
  // rend donc deterministe ce qui n est que decor, et on garde l interface la
  // ou elle prouve quelque chose : la reclamation de l eleve, et la lecture de
  // la progression.
  //
  // **Pourquoi une reclamation pour quatre tirages**, et non une par tirage.
  // Ce test etait de loin le plus lourd de la suite, avec une cinquantaine
  // d interactions d interface, et `loto-teacher` — qui passe juste apres lui —
  // a expire a la connexion en CI le 05/11, apres onze executions vertes
  // d affilee sans cette branche. La charge de ce test est le suspect le plus
  // probable, sans que ce soit demontre. Alleger ne coute rien de toute facon :
  // les tirages passent par l API, bon marche, et c est le clic de reclamation
  // qui pese. `esquinas` reste gagnee des que ses quatre coins sont sortis, au
  // pire trois tirages plus tard.
  //
  // Le serveur ignore tout marquage client (decision D1 du domaine, cf.
  // claim.ts) : seules les cartes reellement tirees comptent, donc reclamer
  // sans rien marquer sur la tabla est fidele a ce que le serveur verifie.
  // La boucle ne calcule jamais quand `esquinas` est complete.
  const PAS = 4;
  let avance = false;
  // Le plafond vient du paquet, pas d un nombre en dur. Mesure du 05/11 : il
  // valait 54, la taille du paquet seme, et ma base locale avait derive a 58
  // parce que `loto-teacher` ajoute une carte a chaque execution. La boucle
  // s arretait donc avant d avoir tire les quatre coins de la tabla, et le test
  // echouait sans que rien ne soit casse. Un nombre en dur sur une donnee qui
  // bouge est un test qui mentira un jour.
  const plafond = nbCartes + 1;

  /**
   * ⛔ LA CADENCE SEULE NE SUFFIT PAS, ET C EST CE QUI RENDAIT CE TEST
   * INSTABLE. Mesure du 07/11/2026.
   *
   * Reclamer un tour sur quatre laisse les DERNIERS tirages sans reclamation :
   * sur un paquet de 54, la derniere tentative tombait apres le 52e tirage.
   * Si le quatrieme coin de la tabla sortait au 53e ou au 54e, personne ne
   * reclamait plus jamais, `esquinas` restait a gagner et l index ne bougeait
   * pas — alors que rien n etait casse.
   *
   * Ce n est pas une question de charge ni de delai : les quatre coins
   * occupent quatre positions au hasard parmi 54, et
   *   P(la plus haute depasse 52) = 1 - C(52,4)/C(54,4) = 1 - (50*49)/(54*53)
   * soit **14,4 %** des executions. Monte-Carlo sur 200 000 tirages : 14,38 %.
   * C est l ordre de grandeur exact de ce qu on observait sur `main`, qui
   * alternait vert et rouge sans raison apparente.
   *
   * ⛔ Ne jamais « reparer » ca en rallongeant un delai : le defaut n a aucune
   * composante temporelle. Reclamer aussi sur chacun des `PAS` derniers
   * tirages suffit, et rend l echec impossible : le quatrieme coin est sorti
   * au plus tard au dernier tirage, et ce tirage-la porte desormais sa
   * reclamation. Le meme Monte-Carlo donne 0,00 %.
   */
  const premierDesDerniers = nbCartes - PAS;
  for (let i = 0; i < plafond && !avance; i++) {
    const tirage = await page.request.post(`/api/modules/loto/games/${game.id}/draw`, { headers: auth });
    if (!tirage.ok()) break; // paquet epuise
    if (i % PAS !== PAS - 1 && i < premierDesDerniers) continue;

    try {
      await guest.getByTestId('claim').click({ timeout: 3000 });
    } catch {
      // Bloque par une penalite, ou partie finie : rien a faire ce tour.
    }

    /**
     * ⛔ LA SECONDE CAUSE D INSTABILITE, ET LA DOMINANTE. Mesure du 07/11/2026.
     *
     * `click()` rend la main des que le clic est emis, PAS quand le serveur a
     * statue — et la reclamation ne voyage meme pas en HTTP : `guest-join.tsx`
     * fait `socket.emit('claim')` et la reponse revient plus tard en
     * `claim-result`. Lire l etat une seule fois juste apres le clic, c est
     * donc courir contre un aller-retour de socket.
     *
     * Ce que ca donnait : l instantane d echec du 07/11 montrait
     * « Pattern 2 of 2: Línea » a l ecran de l animatrice, donc une figure
     * bel et bien gagnee, pendant que le test avait lu 1 et concluait
     * l inverse. Il echouait sur une partie qu il venait de faire gagner.
     *
     * On attend donc la CONSEQUENCE au lieu de la lire au vol. La boucle sort
     * des que la position a bouge ; le plafond n est pas une estimation du
     * temps que ca prend, c est seulement ce qui garantit qu un vrai echec
     * finisse par rendre la main.
     *
     * La boucle ne fait donc plus office d oracle : elle tire et reclame, et
     * c est l assertion APRES la boucle qui juge, parce que `toHaveText`
     * reessaie tout seul et absorbe l aller-retour de socket. La lecture ici
     * n a plus qu un seul role, et il n est pas de prouver quoi que ce soit :
     * sortir avant que l eleve gagne `linea` aussi, car « figure 2 sur 2 » ne
     * serait alors plus a l ecran.
     *
     * Une lecture nue, sans attente : deux tentatives intermediaires qui
     * attendaient chacune leur tour ajoutaient une vingtaine de secondes a un
     * test deja le plus lourd de la suite, et la lenteur est precisement ce
     * qui avait fait tomber `loto-teacher` le 05/11. Manquer la bonne lecture
     * ne coute qu un tour de boucle de plus.
     */
    avance = PROGRESS_2.test((await progression.textContent()) ?? '');
  }

  // L ORACLE, et il attend. C est ici, et non dans la boucle, que se decide si
  // la figure a avance : `toHaveText` reessaie, la ou la lecture nue de la
  // boucle ne reessayait pas. C est aussi la preuve qui compte vraiment —
  // l ecran de l animatrice l a appris en direct, par la socket, sans
  // rechargement — et c est elle qui a trouve le 05/11 que `pattern-changed`
  // etait emis et ecoute par personne.
  await expect(progression).toHaveText(PROGRESS_2);

  // Tout l objet de l issue : la partie n a pas été recréée, donc les
  // téléphones n ont rien à rescanner.
  const relu = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  expect(relu.ok()).toBeTruthy();
  const apres = (await relu.json()) as {
    game: { joinCode: string; status: string; patternPosition: number };
  };
  expect(apres.game.joinCode).toBe(codeInitial);

  // Le serveur, et pas seulement l ecran. Lu ICI et non dans la boucle : a ce
  // point l assertion ci-dessus a deja attendu que l evenement arrive, donc
  // plus rien ne court contre la socket. `>=` et non `===` : rien n interdit a
  // l eleve d avoir gagne `linea` aussi.
  expect(apres.game.patternPosition).toBeGreaterThanOrEqual(2);

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
  // ⛔ RELIRE JUSTE AVANT D AGIR. Issue #93 : `apres` a ete lu plus haut, et il
  // y a des `await` entre les deux. Le contexte de l invite est encore ouvert,
  // donc il gagne la seconde figure dans cet intervalle : la partie passe a
  // `finished` toute seule, et `assertTransition` refuse `finished -> finished`.
  // Le nettoyage echouait alors sur un SUCCES metier.
  const avantFin = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  const etatCourant = (await avantFin.json()) as { game: { status: string } };

  if (etatCourant.game.status !== 'finished') {
    const fin = await page.request.post(`/api/modules/loto/games/${game.id}/finish`, { headers: auth });

    if (!fin.ok()) {
      // ⚠️ La relecture reduit la fenetre, elle ne la ferme pas : l invite joue
      // encore pendant ces deux lignes. On tolere donc UN seul refus, celui qui
      // dit que la partie s est terminee d elle-meme, et on nomme sa forme.
      // Tout autre refus fait toujours echouer le test.
      const corps = await fin.text();
      expect(
        corps.includes('finished vers finished'),
        `la partie doit se terminer pour ne pas verrouiller le jeu — HTTP ${fin.status()} ${corps}`,
      ).toBeTruthy();
    }
  }

  // Le jeu doit etre libre en sortant, sinon le voisin casse. On le verifie
  // plutot que de l esperer : relire la partie et exiger `finished`.
  const verif = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  const final = (await verif.json()) as { game: { status: string } };
  expect(final.game.status, 'le jeu reste verrouille si la partie court encore').toBe('finished');

  await guestContext.close();
});
