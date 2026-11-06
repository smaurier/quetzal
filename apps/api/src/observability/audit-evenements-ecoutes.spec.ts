import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * CE QUI ÉCRIT DANS LE JOURNAL D AUDIT SAIT CE QU IL ÉCRIT (issue #60).
 *
 * Avant : `AuditSubscriber` portait une liste de onze noms d événements.
 * Mesuré le 05/11 — **un seul était émis**, et les dix autres ne pouvaient pas
 * l être : le bus est in-process (`CLAUDE.md` §6), Better-Auth vit dans le
 * host, et host et API sont deux processus. Un `emit('user.login')` depuis les
 * hooks de session n atteignait jamais cet abonné.
 *
 * Et le seul nom qui marchait était persisté **deux fois** : son contrôleur
 * écrivait la ligne en direct — avec l adresse IP, que `persistAudit` ne pose
 * pas — puis émettait l événement, que l abonné persistait à son tour.
 *
 * Après : chaque action est écrite par celui qui en connaît le contexte, du bon
 * côté de la frontière. Le bus ne sert plus qu aux `audit.security.*`, émis
 * depuis l API donc atteignables.
 *
 * ⚠️ Ce test lit les SOURCES. Une liste de noms morts compile parfaitement, et
 * c est précisément ce qui l a laissée mentir pendant des mois.
 */

function racineDuDepot(): string {
  let courant = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(courant, 'pnpm-workspace.yaml'))) return courant;
    courant = dirname(courant);
  }
  throw new Error('racine du depot introuvable : pnpm-workspace.yaml non trouve en remontant');
}

const racine = racineDuDepot();
const ABONNE = 'apps/api/src/observability/audit.subscriber.ts';

/** Chaque action auditée, et le SEUL fichier qui a le droit de l écrire. */
const ECRIVAINS: ReadonlyArray<readonly [action: string, fichier: string]> = [
  ['user.login', 'packages/auth/src/audit-auth.ts'],
  ['user.signup', 'packages/auth/src/audit-auth.ts'],
  ['guest.joined', 'apps/api/src/guest/guest-token.controller.ts'],
];

function lire(relatif: string): string {
  return readFileSync(join(racine, relatif), 'utf8');
}

describe('ce qui ecrit dans le journal d audit', () => {
  it.each(ECRIVAINS)('%s est ecrite par %s', (action, fichier) => {
    // ⚠️ On cherche `action: 'nom'`, la forme du CODE, et non le nom seul.
    // Premiere version ecrite avec `toContain(action)` : elle restait verte
    // alors que j avais renomme l action, parce que le nom figurait encore
    // dans le commentaire du fichier. Deuxieme fois que ce piege se presente
    // dans ce test — un commentaire n est pas une garantie.
    expect(
      lire(fichier),
      `${fichier} n ecrit plus l action ${action} : elle n est plus auditee`,
    ).toContain(`action: '${action}'`);
  });

  it('l abonne ne porte plus de liste de noms a ecouter', () => {
    // Le garde-fou central : c est cette liste qui a menti pendant des mois, en
    // declarant une couverture que la frontiere des processus rendait
    // impossible. Qu elle ne revienne pas.
    expect(
      lire(ABONNE),
      'une liste de noms est revenue dans l abonne. Verifie que chacun est emis depuis l API, ' +
        'et non depuis le host : le bus est in-process, les deux ne se parlent pas (issue #60).',
    ).not.toContain('AUDIT_EVENTS');
  });

  it('l abonne ne persiste que les audit.security, par le joker', () => {
    const source = lire(ABONNE);
    expect(source).toContain("startsWith('audit.security.')");
    // Aucun abonnement a un nom litteral : seul le joker reste.
    const abonnementsLitteraux = [...source.matchAll(/eventBus\.on\('([a-z][a-z.]*)'/g)]
      .map((m) => m[1])
      .filter((nom) => nom !== '*.*');
    expect(abonnementsLitteraux, 'un abonnement a un nom precis est revenu').toEqual([]);
  });

  it('guest.joined n est plus ecrite deux fois', () => {
    // Son controleur ecrit en direct ET emet l evenement. L emission reste
    // legitime — un futur abonne peut en avoir besoin — mais l abonne d audit
    // ne doit plus la persister, sinon chaque invite laisse deux lignes.
    const controleur = lire('apps/api/src/guest/guest-token.controller.ts');
    expect(controleur).toContain('auditLog.create');

    // ⚠️ On cherche l ABONNEMENT, pas le nom. Premiere version ecrite avec
    // `.not.toContain('guest.joined')` : elle echouait sur le commentaire de
    // l abonne, qui raconte justement cette histoire. Un test incapable de
    // distinguer un commentaire d un appel ne garde pas ce qu il croit.
    expect(lire(ABONNE)).not.toContain("eventBus.on('guest.joined'");
  });
});
