#!/usr/bin/env node
/**
 * LA PROD SERT-ELLE CE QUE DIT `main` ?
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
 *   pnpm run verifier:prod                 # compare l'API a origin/main
 *   pnpm run verifier:prod -- <url>        # contre une autre instance
 *
 * Sort 0 si la prod est a jour, 1 sinon : utilisable tel quel dans un cron.
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
const LONGUEUR_EMPREINTE = 12;
/** Render free eteint l'instance au repos : le premier appel peut mettre 60 s. */
const DELAI_MS = 120_000;

const empreinte = (valeur) =>
  createHash('sha256').update(valeur).digest('hex').slice(0, LONGUEUR_EMPREINTE);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

async function main() {
  const base = (process.argv[2] ?? API_PAR_DEFAUT).replace(/\/$/, '');

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
    process.exit(1);
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
    return;
  }

  if (sante.build === 'unknown') {
    console.error('\nROUGE  l instance n expose aucun commit : la variable RENDER_GIT_COMMIT');
    console.error('       n est pas injectee. C est la variable qu il faut declarer.');
    process.exit(1);
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
  process.exit(1);
}

await main();
