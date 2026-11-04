import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * CHAQUE PAQUET TYPECHECKE SES TESTS (issue #31).
 *
 * `tsconfig.json` exclut `**\/*.spec.ts` dans plusieurs paquets, et c'est juste :
 * le build ne doit pas emettre les tests dans `dist`. Mais le script
 * `typecheck` visait ce meme fichier, donc une erreur de type dans un test
 * passait la CI sans bruit. Vitest transpile avec esbuild, qui retire les types
 * sans les verifier : personne ne regardait.
 *
 * Le motif retenu est celui que `module-loto` avait deja : un
 * `tsconfig.typecheck.json` qui etend le tsconfig local et reinclut `src/**`.
 *
 * ⚠️ POURQUOI CE N'EST PAS CENTRALISE DANS UN FICHIER PARTAGE, malgre ce que
 * l'issue suggerait. TypeScript resout `include` et `exclude` relativement au
 * fichier de configuration QUI LES DECLARE. Un `include: ["src/**\/*"]` pose
 * dans `packages/config` pointerait donc sur `packages/config/src`, pas sur le
 * paquet qui etend. Seul `noEmit` serait partageable, ce qui ne vaut pas
 * l'indirection. Ce qui est centralise, c'est le GARDE-FOU : ce test, qui
 * refuse qu'un paquet revienne a un typecheck aveugle aux tests.
 */

const racine = fileURLToPath(new URL('../../..', import.meta.url));

interface Paquet {
  nom: string;
  chemin: string;
  scriptTypecheck: string;
  tsconfigDuTypecheck: string;
}

function sansCommentaires(json: string): string {
  return json.replace(/^\s*\/\/.*$/gm, '');
}

function lire(chemin: string): Record<string, unknown> {
  return JSON.parse(sansCommentaires(readFileSync(chemin, 'utf8'))) as Record<string, unknown>;
}

/** Les paquets du monorepo qui declarent un script `typecheck`. */
function paquets(): Paquet[] {
  const trouves: Paquet[] = [];
  for (const groupe of ['apps', 'packages']) {
    for (const nom of readdirSync(join(racine, groupe))) {
      const chemin = join(racine, groupe, nom);
      const manifeste = join(chemin, 'package.json');
      if (!existsSync(manifeste) || !existsSync(join(chemin, 'tsconfig.json'))) continue;
      const scripts = (lire(manifeste)['scripts'] ?? {}) as Record<string, string>;
      const script = scripts['typecheck'];
      if (script === undefined) continue;
      // `tsc --noEmit --project X` : on suit le projet nomme, sinon tsconfig.json.
      const projet = /--project\s+(\S+)/.exec(script)?.[1] ?? 'tsconfig.json';
      trouves.push({
        nom: `${groupe}/${nom}`,
        chemin,
        scriptTypecheck: script,
        tsconfigDuTypecheck: projet,
      });
    }
  }
  return trouves;
}

/** Les `*.spec.ts` d un paquet, en descendant dans `src`. */
function specs(chemin: string): string[] {
  const racineSrc = join(chemin, 'src');
  if (!existsSync(racineSrc)) return [];
  const trouves: string[] = [];
  const descendre = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === 'node_modules' || entree.name === 'dist') continue;
      const complet = join(dossier, entree.name);
      if (entree.isDirectory()) descendre(complet);
      else if (entree.name.endsWith('.spec.ts') || entree.name.endsWith('.spec.tsx')) {
        trouves.push(complet);
      }
    }
  };
  descendre(racineSrc);
  return trouves;
}

const tous = paquets();

describe('le typecheck de chaque paquet couvre ses tests', () => {
  it('trouve bien les paquets du monorepo', () => {
    // Garde-fou du garde-fou : si la decouverte casse, le test ci-dessous
    // passerait sur une liste vide et ne garderait plus rien.
    expect(tous.length).toBeGreaterThanOrEqual(8);
  });

  for (const paquet of tous) {
    const aDesTests = specs(paquet.chemin).length > 0;
    const titre = aDesTests
      ? `${paquet.nom} n exclut pas ses tests de son typecheck`
      : `${paquet.nom} n a pas de test (rien a couvrir)`;

    it(titre, () => {
      if (!aDesTests) {
        expect(aDesTests).toBe(false);
        return;
      }
      const chemin = join(paquet.chemin, paquet.tsconfigDuTypecheck);
      expect(existsSync(chemin), `${paquet.tsconfigDuTypecheck} doit exister`).toBe(true);
      const exclus = (lire(chemin)['exclude'] ?? []) as string[];
      const coupable = exclus.find((motif) => motif.includes('spec'));
      expect(
        coupable,
        `${paquet.nom} : son typecheck lit ${paquet.tsconfigDuTypecheck}, qui exclut ${String(coupable)}. `
          + 'Une erreur de type dans un test y passerait la CI. Ajouter un '
          + 'tsconfig.typecheck.json qui reinclut src/**, comme module-loto.',
      ).toBeUndefined();
    });
  }
});
