import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, it, expect } from 'vitest';

/**
 * LA FRONTIÈRE NOYAU ↔ MODULE DOIT ÊTRE TENUE PAR ESLINT (issue #86).
 *
 * `CLAUDE.md` §3 interdit trois imports dans un module et annonce leur
 * application : « Enforcement : ESLint `no-restricted-imports` + boundaries +
 * custom rules dans `packages/config/eslint/` ».
 *
 * Mesuré le 12/11 : aucune des trois n'était appliquée. Les règles existaient
 * dans `packages/config/eslint/module.js`, mais ce fichier est au format
 * eslintrc, personne ne le charge, et aucun paquet `packages/module-<slug>` n'a de
 * configuration qui l'étende. C'était de la configuration morte.
 *
 * ⚠️ POURQUOI CE TEST CHARGE `flat.js` RELATIVEMENT plutôt que de lancer
 * `eslint` en ligne de commande : le binaire résout `@quetzal/config` par le
 * nom du paquet, ce qui dépend des liens de l'espace de travail et casse dans
 * un worktree neuf. Charger l'objet de configuration par un chemin relatif
 * teste exactement ce que le dépôt applique, sans dépendre de la résolution.
 *
 * ⛔ Et le chemin du fichier sondé compte : les blocs `files:` de `flat.js` sont
 * des globs sur le chemin. Une sonde posée ailleurs que sous
 * `packages/module-<slug>/src/` passerait au vert sans rien prouver.
 */

const require_ = createRequire(import.meta.url);
const racine = fileURLToPath(new URL('../../..', import.meta.url));

interface ConfigPlate {
  readonly files?: readonly string[];
  readonly rules?: Readonly<Record<string, unknown>>;
}

const configurationDuDepot = require_('./flat.js') as readonly ConfigPlate[];

/** Lint un contenu comme s'il vivait dans un module, et rend les règles déclenchées. */
async function reglesDeclenchees(
  source: string,
  chemin = 'packages/module-quiz/src/sonde.ts',
): Promise<readonly string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: configurationDuDepot as never,
    cwd: racine,
  });
  const [resultat] = await eslint.lintText(source, { filePath: chemin });
  return (resultat?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((id): id is string => id !== null);
}

describe('frontiere noyau / module, tenue par ESLint', () => {
  /**
   * ⛔ LE PLUS GRAVE DES TROIS. Un module qui prend `PrismaClient` en direct
   * contourne le cloisonnement par locataire : il lirait les donnees de tous
   * les clients, et `TenantScopeViolationError` ne le verrait jamais passer.
   */
  it('refuse PrismaClient importe directement dans un module', async () => {
    const declenchees = await reglesDeclenchees(
      "import { PrismaClient } from '@prisma/client';\nexport const client = PrismaClient;\n",
    );

    expect(declenchees).toContain('no-restricted-imports');
  });

  it('refuse rootPrisma, le client non cloisonne, dans un module', async () => {
    const declenchees = await reglesDeclenchees(
      "import { rootPrisma } from '@quetzal/db';\nexport const client = rootPrisma;\n",
    );

    expect(declenchees).toContain('no-restricted-imports');
  });

  /**
   * Le bus d'evenements existe pour que deux modules ne se connaissent pas
   * (CLAUDE.md §3). Un import direct le contourne.
   */
  it('refuse un import croise entre deux modules', async () => {
    const declenchees = await reglesDeclenchees(
      "import { manifest } from '@quetzal/module-loto/manifest';\nexport const m = manifest;\n",
    );

    expect(declenchees).toContain('no-restricted-imports');
  });

  /**
   * ⛔ ET LA CONTRE-EPREUVE, sans laquelle les trois tests ci-dessus ne
   * prouveraient qu une interdiction trop large. Le NOYAU doit pouvoir
   * importer ce qu un module ne peut pas : c est lui qui fournit `ctx.prisma`.
   */
  it('laisse le noyau importer rootPrisma, qui lui est reserve', async () => {
    const declenchees = await reglesDeclenchees(
      "import { rootPrisma } from '@quetzal/db';\nexport const client = rootPrisma;\n",
      'packages/core/src/sonde.ts',
    );

    expect(declenchees).not.toContain('no-restricted-imports');
  });

  /**
   * ⛔ L EXCEPTION, GARDEE PLUTOT QUE TAIRE. Un test d integration a besoin de
   * regarder la base SANS le client cloisonne : c est la seule facon de prouver
   * que le cloisonnement a bien eu lieu, au lieu de ne verifier que lui-meme.
   * `module-hello` le fait deja pour relire une ligne et confirmer son
   * `tenantId`.
   *
   * Sans ce test, quelqu un pourrait durcir la regle sur les specs en croyant
   * bien faire, et rendre le cloisonnement inverifiable.
   */
  it('laisse un test d integration de module utiliser le client non cloisonne', async () => {
    const declenchees = await reglesDeclenchees(
      "import { PrismaClient } from '@prisma/client';\nexport const client = PrismaClient;\n",
      'packages/module-quiz/src/infrastructure/sonde.integration.spec.ts',
    );

    expect(declenchees).not.toContain('no-restricted-imports');
  });

  /**
   * Et un module garde le droit d importer ce que §3 lui autorise : sans ce
   * test, on pourrait interdire `@quetzal/core` par megarde et ne le decouvrir
   * qu au prochain module ecrit.
   */
  it('laisse un module importer les trois paquets que §3 lui autorise', async () => {
    const declenchees = await reglesDeclenchees(
      [
        "import { rooms } from '@quetzal/core';",
        "import { Button } from '@quetzal/ui';",
        "import { LOCALES } from '@quetzal/i18n';",
        'export const utilise = [rooms, Button, LOCALES];',
      ].join('\n'),
    );

    expect(declenchees).not.toContain('no-restricted-imports');
  });
});

