import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * L INVENTAIRE DES ÉVÉNEMENTS ÉCOUTÉS PAR L AUDIT (issue #60).
 *
 * `AuditSubscriber` écoute onze noms. Mesuré le 05/11 : **un seul est émis**
 * dans le code applicatif. Les dix autres n ont aucun émetteur, et ce n est pas
 * une implémentation en retard — c est un chemin qui n existe pas :
 *
 * - le bus est in-process (`CLAUDE.md` §6, EventEmitter2, dette Redis en v2) ;
 * - `betterAuth()` vit dans `packages/auth/src/config.ts`, servi par des Route
 *   Handlers Next (§7 : `/api/auth/*` n est pas réécrit vers Nest) ;
 * - host et API sont deux processus (`next start` et `node dist/main.js`).
 *
 * Donc un `emit('user.login', …)` placé dans les hooks de session n atteindrait
 * jamais cet abonné, qui vit de l autre côté de la frontière.
 *
 * ⚠️ CE TEST NE CORRIGE RIEN, et c est voulu. La décision — émettre depuis le
 * host en écrivant directement, ou retirer les noms morts — appartient à
 * Sylvain et attend dans l issue #60. Ce que ce test empêche, c est que le
 * contrat reste faux **en silence** : il fige l inventaire d aujourd hui et
 * échoue si quelqu un ajoute un nom sans émetteur, ou en émet un sans le dire.
 *
 * Il lit les SOURCES, parce qu un nom écouté sans émetteur compile très bien.
 */

const racineDepot = fileURLToPath(new URL('../../../..', import.meta.url));
const ABONNE = 'apps/api/src/observability/audit.subscriber.ts';

/** Les noms dont on SAIT qu ils n ont pas d emetteur, et c est le sujet de #60. */
const SANS_EMETTEUR = [
  'user.login',
  'user.logout',
  'user.signup',
  'guest.left',
  'guest.kicked',
  'session.created',
  'session.ended',
  'module.installed',
  'module.enabled',
  'module.disabled',
] as const;

/** Les noms reellement emis quelque part dans le code applicatif. */
const AVEC_EMETTEUR = ['guest.joined'] as const;

function sourcesApplicatives(): string[] {
  const trouves: string[] = [];
  const explorer = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      if (entree === 'node_modules' || entree === 'dist' || entree === '.next') continue;
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        explorer(chemin);
        continue;
      }
      if (!/\.tsx?$/.test(entree)) continue;
      if (/\.spec\.tsx?$/.test(entree)) continue;
      const relatif = relative(racineDepot, chemin).split('\\').join('/');
      if (relatif === ABONNE) continue; // il porte la LISTE, pas une emission
      trouves.push(chemin);
    }
  };
  for (const racine of ['apps/api/src', 'apps/host/src', 'packages']) {
    explorer(join(racineDepot, racine));
  }
  return trouves;
}

function emetteursDe(nom: string, sources: string[]): string[] {
  return sources
    .filter((chemin) => readFileSync(chemin, 'utf8').includes(`emit('${nom}'`))
    .map((chemin) => relative(racineDepot, chemin).split('\\').join('/'));
}

describe('inventaire des evenements ecoutes par l audit', () => {
  const sources = sourcesApplicatives();

  it('explore bien quelque chose, sinon il ne garde rien', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it.each(AVEC_EMETTEUR)('%s est emis par le code applicatif', (nom) => {
    expect(emetteursDe(nom, sources), `${nom} n est plus emis : l audit ne le verra plus`).not.toEqual([]);
  });

  it.each(SANS_EMETTEUR)('%s n a toujours aucun emetteur (issue #60)', (nom) => {
    expect(
      emetteursDe(nom, sources),
      `${nom} a maintenant un emetteur. Si c est voulu, retire-le de SANS_EMETTEUR et ` +
        `verifie qu il est emis du BON cote de la frontiere : un emit depuis le host ` +
        `n atteindra jamais AuditSubscriber, qui vit dans l autre processus (issue #60).`,
    ).toEqual([]);
  });

  it('la liste du test couvre exactement celle de l abonne', () => {
    const source = readFileSync(join(racineDepot, ABONNE), 'utf8');
    const bloc = source.slice(source.indexOf('AUDIT_EVENTS'), source.indexOf('] as const'));
    const ecoutes = [...bloc.matchAll(/'([a-z]+\.[a-z.]+)'/g)].map((m) => m[1]).sort();
    const connus = [...SANS_EMETTEUR, ...AVEC_EMETTEUR].sort();

    expect(
      ecoutes,
      'un nom a ete ajoute ou retire de AUDIT_EVENTS sans que cet inventaire suive',
    ).toEqual(connus);
  });
});
