import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * LE PORT DES IMAGES N EST PAS CONTOURNE (issues #28 et #27).
 *
 * Décision D6 du sous-projet 2 : les images vivent en base, derrière le port
 * `CardImageStore`. L issue #28 prévoit qu elles remontent un jour au niveau de
 * la plateforme, sur un stockage objet servi par CDN, et dit explicitement
 * « ne pas contourner le port en attendant » — parce que c est le port qui rend
 * ce basculement équivalent au remplacement d un adaptateur.
 *
 * Or cette instruction n était tenue par rien. Relevé le 05/11 : elle est
 * respectée aujourd hui, un seul fichier touche la table. Ce test fige ce fait,
 * pour que la bascule de #28 reste un remplacement d adaptateur et non une
 * chasse aux appels dispersés.
 *
 * Il garde aussi le chemin de nettoyage de #27 : supprimer un jeu laisse ses
 * images orphelines, et le correctif passera par ce port. Un contournement
 * ajouté entre-temps lui échapperait.
 *
 * ⚠️ Ce test lit les SOURCES, pas les types : un accès dispersé compile très
 * bien, et c est précisément pourquoi aucune autre barre ne le verrait.
 */

const racineModule = fileURLToPath(new URL('../..', import.meta.url));
const TABLE = 'loto_CardImage';
// ⚠️ Limite de mot obligatoire, et c est une mutation qui l a montre : chercher
// `loto_CardImage` en sous-chaine trouve aussi `loto_CardImageX`, donc renommer
// la table laissait ce test vert. Un garde-fou contre la vacuite qui etait
// lui-meme vide.
//
// Et une anticipation plutot que `\b` : dans un litteral de gabarit, `\b` est
// le caractere RETOUR ARRIERE, pas une limite de mot. Premiere version ecrite
// ainsi, regex qui ne trouvait rien, reference rouge. Cette forme n a aucun
// antislash, donc rien a mal echapper.
const MOT = new RegExp(`${TABLE}(?![A-Za-z0-9_])`);
const SEUL_AUTORISE = join('infrastructure', 'prisma-card-image.store.ts');

function fichiersTypeScript(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersTypeScript(chemin));
      continue;
    }
    if (entree.endsWith('.ts') || entree.endsWith('.tsx')) trouves.push(chemin);
  }
  return trouves;
}

describe('le port des images n est pas contourne', () => {
  it('seul son adaptateur touche la table des images', () => {
    const fautifs = fichiersTypeScript(join(racineModule, 'src'))
      .filter((chemin) => !chemin.endsWith('.spec.ts'))
      .filter((chemin) => MOT.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(join(racineModule, 'src'), chemin))
      .filter((relatif) => relatif !== SEUL_AUTORISE);

    expect(
      fautifs,
      `${TABLE} ne doit etre touchee que par ${SEUL_AUTORISE} (issue #28 : ne pas contourner le port). ` +
        `Fichiers fautifs : ${fautifs.join(', ')}`,
    ).toEqual([]);
  });

  it('et cet adaptateur existe toujours, sinon ce test ne garde rien', () => {
    // Sans ce controle, renommer ou supprimer l adaptateur rendrait le test
    // ci-dessus vert par vacuite : plus aucun fichier ne touche la table, donc
    // plus aucun fautif. Un test qui ne peut plus echouer ne garde rien.
    const adaptateur = readFileSync(join(racineModule, 'src', SEUL_AUTORISE), 'utf8');
    expect(adaptateur, `${TABLE} doit encore etre touchee par son adaptateur`).toMatch(MOT);
    expect(adaptateur).toContain('implements CardImageStore');
  });
});
