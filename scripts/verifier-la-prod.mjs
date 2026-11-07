#!/usr/bin/env node
/**
 * LA PROD SERT-ELLE CE QUE DIT `main`, ET LAISSE-T-ELLE ENTRER ?
 *
 * Pourquoi ce script existe (incident du 04/11/2026). La PR 45 a ete fusionnee
 * le 03/11 a 07h00. Vercel a deploye le host. Render, lui, est reste sur le
 * commit du 29/10 pendant 25 heures, et PERSONNE ne l'a su : le host servait
 * du code neuf sur un schema vieux, et comme le schema n'est migre QUE par le
 * build Render, `account.issuer` est reste NOT NULL alors que la better-auth
 * du host ne l'ecrit plus. Resultat : toute inscription echouait, en silence,
 * pendant que `/api/auth/ok` repondait `{"ok":true}`.
 *
 * La PR 43 avait rendu la question MESURABLE en exposant une empreinte du
 * commit dans `/api/health`. Elle n'avait pas rendu la reponse AUTOMATIQUE :
 * il fallait encore que quelqu'un pense a poser la question. C'est ce trou-la
 * que ce script ferme.
 *
 * Issue #64 (06/11/2026) a montre le pendant du meme trou. Le host servait
 * bien `main`, et pourtant plus personne ne pouvait se connecter : Better-Auth
 * refusait l'origine de production elle-meme. Une prod a jour peut donc etre
 * une prod inutilisable, et ce script ne posait qu'une des deux questions.
 * D'ou la seconde sonde, qui aurait attrape #64 le jour meme.
 *
 *   pnpm run verifier:prod                      # API contre origin/main, puis origine du host
 *   pnpm run verifier:prod -- <api> <host>      # contre d'autres instances
 *
 * Sort 0 si les deux questions repondent vert, 1 sinon : utilisable tel quel
 * dans un cron.
 *
 * L'empreinte est un sha256 tronque a 12, PAS le commit : le depot est public,
 * et publier le SHA exact publierait la liste des CVE qui s'appliquent. Le
 * format est epingle par `apps/api/src/health.controller.spec.ts` ; si
 * quelqu'un le change la, ce script le verra en rouge.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** L'instance servie par Render. ⚠️ Le suffixe `-dsx1` fait partie du nom :
 *  `quetzal-api.onrender.com` SANS suffixe appartient a quelqu'un d'autre et
 *  repond « Hello World! », ce qui envoie droit dans le mur. */
const API_PAR_DEFAUT = 'https://quetzal-api-dsx1.onrender.com';

/** Le host servi par Vercel. ⚠️ C'est l'ALIAS de production qu'il faut sonder,
 *  pas l'URL d'un deploiement : la protection de deploiement du projet couvre
 *  `prod_deployment_urls_and_all_previews`, donc toute autre URL repondrait la
 *  page d'authentification Vercel et la sonde lirait un faux rouge. */
const HOST_PAR_DEFAUT = 'https://quetzal-theta.vercel.app';

/** Les deux instances posent la MEME question, et leurs messages diffèrent sur
 *  un seul point : ce qu'il faut aller regarder quand l'une est en retard. */
const INSTANCE_API = "l'API Render";
const INSTANCE_HOST = 'le host Vercel';

const SANTE_API = '/api/health';

/**
 * ⛔ `/api/host/health`, et SURTOUT PAS `/api/health` sur le host.
 *
 * `apps/host/next.config.ts` REECRIT `/api/health` vers l'API Render. Interroger
 * ce chemin sur le host interroge donc Render une seconde fois, en croyant
 * mesurer Vercel. Mesure du 07/11 : les deux URL rendaient la meme empreinte,
 * `a772cc6451f0` — un temoin pose la aurait repondu vert quoi qu il arrive au
 * host, et c'est aussi pourquoi personne n'avait vu que le host n'en avait pas :
 * il avait l'air d'en avoir un.
 */
const SANTE_HOST = '/api/host/health';

const LONGUEUR_EMPREINTE = 12;
/** Render free eteint l'instance au repos : le premier appel peut mettre 60 s. */
const DELAI_MS = 120_000;

