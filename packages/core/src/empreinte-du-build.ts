import { createHash } from 'node:crypto';

/**
 * QUEL COMMIT CETTE INSTANCE SERT-ELLE ?
 *
 * Issue #69. Ce calcul vivait dans le controleur Nest de l API, et le host n en
 * avait aucun equivalent : `verifier-la-prod.mjs` savait donc interroger Render
 * et rien d autre. Or #64 — la connexion cassee en production — vivait dans le
 * host, et le script repondait « la prod sert bien origin/main » pendant que
 * personne ne pouvait se connecter.
 *
 * Il vit ici pour que les DEUX applications l appellent, et pas pour faire
 * joli : le format est compare par le script, il est epingle par
 * `apps/api/src/health.controller.spec.ts`, et une seconde copie dans le host
 * aurait derive sans qu aucun test ne s en apercoive. C est le script qui
 * aurait menti, et on ne l aurait su qu au prochain incident.
 */

/** Variables injectees par les hebergeurs, par ordre de preference : Render
 *  pour l API, Vercel pour le host, `GIT_COMMIT` comme porte de sortie
 *  generique si l un des deux demenage un jour. */
export const VARIABLES_DE_COMMIT = [
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_COMMIT',
] as const;

const LONGUEUR_EMPREINTE = 12;

/**
 * Un sac de variables, et non une interface nommant les trois clefs.
 *
 * Nommer les clefs serait plus bavard mais ne compile pas : le `ProcessEnv` du
 * host Next et celui de Node ne sont pas le meme type, et passer le second a
 * une interface n ayant que des proprietes optionnelles rend TS2559, « aucune
 * propriete en commun ». Les deux applications doivent pouvoir passer leur
 * `process.env` tel quel, sinon chacune recopierait la liste — ce que cette
 * extraction existe precisement pour eviter.
 *
 * Ce qu on perd : une faute de frappe dans une clef passerait le compilateur.
 * Ce qui la rattrape : `VARIABLES_DE_COMMIT` est la seule source de ces noms,
 * elle est exportee, et un test fige son contenu ET son ordre.
 */
export type EnvironnementDeCommit = Readonly<Record<string, string | undefined>>;

/**
 * L empreinte du commit deploye, et NON le commit.
 *
 * ⛔ Ne jamais rendre le SHA en clair, et ne jamais rallonger l empreinte en
 * croyant bien faire : ce depot est **public**. Publier le commit exact qui
 * tourne reviendrait a publier la liste des versions de dependances en
 * production, donc la liste des CVE connues qui s appliquent a cette instance.
 * Un SHA-256 tronque renverse la charge — qui connait le commit attendu peut le
 * recalculer et comparer, qui ne le connait pas n apprend rien.
 *
 * Verification, depuis un clone a jour :
 *   node -e "console.log(require('crypto').createHash('sha256')
 *     .update('<sha>').digest('hex').slice(0,12))"
 *
 * `unknown` n est pas une erreur : c est le cas d un lancement local, ou d un
 * hebergeur qui n injecte aucune des variables ci-dessus. Si la production
 * repond `unknown`, c est la variable qu il faut declarer, pas ce code.
 */
export function empreinteDuBuild(env: EnvironnementDeCommit): string {
  // `find((valeur) => valeur)` et non `!== undefined` : une variable declaree
  // mais VIDE ne designe aucun commit, et c est le cas d un hebergeur qui
  // expose la variable sans la remplir. La truthiness porte donc une regle, pas
  // un raccourci — un test l epingle, et le durcir en `!== undefined` le fait
  // rougir.
  const commit = VARIABLES_DE_COMMIT.map((nom) => env[nom]).find((valeur) => valeur);
  if (commit === undefined) return 'unknown';
  return createHash('sha256').update(commit).digest('hex').slice(0, LONGUEUR_EMPREINTE);
}
