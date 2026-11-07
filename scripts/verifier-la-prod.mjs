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
async function verifierLeCommit(base) {

  // `origin/main` et non `HEAD` : ce qui est fusionne est ce qui doit tourner,
  // pas ce que cette machine a sous la main. Un local en retard donnerait un
  // vert faux. Cf la lecon « git fetch avant d'affirmer ».
  git('fetch', '--quiet', 'origin', 'main');
  const attendu = git('rev-parse', 'origin/main');
  const sujet = git('log', '-1', '--format=%s', 'origin/main');

  const reponse = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!reponse.ok) {
    console.error(`ROUGE  ${base}/api/health rend HTTP ${reponse.status}`);
    console.error('       Si c est 404, l instance ne porte pas la PR 43, donc elle est');
    console.error('       anterieure au 29/10. Si c est 502, le build a echoue.');
    return false;
  }
  const sante = await reponse.json();

  const attenduCourt = empreinte(attendu);
  const aJour = sante.build === attenduCourt;

  console.log(`instance          : ${base}`);
  console.log(`origin/main       : ${attendu.slice(0, 7)}  ${sujet}`);
  console.log(`empreinte attendue: ${attenduCourt}`);
  console.log(`empreinte servie  : ${sante.build}`);

  if (aJour) {
    console.log('\nVERT   la prod sert bien origin/main.');
    return true;
  }

  if (sante.build === 'unknown') {
    console.error('\nROUGE  l instance n expose aucun commit : la variable RENDER_GIT_COMMIT');
    console.error('       n est pas injectee. C est la variable qu il faut declarer.');
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

  console.error('\nROUGE  la prod est en retard sur origin/main.');
  if (identifie) {
    const quoi = git('log', '-1', '--format=%h %ci %s', identifie);
    const retard = git('rev-list', '--count', `${identifie}..origin/main`);
    console.error(`       elle sert ${quoi}`);
    console.error(`       soit ${retard} commit(s) de retard.`);
  } else {
    console.error("       aucun commit connu ne donne cette empreinte : clone incomplet,");
    console.error('       ou instance construite depuis un autre depot.');
  }
  console.error('\n       ⚠️ Le schema n est migre QUE par le build Render. Une API en');
  console.error('       retard veut donc dire un schema en retard, pendant que le host');
  console.error('       Vercel, lui, est deja a jour. Verifier le log du dernier');
  console.error('       deploiement de `quetzal-api` avant toute autre hypothese.');
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

  const commitAJour = await verifierLeCommit(api);
  console.log(`\n${'-'.repeat(68)}\n`);
  const origineAcceptee = await verifierLOrigine(host);

  if (!commitAJour || !origineAcceptee) process.exit(1);
}

await main();
