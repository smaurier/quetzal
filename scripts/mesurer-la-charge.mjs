#!/usr/bin/env node
/**
 * COMBIEN DE TÉLÉPHONES CETTE PARTIE TIENT-ELLE ?
 *
 * Issue #32. Le module est dessiné pour une classe — `maxConcurrentPerSession: 40`
 * dans le manifeste, six équipes par défaut — et rien n'avait été mesuré
 * au-delà. L'issue nomme trois inconnues : la latence de diffusion, la tenue du
 * wifi d'établissement, et le temps d'entrée quand beaucoup de téléphones
 * scannent dans la même minute.
 *
 * ⛔ CE SCRIPT N'EN MESURE QUE DEUX, et il faut le dire avant de lire ses
 * chiffres. La tenue du wifi d'un établissement ne se simule pas : elle dépend
 * de bornes, de murs et d'un nombre d'élèves réels. Ce qui est mesurable ici
 * est ce que le SERVEUR fait — le temps d'entrée et la latence de diffusion —
 * et c'est déjà ce qui dirait si le défaut est dans le produit ou dans la
 * salle.
 *
 *   node scripts/mesurer-la-charge.mjs                 # 40 invités, pile locale
 *   node scripts/mesurer-la-charge.mjs 60              # au-delà du manifeste
 *   node scripts/mesurer-la-charge.mjs 40 <host> <api>
 *
 * ⚠️ Deux limites du produit à garder en tête en interprétant un échec :
 *
 * 1. `maxConcurrentPerSession: 40` dans le manifeste. Demander 60 invités doit
 *    donc faire refuser les surnuméraires — c'est un succès du produit, pas un
 *    échec de la mesure.
 * 2. `@Throttle({ limit: 100, ttl: 3600_000 })` sur `/api/guest-token` : cent
 *    jetons par heure, soit deux classes et demie. Enchaîner les exécutions
 *    finira par rendre 429, et un 429 n'est pas une latence.
 *
 * Le script travaille sur une COPIE du jeu semé, et la supprime en partant :
 * un outil de mesure qui laisse de l'état derrière lui fait mentir la mesure
 * suivante, et c'est exactement ce qui avait rendu la suite e2e instable.
 */

import { io } from 'socket.io-client';

const NB_INVITES = Number(process.argv[2] ?? 40);
const HOST = (process.argv[3] ?? 'http://localhost:3010').replace(/\/$/, '');
const API = (process.argv[4] ?? 'http://localhost:3011').replace(/\/$/, '');

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const MOT_DE_PASSE = process.env['SEED_OWNER_PASSWORD'] ?? '';

/** Médiane, 95e centile et maximum : une moyenne cache le téléphone qui rame. */
function centiles(valeurs) {
  const triees = [...valeurs].sort((a, b) => a - b);
  const au = (p) => triees[Math.min(triees.length - 1, Math.floor((p / 100) * triees.length))];
  return { p50: au(50), p95: au(95), max: triees[triees.length - 1] };
}

const ms = (n) => `${Math.round(n)} ms`;

async function jsonOuMeurs(reponse, quoi) {
  if (!reponse.ok) {
    throw new Error(`${quoi} : HTTP ${reponse.status} ${(await reponse.text()).slice(0, 200)}`);
  }
  return reponse.json();
}