/**
 * LES DEUX RÈGLES MAISON, TENUES POUR DE VRAI (issue #98).
 *
 * `packages/config/eslint/rules/no-raw-room-string.js` et `rules/tenant-safety.js`
 * existent depuis l'origine, fonctionnent, et **personne ne les chargeait** :
 * `grep -rn "eslint/rules"` hors du paquet `config` ne rendait aucune ligne.
 *
 * Mesuré le 12/11 par sonde dans un vrai chemin de module, avec un témoin (un
 * import interdit) pour prouver que le fichier était bien linté : 1 problème
 * au lieu de 3. Le témoin rougissait, les deux autres violations ne l'étaient
 * par rien.
 *
 * C'est la même maladie que #86, dans le même paquet.
 */
describe('regles maison de la plateforme, tenues par ESLint', () => {
  /**
   * ⛔ CLAUDE.md §7 : « Raw string room WS (helper `rooms.session()`
   * obligatoire) ». Une salle écrite à la main qui diverge d'un caractère
   * diffuse dans le vide : le message part, personne ne le reçoit, et aucune
   * erreur n'est levée.
   */
  it('refuse une salle WS ecrite a la main dans un module', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export function diffuser(server: { to(r: string): { emit(e: string): void } }) {',
        "  server.to('loto:session:abc').emit('card-drawn');",
        '}',
      ].join('\n'),
    );

    expect(declenchees).toContain('quetzal/no-raw-room-string');
  });

  /**
   * ⛔ LA CONTRE-ÉPREUVE, sans laquelle le test ci-dessus ne prouverait qu'une
   * interdiction trop large. La règle cherche un littéral contenant `:` ; un
   * appel au helper n'en est pas un, et c'est précisément la forme que tout le
   * code existant utilise (`loto.broadcaster.ts`, `loto.gateway.ts`,
   * `hello.gateway.ts`).
   */
  it('laisse passer une salle construite par le helper', async () => {
    const declenchees = await reglesDeclenchees(
      [
        "import { rooms } from '@quetzal/core';",
        'export function diffuser(server: { to(r: string): { emit(e: string): void } }) {',
        "  server.to(rooms.session('loto', 'abc')).emit('card-drawn');",
        '}',
      ].join('\n'),
    );

    expect(declenchees).not.toContain('quetzal/no-raw-room-string');
  });

  /**
   * ⛔ Un nom d'événement n'est pas une salle. `emit('card-drawn')` ne porte pas
   * de `:`, donc ne doit rien déclencher — sinon la règle serait inutilisable et
   * quelqu'un la désactiverait en bloc.
   */
  it('ne confond pas un nom d evenement avec une salle', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export function diffuser(server: { emit(e: string): void }) {',
        "  server.emit('game-finished');",
        '}',
      ].join('\n'),
    );

    expect(declenchees).not.toContain('quetzal/no-raw-room-string');
  });

  /**
   * ⛔ LE PLUS GRAVE DES DEUX. CLAUDE.md §9 : `$queryRaw` contourne l'extension
   * de cloisonnement de Prisma. Une requête brute dans un module lit les
   * données de tous les locataires, et `TenantScopeViolationError` ne la voit
   * jamais passer — c'est le même trou que `PrismaClient` en direct, par une
   * autre porte.
   */
  it('refuse une requete brute dans un module', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export async function compter(prisma: { $queryRaw(s: string): Promise<unknown> }) {',
        "  return prisma.$queryRaw('select count(*) from \"Loto_Card\"');",
        '}',
      ].join('\n'),
    );

    expect(declenchees).toContain('quetzal/tenant-safety');
  });

  it('refuse aussi la variante Unsafe', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export async function compter(prisma: { $executeRawUnsafe(s: string): Promise<unknown> }) {',
        "  return prisma.$executeRawUnsafe('delete from \"Loto_Card\"');",
        '}',
      ].join('\n'),
    );

    expect(declenchees).toContain('quetzal/tenant-safety');
  });

  /**
   * La porte de sortie que §9 autorise : `ctx.tenantRawQuery`, qui refuse une
   * requête sans clause `WHERE tenantId`. Sans ce test, on pourrait croire la
   * règle satisfaite en interdisant tout SQL, ce qui n'est pas ce que §9 dit.
   */
  it('laisse passer le helper cloisonne', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export async function compter(ctx: { tenantRawQuery(s: string): Promise<unknown> }) {',
        '  return ctx.tenantRawQuery(\'select count(*) from "Loto_Card" where "tenantId" = $1\');',
        '}',
      ].join('\n'),
    );

    expect(declenchees).not.toContain('quetzal/tenant-safety');
  });

  /**
   * ⛔ ET LA CONTRE-ÉPREUVE QUI COMPTE : le NOYAU garde le droit au SQL brut.
   * C'est lui qui écrit les migrations, les tâches d'administration et le
   * `onBoot`. Interdire partout aurait l'air plus sûr et casserait la
   * plateforme.
   */
  it('laisse le noyau ecrire du SQL brut, qui lui est reserve', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export async function compter(prisma: { $queryRaw(s: string): Promise<unknown> }) {',
        "  return prisma.$queryRaw('select count(*) from \"Organization\"');",
        '}',
      ].join('\n'),
      'packages/core/src/sonde.ts',
    );

    expect(declenchees).not.toContain('quetzal/tenant-safety');
  });

  /**
   * ⛔ ET CELLE-CI EST UN CHOIX, PAS UN OUBLI : `$queryRaw` reste interdit dans
   * un test d'intégration de module, alors que `PrismaClient` y est permis.
   *
   * La raison des deux est la même et ne mène pas au même endroit. Un test a
   * besoin du client NON cloisonné pour prouver que le cloisonnement a bien eu
   * lieu, au lieu de ne vérifier que lui-même — d'où l'exception de #86. Mais
   * une requête brute n'apporte rien de plus qu'un `findMany` sur ce client,
   * et elle apporte l'injection : `$queryRawUnsafe` avec un identifiant
   * interpolé est le chemin le plus court vers une fuite, dans un test comme
   * ailleurs.
   */
  it('refuse une requete brute meme dans un test d integration de module', async () => {
    const declenchees = await reglesDeclenchees(
      [
        'export async function compter(prisma: { $queryRaw(s: string): Promise<unknown> }) {',
        "  return prisma.$queryRaw('select count(*) from \"Loto_Card\"');",
        '}',
      ].join('\n'),
      'packages/module-quiz/src/infrastructure/sonde.integration.spec.ts',
    );

    expect(declenchees).toContain('quetzal/tenant-safety');
  });
});

