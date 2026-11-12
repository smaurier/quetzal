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
