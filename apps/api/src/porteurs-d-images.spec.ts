import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaCardImageStore } from '@quetzal/core';
import { AppModule, PORTEURS_D_IMAGES } from './app.module';

/**
 * Une liste en dur se perime en silence : le jour ou un troisieme module
 * portera des images, rien ne rappellera de l inscrire dans
 * `PORTEURS_D_IMAGES`, et ses images seront ramassees a la premiere
 * suppression faite par un autre module.
 *
 * Le premier test lit donc le schema fusionne et compte les prefixes de module
 * qui declarent une colonne `imageId`.
 *
 * ⚠️ Ce garde compare un NOMBRE, pas des noms : relier une classe a un
 * prefixe Prisma demanderait un registre que le depot n a pas. Il attrape
 * l oubli, qui est le cas reel ; il n attraperait pas une substitution. C est
 * une limite a assumer, pas a cacher.
 */

/**
 * Motif deja etabli dans ce paquet, cf.
 * `observability/audit-evenements-ecoutes.spec.ts` : `import.meta` est interdit
 * ici (`module: CommonJS`), donc la racine se trouve en remontant depuis le
 * dossier courant.
 */
function racineDuDepot(): string | null {
  let courant = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(courant, 'pnpm-workspace.yaml'))) return courant;
    courant = dirname(courant);
  }
  return null;
}

/**
 * Limite de mot ecrite SANS antislash, et ce n est pas une coquetterie :
 * "\b" vaut le caractere RETOUR ARRIERE des qu il passe par une couche qui
 * reduit les echappements, et la regex ne trouve alors plus rien. Piege paye
 * deux fois dans ce depot, cf. `packages/core/src/images/port-non-contourne.spec.ts`.
 */
const MOT_IMAGE_ID = /(^|[^A-Za-z0-9_])imageId([^A-Za-z0-9_]|$)/m;

describe('PORTEURS_D_IMAGES', () => {
  it('compte un fournisseur par module qui declare une colonne imageId', () => {
    const racine = racineDuDepot();
    expect(racine, 'racine du depot introuvable : pnpm-workspace.yaml non trouve en remontant')
      .not.toBeNull();
    const schema = readFileSync(
      join(racine ?? process.cwd(), 'packages/db/prisma/schema.prisma'), 'utf8');

    const prefixes = new Set<string>();
    for (const bloc of schema.split(/^model /m).slice(1)) {
      const corps = bloc.slice(0, bloc.indexOf('}'));
      if (!MOT_IMAGE_ID.test(corps)) continue;
      const nom = bloc.slice(0, bloc.indexOf(' '));
      if (!nom.includes('_')) continue;
      prefixes.add(nom.slice(0, nom.indexOf('_')).toLowerCase());
    }

    expect(
      prefixes.size,
      'aucun modele avec imageId : le schema a-t-il ete fusionne ?').toBeGreaterThan(0);
    expect(
      PORTEURS_D_IMAGES.length,
      `modules porteurs d images dans le schema : ${[...prefixes].sort().join(', ')}`,
    ).toBe(prefixes.size);
  });

  /**
   * ⛔ LE GARDE DU CABLAGE, et il est aussi important que le precedent.
   *
   * `PrismaCardImageStore` est fourni par `useClass` dans la portee de CHAQUE
   * module, et son injection est `@Optional()` : un tableau qui n arriverait
   * pas ne leverait rien, le registre serait vide, et le ramassage ne
   * ramasserait plus jamais rien. Muet, vert, et faux.
   *
   * Ce test reproduit la situation exacte de `LotoModule` : un module frere qui
   * n importe pas `ImageReferencesModule` et qui fournit le depot lui-meme.
   * Mesure du 10/11 : avec le tableau dans les `providers` d `AppModule` au
   * lieu d un module `@Global()`, il rougit.
   */
  it('le tableau atteint un depot fourni par un module qui n importe rien', async () => {
    @Module({ providers: [{ provide: 'DEPOT', useClass: PrismaCardImageStore }] })
    class ModuleFrere {}

    const contexte = await Test.createTestingModule({
      imports: [AppModule, ModuleFrere],
    }).compile();

    const depot = contexte.get<PrismaCardImageStore>('DEPOT', { strict: false });

    // ⚠️ Lecture d un champ prive, et c est assume : c est le SEUL observable
    // qui distingue « le tableau est arrive » de « @Optional() a injecte
    // undefined » sans une vraie base. Un accesseur public serait de l API de
    // production ajoutee pour le test.
    const recus = (depot as unknown as { fournisseurs: readonly unknown[] }).fournisseurs;

    // Sans ce premier controle, une liste vide rendrait ce test vert par
    // vacuite : 0 fournisseur attendu, 0 recu. C est le test voisin qui
    // attrape la liste vide, mais un garde ne doit pas dependre de son voisin
    // pour ne pas etre creux.
    expect(PORTEURS_D_IMAGES.length, 'aucun porteur declare').toBeGreaterThan(0);
    expect(
      recus.length,
      'le registre arrive vide dans un module frere : le ramassage ne ramasserait plus rien',
    ).toBe(PORTEURS_D_IMAGES.length);

    await contexte.close();
  });
});