const empreinte = (valeur) =>
  createHash('sha256').update(valeur).digest('hex').slice(0, LONGUEUR_EMPREINTE);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * LE HOST ACCEPTE-T-IL SA PROPRE ORIGINE ?
 *
 * On envoie une vraie tentative de connexion depuis l'origine de production, et
 * on ne juge QUE le controle d'origine : un refus d'identifiants est un vert,
 * puisqu'il prouve que la requete est allee jusqu'a la verification du mot de
 * passe. Seul `INVALID_ORIGIN` est le defaut #64.
 *
 * L'adresse est en `.invalid`, un TLD que la RFC 2606 reserve et qui ne peut
 * donc designer aucun compte reel. Un echec d'identifiants ne cree pas de
 * session, donc cette sonde n'ecrit aucune ligne d'audit : `auditConnexion` est
 * accroche a `session.create.after`.
 *
 * ⚠️ Better-Auth limite les connexions a trois par fenetre glissante. Une sonde
 * par execution tient dans ce budget ; enchainer les executions fera repondre
 * 429, et un 429 n'est pas un vert : c'est une question restee sans reponse.
 */
async function verifierLOrigine(host) {
  const reponse = await fetch(`${host}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: host },
    body: JSON.stringify({ email: 'sonde-origine@quetzal.invalid', password: 'sonde' }),
    signal: AbortSignal.timeout(DELAI_MS),
  });

  const corps = await reponse.text();
  console.log(`host              : ${host}`);
  console.log(`sonde d origine   : HTTP ${reponse.status}`);

  if (reponse.status === 429) {
    console.error('\nINDECIS  le host a repondu « trop de tentatives », pas le controle');
    console.error('         d origine. Better-Auth plafonne a trois connexions par');
    console.error('         fenetre glissante : attendre, puis rejouer une seule fois.');
    return false;
  }

  if (corps.includes('INVALID_ORIGIN')) {
    console.error('\nROUGE  le host refuse sa propre origine de production (issue #64).');
    console.error('       Personne ne peut se connecter. Better-Auth compare l origine');
    console.error('       de la requete a trustedOrigins, qui vaut [baseURL] par defaut.');
    console.error('       Verifier que packages/auth/src/config.ts derive ces deux');
    console.error('       valeurs du deploiement, et non d un HOST_URL tenu a la main :');
    console.error('       une valeur unique ne peut pas couvrir la prod ET les apercus.');
    return false;
  }

  console.log('\nVERT   le host accepte son origine : la requete est allee jusqu a la');
  console.log('       verification du mot de passe, qu elle a echouee comme prevu.');
  return true;
}

/** LA PROD SERT-ELLE CE QUE DIT `main` ? */
async function verifierLeCommit(base, quoi, chemin) {

  // `origin/main` et non `HEAD` : ce qui est fusionne est ce qui doit tourner,
  // pas ce que cette machine a sous la main. Un local en retard donnerait un
  // vert faux. Cf la lecon « git fetch avant d'affirmer ».
  git('fetch', '--quiet', 'origin', 'main');
  const attendu = git('rev-parse', 'origin/main');
  const sujet = git('log', '-1', '--format=%s', 'origin/main');

  const reponse = await fetch(`${base}${chemin}`, {
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!reponse.ok) {
    console.error(`ROUGE  ${base}${chemin} rend HTTP ${reponse.status}`);
    if (quoi === INSTANCE_API) {
      console.error('       Si c est 404, l instance ne porte pas la PR 43, donc elle est');
      console.error('       anterieure au 29/10. Si c est 502, le build a echoue.');
    } else {
      // Le cas qu on verra le PLUS souvent, et une seule fois : entre la fusion
      // de l issue #69 et le deploiement Vercel qui la met en ligne.
      console.error('       Si c est 404, le deploiement en cours est anterieur a');
      console.error('       l issue #69 : la route n existe pas encore cote host.');
      console.error('       Attendre que Vercel ait deploye, puis rejouer. Si c est');
      console.error('       401, l URL sondee n est pas l ALIAS de production mais');
      console.error('       une URL de deploiement, protegee par Vercel.');
    }
    return false;
  }
  const sante = await reponse.json();

  const attenduCourt = empreinte(attendu);
  const aJour = sante.build === attenduCourt;

  console.log(`instance          : ${base}  (${quoi})`);
  console.log(`origin/main       : ${attendu.slice(0, 7)}  ${sujet}`);
  console.log(`empreinte attendue: ${attenduCourt}`);
  console.log(`empreinte servie  : ${sante.build}`);

  if (aJour) {
    console.log(`\nVERT   ${quoi} sert bien origin/main.`);
    return true;
  }

  if (sante.build === 'unknown') {
    const variable = quoi === INSTANCE_API ? 'RENDER_GIT_COMMIT' : 'VERCEL_GIT_COMMIT_SHA';
    console.error(`\nROUGE  ${quoi} n expose aucun commit : la variable ${variable}`);
    console.error('       n est pas injectee. C est la variable qu il faut declarer,');
    console.error('       pas le code qu il faut changer.');
    return false;
  }

  // Retrouver CE QUI tourne reellement : l'empreinte est a sens unique, mais le
  // nombre de commits candidats est petit. On les hache et on compare.
  let identifie = null;
  try {
    for (const sha of git('rev-list', '--all', '--max-count=1000').split('\n')) {
      if (empreinte(sha) === sante.build) {
        identifie = sha;
        break;
      }
    }
  } catch {
    /* un clone peu profond n'a pas de quoi chercher : on reste sur l'empreinte */
  }

  console.error(`\nROUGE  ${quoi} est en retard sur origin/main.`);
  if (identifie) {
    const quoi = git('log', '-1', '--format=%h %ci %s', identifie);
    const retard = git('rev-list', '--count', `${identifie}..origin/main`);
    console.error(`       elle sert ${quoi}`);
    console.error(`       soit ${retard} commit(s) de retard.`);
  } else {
    console.error("       aucun commit connu ne donne cette empreinte : clone incomplet,");
    console.error('       ou instance construite depuis un autre depot.');
  }
  if (quoi === INSTANCE_API) {
    console.error('\n       ⚠️ Le schema n est migre QUE par le build Render. Une API en');
    console.error('       retard veut donc dire un schema en retard, pendant que le host');
    console.error('       Vercel, lui, est deja a jour. Verifier le log du dernier');
    console.error('       deploiement de `quetzal-api` avant toute autre hypothese.');
  } else {
    console.error('\n       ⚠️ Un host en retard sert l ANCIEN code. Verifier dans Vercel');
    console.error('       que le deploiement de production est READY et que l alias');
    console.error('       pointe dessus : un deploiement encore en BUILDING laisse le');
    console.error('       precedent en place, et une sonde lancee a cet instant juge');
    console.error('       le mauvais bundle. C est arrive le 07/11.');
  }
  return false;
}

/**
 * Les deux questions sont posees TOUTES LES DEUX, meme si la premiere repond
 * rouge : savoir que l'API est en retard n'apprend rien sur la connexion, et
 * #64 est justement arrive pendant que l'autre voyant etait vert.
 */
async function main() {
  const api = (process.argv[2] ?? API_PAR_DEFAUT).replace(/\/$/, '');
  const host = (process.argv[3] ?? HOST_PAR_DEFAUT).replace(/\/$/, '');

  const trait = () => console.log(`\n${'-'.repeat(68)}\n`);

  // L API d abord, parce qu elle seule migre le schema : si elle est en retard,
  // tout le reste se lit a la lumiere de ca.
  const apiAJour = await verifierLeCommit(api, INSTANCE_API, SANTE_API);
  trait();

  // Issue #69 : le host avait droit a la meme question, et ne l avait pas. Le
  // script n interrogeait que Render, alors que #64 vivait dans le host — et il
  // repondait « la prod sert bien origin/main » pendant que personne ne pouvait
  // se connecter. Il a fallu, le 07/11, sortir du depot et interroger l API de
  // Vercel avec un jeton pour savoir quel commit l alias servait.
  const hostAJour = await verifierLeCommit(host, INSTANCE_HOST, SANTE_HOST);
  trait();
  const origineAcceptee = await verifierLOrigine(host);

  /**
   * `process.exitCode` et NON `process.exit(1)`. Mesure du 07/11/2026 : sur
   * Node 23 / Windows, sortir en force avec des descripteurs encore ouverts
   * fait echouer une assertion de libuv
   * (`!(handle->flags & UV_HANDLE_CLOSING)`, async.c) et le processus rend
   * **127**, pas 1 — alors que l en-tete de ce fichier promet 1.
   *
   * Defaut PREEXISTANT, pas introduit ici : la version d avant rendait 127
   * aussi. Non-zero, donc un cron voyait bien l echec, mais 127 veut dire
   * « commande introuvable » et enverrait n importe qui chercher au mauvais
   * endroit. Laisser Node sortir seul rend le code annonce.
   */
  if (!apiAJour || !hostAJour || !origineAcceptee) process.exitCode = 1;
}

await main();