/**
 * LES COUCHES DE CLAUDE.md §4, TENUES POUR DE VRAI (issue #98, point 3).
 *
 * `eslint-plugin-boundaries` était installé et requis par `base.js`, qui ne
 * déclarait ni élément ni règle : la promesse « enforced ESLint » de §4 n'a
 * jamais été tenue par rien.
 *
 * ⛔ Les cibles importées EXISTENT dans le dépôt. Le greffon résout chaque
 * import sur disque pour savoir à quelle couche il appartient : une cible
 * inventée ne serait rangée dans aucune couche et passerait au vert sans rien
 * prouver.
 */
describe('couches de la Clean Architecture, tenues par ESLint', () => {
  const COUCHE = 'boundaries/element-types';

  async function importe(depuis: string, cible: string): Promise<readonly string[]> {
    return reglesDeclenchees(
      `import * as cible from '${cible}';\nexport const sonde = cible;\n`,
      `packages/module-quiz/src/${depuis}`,
    );
  }

  it('refuse que le domaine depende de l application', async () => {
    expect(await importe('domain/sonde.ts', '../application/manage-bank.use-case.js')).toContain(COUCHE);
  });

  it('refuse que le domaine depende de l infrastructure', async () => {
    expect(await importe('domain/sonde.ts', '../infrastructure/prisma-question-bank.repository.js')).toContain(COUCHE);
  });

  it('refuse que l application depende de l infrastructure', async () => {
    expect(await importe('application/sonde.ts', '../infrastructure/prisma-question-bank.repository.js')).toContain(COUCHE);
  });

  it('refuse que l application depende de la presentation', async () => {
    expect(await importe('application/sonde.ts', '../presentation/bank.controller.js')).toContain(COUCHE);
  });

  it('refuse que l infrastructure depende de la presentation', async () => {
    expect(await importe('infrastructure/sonde.ts', '../presentation/bank.controller.js')).toContain(COUCHE);
  });

  /**
   * Les contre-épreuves : sans elles, une règle qui refuse TOUT import entre
   * fichiers passerait les cinq tests ci-dessus.
   */
  it('laisse le domaine dependre de lui-meme', async () => {
    expect(await importe('domain/sonde.ts', './errors.js')).not.toContain(COUCHE);
  });

  it('laisse l application dependre du domaine', async () => {
    expect(await importe('application/sonde.ts', '../domain/errors.js')).not.toContain(COUCHE);
  });

  it('laisse l infrastructure implementer les ports du domaine', async () => {
    expect(await importe('infrastructure/sonde.ts', '../domain/errors.js')).not.toContain(COUCHE);
  });

  it('laisse la presentation dependre de l application et du domaine', async () => {
    expect(await importe('presentation/sonde.ts', '../application/manage-bank.use-case.js')).not.toContain(COUCHE);
    expect(await importe('presentation/sonde.ts', '../domain/errors.js')).not.toContain(COUCHE);
  });

  /**
   * ⛔ La racine de composition (`quiz.module.ts`, `index.ts`) branche les
   * adaptateurs sur les ports : elle DOIT voir l'infrastructure. Elle n'est
   * dans aucune couche, et c'est voulu.
   */
  /**
   * ⛔ Un test d'intégration EST une racine de composition : il branche le vrai
   * adaptateur Prisma derrière la route pour la tester de bout en bout, comme
   * `hello.controller.integration.spec.ts`. Trouvé par la règle elle-même,
   * qu'un premier relevé au grep avait manqué en excluant les specs.
   */
  it('laisse un test d integration assembler la presentation et l infrastructure', async () => {
    expect(
      await importe('presentation/sonde.integration.spec.ts', '../infrastructure/prisma-question-bank.repository.js'),
    ).not.toContain(COUCHE);
  });

  /** La contre-épreuve : un test UNITAIRE reste tenu par les couches. */
  it('tient un test unitaire du domaine a l ecart de l infrastructure', async () => {
    expect(await importe('domain/sonde.spec.ts', '../infrastructure/prisma-question-bank.repository.js')).toContain(COUCHE);
  });

  it('laisse la racine de composition brancher l infrastructure', async () => {
    expect(await importe('quiz.module.sonde.ts', './infrastructure/prisma-question-bank.repository.js')).not.toContain(COUCHE);
  });
});