async function main() {
  if (MOT_DE_PASSE === '') {
    console.error('SEED_OWNER_PASSWORD est vide : exporter les variables de la pile e2e.');
    process.exitCode = 1;
    return;
  }

  // --- L'animatrice, une seule connexion : Better-Auth plafonne à trois par
  // --- fenêtre glissante, et ce script n'a pas à manger ce budget.
  const connexion = await fetch(`${HOST}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: HOST },
    body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }),
  });
  const cookies = connexion.headers.getSetCookie?.() ?? [];
  await jsonOuMeurs(connexion, 'connexion animatrice');
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');

  const { token } = await jsonOuMeurs(
    await fetch(`${HOST}/api/auth/token`, { headers: { cookie } }),
    'jeton JWT',
  );
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  /**
   * Le locataire vient de la charge du JWT, pas de la partie : `GameState` ne
   * porte pas `tenantId`, et c'est voulu — le cloisonnement vit dans le
   * contexte d'exécution, pas dans les réponses. `definePayload` y met
   * `tenantId` (cf. `packages/auth/src/config.ts`).
   *
   * ⛔ On ne lit que cette revendication, et on n'affiche JAMAIS le jeton :
   * cette sortie finit dans un terminal, souvent recopiée ailleurs.
   */
  const charge = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const tenantId = charge.tenantId;
  if (typeof tenantId !== 'string' || tenantId === '') {
    throw new Error("le JWT ne porte pas de tenantId : l'animatrice a-t-elle une organisation ?");
  }

  // --- Une COPIE du jeu semé. Jamais le gabarit : la partie le verrouillerait.
  const { decks } = await jsonOuMeurs(
    await fetch(`${HOST}/api/modules/loto/decks`, { headers: auth }),
    'liste des jeux',
  );
  const gabarit = decks.find((d) => d.isTemplate);
  if (gabarit === undefined) throw new Error('aucun gabarit : le seed du module a-t-il tourné ?');

  const copie = await jsonOuMeurs(
    await fetch(`${HOST}/api/modules/loto/decks`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: `mesure de charge ${Date.now()}`, duplicateOf: gabarit.id }),
    }),
    'copie du jeu',
  );

  const partie = await jsonOuMeurs(
    await fetch(`${HOST}/api/modules/loto/games`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        deckId: copie.id,
        patterns: ['llena'],
        // ⚠️ Plafonné à 20, et ce n'est pas arbitraire : `createGameSchema`
        // borne `maxTeams` à 20 alors que le manifeste annonce
        // `maxConcurrentPerSession: 40`. Les deux ne se contredisent pas — les
        // élèves partagent des équipes, et c'est le cas réel d'une classe — mais
        // demander 40 équipes fait rendre un 400, pas une latence.
        maxTeams: Math.min(NB_INVITES, 20),
        falseClaimPenaltyDraws: 0,
      }),
    }),
    'création de la partie',
  );
  await jsonOuMeurs(
    await fetch(`${HOST}/api/modules/loto/games/${partie.id}/open`, { method: 'POST', headers: auth }),
    'ouverture de la partie',
  );

  console.log(`invités demandés  : ${NB_INVITES}`);
  console.log(`partie            : ${partie.id}  (code ${partie.joinCode})`);
  console.log(`jeu               : copie de « ${gabarit.name} »`);
  console.log('');

  // --- L'entrée. Tous lancés d'un coup, parce que c'est le cas qui inquiète :
  // --- une classe qui scanne le QR code dans la même minute.
  const sockets = [];
  const entrees = [];
  const refus = [];

  const debutVague = Date.now();
  await Promise.all(
    Array.from({ length: NB_INVITES }, async (_, i) => {
      const t0 = Date.now();
      try {
        const jeton = await fetch(`${API}/api/guest-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            sessionId: partie.id,
            moduleSlug: 'loto',
            displayName: `Eleve ${i + 1}`,
          }),
        });
        if (!jeton.ok) {
          refus.push(`jeton: HTTP ${jeton.status}`);
          return;
        }
        const { token: guestToken } = await jeton.json();

        const socket = io(`${API}/ws/loto`, {
          transports: ['websocket'],
          auth: { guestToken },
          reconnection: false,
        });
        sockets.push(socket);

        await new Promise((resolve, reject) => {
          const minuteur = setTimeout(() => reject(new Error('aucun état en 30 s')), 30_000);
          // `state`, et non `snapshot` : c'est le nom que la passerelle émet à
          // la connexion (`client.emit('state', snapshot)`). Première version
          // écrite au hasard, 40 invités « refusés » sans qu'aucun ne le soit.
          socket.on('state', () => {
            clearTimeout(minuteur);
            resolve();
          });
          socket.on('join-failed', (payload) => {
            clearTimeout(minuteur);
            reject(new Error(`refus du serveur : ${payload?.reason ?? 'inconnu'}`));
          });
          socket.on('connect_error', (err) => {
            clearTimeout(minuteur);
            reject(err);
          });
        });
        entrees.push(Date.now() - t0);
      } catch (err) {
        refus.push(String(err?.message ?? err).slice(0, 80));
      }
    }),
  );
  const vague = Date.now() - debutVague;

  console.log(`ENTRÉE — ${entrees.length} invités entrés, ${refus.length} refusés`);
  if (entrees.length > 0) {
    const c = centiles(entrees);
    console.log(`  par invité        : médiane ${ms(c.p50)} · p95 ${ms(c.p95)} · max ${ms(c.max)}`);
  }
  console.log(`  vague entière     : ${ms(vague)}`);
  if (refus.length > 0) {
    const motifs = [...new Set(refus)].slice(0, 3);
    console.log(`  motifs de refus   : ${motifs.join(' | ')}`);
    console.log('  ⚠️ `maxConcurrentPerSession: 40` au manifeste : au-delà, un refus');
    console.log('     est le produit qui tient sa limite, pas une panne.');
  }
  console.log('');

  // --- La diffusion. Un tirage, et on chronomètre l'arrivée chez chacun.
  if (entrees.length > 0) {
    const arrivees = [];
    const attendus = sockets.length;
    const recu = new Promise((resolve) => {
      let restants = attendus;
      const t0 = Date.now();
      for (const socket of sockets) {
        socket.once('card-drawn', () => {
          arrivees.push(Date.now() - t0);
          restants -= 1;
          if (restants === 0) resolve();
        });
      }
      setTimeout(resolve, 15_000);
    });
    await fetch(`${HOST}/api/modules/loto/games/${partie.id}/draw`, { method: 'POST', headers: auth });
    await recu;

    console.log(`DIFFUSION — ${arrivees.length} / ${attendus} téléphones ont reçu le tirage`);
    if (arrivees.length > 0) {
      const c = centiles(arrivees);
      console.log(`  latence           : médiane ${ms(c.p50)} · p95 ${ms(c.p95)} · max ${ms(c.max)}`);
    }
    if (arrivees.length < attendus) {
      console.log(`  ⚠️ ${attendus - arrivees.length} n'ont RIEN reçu en 15 s : c'est le résultat`);
      console.log("     qui compte, pas la latence des autres.");
    }
  }

  // --- Ménage. Un outil de mesure qui laisse de l'état fait mentir la mesure
  // --- suivante : terminer la partie libère le jeu, et la copie s'en va.
  for (const socket of sockets) socket.close();
  await fetch(`${HOST}/api/modules/loto/games/${partie.id}/finish`, { method: 'POST', headers: auth });
  const menage = await fetch(`${HOST}/api/modules/loto/decks/${copie.id}`, {
    method: 'DELETE',
    headers: auth,
  });
  console.log('');
  console.log(menage.ok ? 'ménage : copie du jeu supprimée.' : `⚠️ ménage : la copie ${copie.id} reste.`);
}

await main();
