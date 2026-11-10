# Module Quiz, plan 1 : le socle et la banque de questions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire exister le module `quiz` dans la plateforme, remonter le port des images dans le noyau, et livrer la banque de questions, Elda peut composer, éditer et supprimer des questions des deux modes de réponse, avec images.

**Architecture:** Clean Architecture par couches dans `packages/module-quiz` (Domain pur, Application, Infrastructure Prisma, Presentation Nest + React), comme `packages/module-loto`. Deux règles de domaine pures portent toute la valeur de ce plan : la validation d'une réponse et la normalisation d'une saisie. Le port des images monte dans `@quetzal/core` par remaniement pur, sans migration.

**Tech Stack:** TypeScript strict · NestJS 11 · Prisma 6 / PostgreSQL · Next 15 App Router · Zod · Vitest · testcontainers · Playwright.

**Spec de référence :** [`docs/superpowers/specs/2026-11-08-quetzal-module-quiz-design.md`](../specs/2026-11-08-quetzal-module-quiz-design.md). Les décisions citées (D1, D2, D11…) y sont.

**Ce plan NE contient PAS la séance**, sessions, participants, scoring, diffusion, retour de séance. C'est le plan 2, et la couture est voulue : à la fin de ce plan-ci, Elda a une banque de questions utilisable, et rien ne dépend d'une session.

---

## ⛔ À lire avant la première commande

**La base locale.** `.env.local` pointe sur la base Neon de **production**. Toute
commande Prisma doit donc exporter `DATABASE_URL` vers la base locale **dans le
même appel shell**, et vérifier la valeur avant d'agir, les variables ne
survivent pas d'un appel à l'autre.

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
```

**Ne jamais lancer `pnpm dev`** pour les tests de bout en bout : il lit
`.env.local`. La recette locale complète est au § « Vérification de bout en
bout », tâche 16.

⛔ **Un piège mesuré le 10/11, qui est une instance de la règle au-dessus.**
`pnpm --filter @quetzal/db prisma <quoi que ce soit>` **ne lance rien** : pnpm
cherche un script nommé `prisma` dans ce paquet, ne le trouve pas, affiche
« None of the selected packages has a "prisma" script » et sort en **code 0**.
Une vérification écrite ainsi passerait donc pour verte en n’ayant rien
exécuté. Il faut `pnpm --filter @quetzal/db exec prisma <quoi>`, et les
scripts déjà nommés (`prisma:generate`, `prisma:migrate:deploy`, `schema:merge`)
se lancent eux sans `exec`.
**Après tout changement de modèle Prisma**, dans cet ordre, sinon le client
généré mentira : `schema:merge`, `generate:tenant-registry`, `prisma:generate`.

**`pnpm --filter <app> build` ne reconstruit PAS ses dépendances.** Pour vérifier
qu'un serveur sert bien le code qu'on vient d'écrire, lire l'artefact
(`grep` dans `dist/`), jamais le supposer.

---

## Structure des fichiers

### Remontée du port des images dans le noyau (D11)

| Fichier | Responsabilité |
|---|---|
| Déplacé : `packages/module-loto/src/domain/ports/card-image.store.ts` → `packages/core/src/images/image-store.ts` | le port, inchangé dans sa forme |
| Déplacé : `packages/module-loto/src/infrastructure/prisma-card-image.store.ts` → `packages/core/src/images/prisma-image-store.ts` | l'adaptateur, inchangé dans son SQL |
| Déplacé : `packages/module-loto/src/infrastructure/prisma-card-image.store.integration.spec.ts` → `packages/core/src/images/prisma-image-store.integration.spec.ts` | ses tests d'intégration |
| Déplacé : `packages/module-loto/src/infrastructure/port-images-non-contourne.spec.ts` → `packages/core/src/images/port-non-contourne.spec.ts` | le garde, qui doit suivre le port sinon il garde un chemin mort |
| Déplacé : bloc `model Loto_CardImage` de `packages/module-loto/prisma/models.prisma` → `packages/db/prisma/core.prisma` | **aucun SQL ne change** : `merge-schemas.ts` concatène |
| Modifié : `packages/core/src/index.ts`, `packages/core/package.json` | export du port sous un sous-chemin |
| Modifiés : `packages/module-loto/src/{loto.module.ts, application/manage-decks.use-case.ts, application/testing/fake-repositories.ts, presentation/image.controller.ts}` | importent désormais depuis `@quetzal/core/images` |
| Créé : `packages/module-loto/src/infrastructure/loto-image-references.ts` | rend au loto la lecture que le ramassage du noyau faisait pour lui |
| Créé : `packages/module-quiz/src/infrastructure/quiz-image-references.ts` | la même chose pour le quiz, questions **et** propositions |

### Le module quiz

| Fichier | Responsabilité |
|---|---|
| `packages/module-quiz/package.json`, `tsconfig*.json`, `vitest*.config.ts` | squelette, copié de `module-hello` |
| `packages/module-quiz/prisma/models.prisma` | `Quiz_Deck`, `Quiz_Question`, `Quiz_Option`, `Quiz_AcceptedAnswer` |
| `src/domain/errors.ts` | erreurs typées héritant de `DomainError` |
| `src/domain/answer-mode.ts` | l'union fermée `choix` / `saisie` et son garde |
| `src/domain/normalisation.ts` | **règle pure** : normaliser une saisie selon deux drapeaux |
| `src/domain/answer-check.ts` | **règle pure** : une réponse est-elle juste, pour les deux modes |
| `src/domain/ports/question-bank.repository.ts` | le port de persistance |
| `src/application/manage-bank.use-case.ts` | orchestration CRUD de la banque |
| `src/application/testing/fake-repositories.ts` | doublures manuelles, jamais `vi.mock` |
| `src/infrastructure/prisma-question-bank.repository.ts` | l'adaptateur Prisma |
| `src/presentation/dto/quiz.dto.ts` | schémas Zod de frontière |
| `src/presentation/bank.controller.ts` | routes HTTP de la banque |
| `src/presentation/image.controller.ts` | envoi et service des images, via le port du noyau |
| `src/presentation/ui/{banks-page,bank-editor}.tsx` | les deux écrans d'autorat |
| `src/i18n/{fr,en,es}.json` | catalogues, parité obligatoire |
| `src/{manifest.ts, client.ts, index.ts, quiz.module.ts}` | contrat du module |
| `tests/manifest.spec.ts` | test de contrat |
| Modifiés : `apps/api/package.json`, `apps/host/package.json`, `.github/workflows/ci.yml`, `render.yaml`, `turbo.json` | déclarer le slug `quiz` |

---

## Task 1 : remonter le port des images dans le noyau, sans migration

**Files:**
- Create: `packages/core/src/images/image-store.ts`
- Create: `packages/core/src/images/prisma-image-store.ts`
- Create: `packages/core/src/images/index.ts`
- Delete: `packages/module-loto/src/domain/ports/card-image.store.ts`
- Delete: `packages/module-loto/src/infrastructure/prisma-card-image.store.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/db/prisma/core.prisma`
- Modify: `packages/module-loto/prisma/models.prisma`

- [ ] **Step 1 : relever la référence AVANT de bouger quoi que ce soit**

Le garde et la suite d'intégration du loto doivent être verts avant le
remaniement, sinon on ne saura pas ce qu'on a cassé.

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-loto test
pnpm --filter @quetzal/module-loto test:integration
```

Expected: les deux verts. Noter les deux nombres de tests, ce sont les
références à retrouver à la fin de la tâche 2.

- [ ] **Step 2 : déplacer le port**

```bash
mkdir -p packages/core/src/images
git mv packages/module-loto/src/domain/ports/card-image.store.ts packages/core/src/images/image-store.ts
git mv packages/module-loto/src/infrastructure/prisma-card-image.store.ts packages/core/src/images/prisma-image-store.ts
```

- [ ] **Step 3 : corriger les imports internes du fichier déplacé**

Dans `packages/core/src/images/prisma-image-store.ts`, remplacer la ligne
d'import du port et celle des helpers du noyau :

```ts
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '../tenant/scoped-prisma.js';
import type { CardImageStore, StoredImage } from './image-store.js';
```

⚠️ `getTenantScopedPrisma` venait de `@quetzal/core` : depuis l'intérieur du
noyau, c'est un chemin relatif, sinon le paquet s'importe lui-même.

- [ ] **Step 4 : déplacer le bloc `model` dans le noyau**

Couper le bloc `model Loto_CardImage { … }` de
`packages/module-loto/prisma/models.prisma` et le coller à la fin de
`packages/db/prisma/core.prisma`, en lui ajoutant ce commentaire :

```prisma
/// Images des modules. Remontée au noyau à l'issue #28, second consommateur :
/// le module quiz (spec sous-projet 3, D11).
///
/// ⚠️ LE NOM MENT, et c'est assumé : cette table appartient au noyau, et
/// CLAUDE.md §7 veut les modèles noyau sans préfixe de module. La renommer
/// exige un expand / contract, créer, recopier, écrire double, supprimer,
/// parce que les migrations partent dans le buildCommand de Render pendant que
/// l'ancienne instance sert encore (cf. #52). Renommage suivi en issue séparée.
model Loto_CardImage {
  id          String
  tenantId    String
  contentHash String   @db.VarChar(64)
  mimeType    String   @db.VarChar(40)
  bytes       Bytes
  createdAt   DateTime @default(now())

  @@id([id, tenantId])
  @@unique([contentHash, tenantId])
}
```

- [ ] **Step 5 : prouver qu'aucun SQL ne change, c'est le cœur de la tâche**

```bash
cp packages/db/prisma/schema.prisma /tmp/schema-avant.prisma
pnpm --filter @quetzal/db schema:merge
diff <(grep -v '^// ---' /tmp/schema-avant.prisma | grep -v '^$') \
     <(grep -v '^// ---' packages/db/prisma/schema.prisma | grep -v '^$')
```

Expected: le `diff` ne montre que le **déplacement** du bloc et l'ajout du
commentaire `///`, aucune colonne, aucun index, aucune contrainte modifiés.

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db prisma:generate
pnpm --filter @quetzal/db exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Expected: **exit code 0 et « No difference detected »**. C'est la preuve qu'aucune
migration n'est due. Si une différence apparaît, le bloc a été altéré en le
déplaçant : revenir au texte exact du step 4.

- [ ] **Step 6 : exposer le port sous un sous-chemin du noyau**

Dans `packages/core/package.json`, ajouter à `exports`, après `"./errors"` :

```json
    "./images": "./dist/images/index.js",
```

Créer `packages/core/src/images/index.ts` :

```ts
export type { CardImageStore, StoredImage } from './image-store.js';
export { PrismaCardImageStore } from './prisma-image-store.js';
```

⚠️ Un sous-chemin et non le baril `@quetzal/core` : l'index du noyau tire le bus
d'événements, le registre d'invités et le journal, et un composant Next qui
importerait le baril ferait échouer `next build`.

- [ ] **Step 7 : commit**

```bash
git add packages/core packages/db/prisma/core.prisma packages/module-loto/prisma/models.prisma
git commit -m "refactor(core): remonter le port des images dans le noyau

Issue #28, premiere moitie seulement (spec sous-projet 3, D11) : la
capacite remonte au niveau de la plateforme, la bascule vers un stockage
objet NE fait pas partie de ce travail.

Remaniement PUR, zero migration : prisma migrate diff rend « No
difference detected ». merge-schemas.ts concatene core.prisma et chaque
models.prisma de module, donc deplacer un bloc model d un fichier a
l autre ne change pas une ligne du SQL genere.

Le nom de la table ment desormais, et c est assume : la renommer exige un
expand / contract. Dette nommee dans un commentaire /// et suivie en
issue separee."
```

---

## Task 2 : faire suivre les consommateurs du loto, et le garde avec eux

**Files:**
- Modify: `packages/module-loto/src/loto.module.ts`
- Modify: `packages/module-loto/src/application/manage-decks.use-case.ts`
- Modify: `packages/module-loto/src/application/testing/fake-repositories.ts`
- Modify: `packages/module-loto/src/presentation/image.controller.ts`
- Move: `packages/module-loto/src/infrastructure/prisma-card-image.store.integration.spec.ts` → `packages/core/src/images/prisma-image-store.integration.spec.ts`
- Move: `packages/module-loto/src/infrastructure/port-images-non-contourne.spec.ts` → `packages/core/src/images/port-non-contourne.spec.ts`

- [ ] **Step 1 : rediriger les quatre imports du loto**

Dans les quatre fichiers, remplacer l'import relatif par le sous-chemin du noyau.

`packages/module-loto/src/application/manage-decks.use-case.ts` :

```ts
import type { CardImageStore } from '@quetzal/core/images';
```

`packages/module-loto/src/application/testing/fake-repositories.ts` :

```ts
import type { CardImageStore, StoredImage } from '@quetzal/core/images';
```

`packages/module-loto/src/presentation/image.controller.ts` :

```ts
import type { CardImageStore } from '@quetzal/core/images';
```

`packages/module-loto/src/loto.module.ts`, les deux lignes deviennent une :

```ts
import { PrismaCardImageStore, type CardImageStore } from '@quetzal/core/images';
```

- [ ] **Step 2 : vérifier qu'il ne reste aucun import de l'ancien chemin**

```bash
grep -rn "card-image.store" packages/ apps/ --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v /dist/
```

Expected: **aucune ligne**.

- [ ] **Step 3 : déplacer les deux fichiers de test**

```bash
git mv packages/module-loto/src/infrastructure/prisma-card-image.store.integration.spec.ts \
       packages/core/src/images/prisma-image-store.integration.spec.ts
git mv packages/module-loto/src/infrastructure/port-images-non-contourne.spec.ts \
       packages/core/src/images/port-non-contourne.spec.ts
```

- [ ] **Step 4 : réadapter le garde, sinon il surveille un chemin mort**

C'est le point le plus important de la tâche. `port-non-contourne.spec.ts` scanne
un dossier et autorise un seul fichier ; les deux ont bougé. Remplacer les trois
constantes de tête par :

```ts
const racineNoyau = fileURLToPath(new URL('..', import.meta.url));
const TABLE = 'loto_CardImage';
const MOT = new RegExp(`${TABLE}(?![A-Za-z0-9_])`);
const SEUL_AUTORISE = join('images', 'prisma-image-store.ts');
```

et, dans les deux `it`, remplacer `join(racineModule, 'src')` par `racineNoyau`,
et `join(racineModule, 'src', SEUL_AUTORISE)` par `join(racineNoyau, SEUL_AUTORISE)`.

⚠️ `TABLE` ne change PAS : la table garde son nom (task 1, step 4). Changer cette
chaîne ferait passer le garde au vert par vacuité, exactement ce que son second
`it` s'interdit.

- [ ] **Step 5 : prouver que le garde garde encore quelque chose, par mutation**

```bash
pnpm --filter @quetzal/core test -- src/images/port-non-contourne.spec.ts
```

Expected: 2 tests verts. Puis la mutation, qui doit rougir :

```bash
printf '\nconst sonde = "loto_CardImage";\nexport const jetable = sonde;\n' \
  >> packages/core/src/images/index.ts
pnpm --filter @quetzal/core test -- src/images/port-non-contourne.spec.ts
```

Expected: **ROUGE**, avec `index.ts` listé parmi les fautifs. Puis restaurer :

```bash
git checkout -- packages/core/src/images/index.ts
pnpm --filter @quetzal/core test -- src/images/port-non-contourne.spec.ts
```

Expected: 2 tests verts.

- [ ] **Step 6 : retrouver les références du step 1 de la tâche 1**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @quetzal/core test:integration
pnpm --filter @quetzal/module-loto test:integration
```

Expected: tout vert. Le total de `module-loto` a baissé du nombre de tests
déplacés, et celui de `@quetzal/core` a monté d'autant. Vérifier que la somme est
inchangée : c'est ce qui prouve qu'aucun test n'a disparu en route.

- [ ] **Step 7 : commit**

```bash
git add -A
git commit -m "refactor(loto): consommer le port des images depuis le noyau

Quatre imports rediriges vers @quetzal/core/images, et les deux fichiers
de test suivent le port.

⚠️ Le garde port-non-contourne a ete readapte, pas seulement deplace : il
scanne un dossier et n autorise qu un fichier, et les deux avaient bouge.
Laisse tel quel, il aurait surveille un chemin que plus personne
n emprunte et serait passe au vert par vacuite, le defaut que son second
test s interdit. Reverifie par mutation : une occurrence ajoutee ailleurs
dans le noyau le fait rougir.

Le nom de la table est inchange, donc aucune migration."
```

---

## Task 3 : le ramassage des images ne doit pas effacer celles d'un autre module

**Files:**
- Modify: `packages/core/src/images/image-store.ts`
- Modify: `packages/core/src/images/prisma-image-store.ts`
- Modify: `packages/core/src/images/index.ts`
- Modify: `packages/module-loto/src/loto.module.ts`
- Create: `packages/module-loto/src/infrastructure/loto-image-references.ts`
- Modify: `packages/module-loto/src/application/testing/fake-repositories.ts`
- Test: `packages/core/src/images/prisma-image-store.integration.spec.ts`

⛔ **C'est une correction de perte de données, et elle doit atterrir AVANT que le
quiz écrive sa première image.** Mesuré dans le code existant :

```bash
sed -n '/async deleteOrphans/,/^  }/p' packages/core/src/images/prisma-image-store.ts
```

Expected: la méthode lit `loto_Card.imageId`, **et rien d'autre**, puis
`deleteMany({ where: { id: { notIn: referencees } } })`. Tant que le loto était
seul, c'était juste. Dès que le quiz partage la table, supprimer un jeu de loto
appelle `deleteOrphans()` (depuis `manage-decks.use-case.ts:82`), aucune image de
quiz n'est dans la liste du loto, et **toutes** sont détruites.

- [ ] **Step 1 : écrire le test qui échoue, avec deux consommateurs**

Ajouter à `packages/core/src/images/prisma-image-store.integration.spec.ts`, dans
le `describe('PrismaCardImageStore.deleteOrphans (intégration)')` existant :

```ts
  /**
   * ⛔ LE TEST QUI COMPTE. Le ramassage ne voyait que les cartes de loto. Un
   * second module qui référence la même table perdrait toutes ses images à la
   * première suppression de jeu, sans message et sans trace.
   *
   * Pas besoin du module quiz pour l'écrire : un fournisseur de références
   * écrit à la main tient le rôle du second consommateur, et c'est MIEUX : le
   * test ne dépend d'aucun module, donc il garde aussi le troisième.
   */
  it('garde une image que seul un AUTRE consommateur reference', async () => {
    const { tenantId, ownerId } = await seedTenant();

    const gardee = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).put({
        mimeType: 'image/png',
        bytes: new Uint8Array([9, 9, 9]),
      }));

    const voisin: ImageReferenceProvider = {
      async referencedImageIds() {
        return [gardee.id];
      },
    };
    const store = new PrismaCardImageStore([voisin]);

    const supprimees = await inTenant(tenantId, ownerId, () => store.deleteOrphans());

    expect(supprimees, 'aucune image a ramasser').toBe(0);
    expect(
      await inTenant(tenantId, ownerId, () => store.findByHash(gardee.contentHash)),
      "l image d un autre module ne doit pas etre ramassee").not.toBeNull();
  });

  /**
   * ⛔ LE SECOND PIÈGE, et il est pire que le premier. `notIn: []` ne protège
   * RIEN : il supprime toute la table. Un hôte mal câblé, aucun fournisseur
   * enregistré, effacerait donc toutes les images de tous les modules, et
   * passerait pour un ramassage réussi.
   */
  it('ne supprime RIEN quand aucun consommateur n est enregistre', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const image = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).put({
        mimeType: 'image/png',
        bytes: new Uint8Array([7, 7]),
      }));

    const supprimees = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).deleteOrphans());

    expect(supprimees, 'un registre vide est une panne de cablage, pas un vide').toBe(0);
    expect(
      await inTenant(tenantId, ownerId, () =>
        new PrismaCardImageStore([]).findByHash(image.contentHash))).not.toBeNull();
  });
```

Et ajouter `ImageReferenceProvider` à l'import du haut du fichier :

```ts
import { PrismaCardImageStore } from './prisma-image-store.js';
import type { ImageReferenceProvider } from './image-store.js';
```

⛔ **CE PARAGRAPHE DISAIT LE CONTRAIRE DU STEP 5, ET IL AVAIT TORT.** Corrige
le 10/11 apres la revue de conformite.

Il demandait de laisser les tests existants construire
`new PrismaCardImageStore()` sans argument, « pour ne pas effacer la preuve que
le defaut de cablage est traite ». Mesure : des que le garde de registre vide
existe, un depot sans fournisseur sort au `return 0` **avant le moindre appel
Prisma**. Les laisser ainsi rend donc CREUX les deux tests qui attendaient une
suppression, et surtout le seul garde de cloisonnement du ramassage, dont
l'assertion « l'image du voisin survit » devient vraie par construction.

**Donne le fournisseur du loto a tous les tests de ce `describe`**, sauf celui
qui garde justement le registre vide. Et pour le test de cloisonnement, ajoute
en plus une orpheline du locataire courant et attends qu'elle PARTE : sans elle,
un `deleteMany` qui ne verrait rien du tout passerait encore.

Contre-epreuve a faire : rendre le depot sans fournisseur doit faire rougir le
test de cloisonnement sur `expected +0 to be 1`. Si ce rouge ne vient pas, le
test ne garde rien.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/core test:integration
```

Expected: FAIL. Le premier nouveau test échouera à la compilation
(`Expected 0 arguments, but got 1`), c'est un échec valable, il dit que le
constructeur n'accepte pas encore de fournisseurs. ⚠️ Si Vitest s'arrête sur
l'erreur de types sans lancer les anciens tests, noter leur nombre à part
(`pnpm --filter @quetzal/core test:integration` avant d'éditer) : c'est la
référence à retrouver au step 5.

- [ ] **Step 3 : étendre le port**

Ajouter à `packages/core/src/images/image-store.ts` :

```ts
/**
 * Ce qu'un module répond quand on lui demande quelles images il utilise encore.
 *
 * Le ramassage vit dans le noyau, mais le noyau ne sait pas lire les tables des
 * modules, et ne doit pas le savoir, sinon ajouter un module exigerait de le
 * modifier. Chaque module répond donc pour lui-même.
 */
export interface ImageReferenceProvider {
  /** Les `id` d'images que ce module référence encore, pour le locataire courant. */
  referencedImageIds(): Promise<readonly string[]>;
}
```

et exporter le type depuis `packages/core/src/images/index.ts` :

```ts
export type { CardImageStore, StoredImage, ImageReferenceProvider } from './image-store.js';
export { PrismaCardImageStore, IMAGE_REFERENCE_PROVIDERS } from './prisma-image-store.js';
```

- [ ] **Step 4 : réécrire le ramassage**

Dans `packages/core/src/images/prisma-image-store.ts`, ajouter le jeton, le
constructeur, et remplacer `deleteOrphans` :

```ts
import { Inject, Injectable, Optional } from '@nestjs/common';
```

```ts
/**
 * Jeton du tableau de fournisseurs. Nest n'a pas de `multi: true` : chaque
 * module fournit SA classe, et l'hôte assemble le tableau par fabrique,
 * cf. `apps/api/src/app.module.ts`.
 */
export const IMAGE_REFERENCE_PROVIDERS = 'ImageReferenceProviders';
```

```ts
  constructor(
    @Optional()
    @Inject(IMAGE_REFERENCE_PROVIDERS)
    private readonly fournisseurs: readonly ImageReferenceProvider[] = []) {}
```

```ts
  /**
   * ⛔ Un ramassage, et non une suppression en cascade : la déduplication par
   * empreinte fait qu'une même image sert plusieurs lignes, dans plusieurs
   * modules. Supprimer « les images du jeu » détruirait celle d'un voisin.
   *
   * ⛔ Et un registre VIDE n'est pas « rien ne référence » : c'est un câblage
   * manquant. `notIn: []` supprimerait toute la table et rendrait un nombre
   * flatteur. On refuse donc de ramasser plutôt que de tout détruire.
   */
  async deleteOrphans(): Promise<number> {
    if (this.fournisseurs.length === 0) return 0;

    const listes = await Promise.all(
      this.fournisseurs.map((fournisseur) => fournisseur.referencedImageIds()));
    const referencees = [...new Set(listes.flat())];

    const { count } = await this.prisma.loto_CardImage.deleteMany({
      where: { id: { notIn: referencees } },
    });
    return count;
  }
```

⚠️ Le `select: { imageId: true }` sur `loto_Card` disparaît d'ici : le noyau ne
lit plus aucune table de module. C'est tout l'objet de la tâche.

- [ ] **Step 5 : lancer les tests pour les voir passer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/core test:integration
```

Expected: les deux nouveaux tests verts, **et** les anciens du même `describe`
toujours verts, ils construisent le dépôt sans fournisseur, donc ils ramassent
désormais zéro. ⚠️ **Si l'un d'eux attendait une suppression**, il rougira : c'est
juste, et c'est ce qu'il faut regarder de près. Le réparer en lui donnant le
fournisseur du loto (step 6), **jamais** en abaissant son attente.

- [ ] **Step 6 : le fournisseur du loto, qui rend au module la lecture perdue**

`packages/module-loto/src/infrastructure/loto-image-references.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { ImageReferenceProvider } from '@quetzal/core/images';

/** Exactement la lecture que `deleteOrphans` faisait avant, rendue au module. */
@Injectable()
export class LotoImageReferences implements ImageReferenceProvider {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as {
      loto_Card: { findMany(args: unknown): Promise<{ imageId: string | null }[]> };
    };
    const cartes = await prisma.loto_Card.findMany({
      where: { imageId: { not: null } },
      select: { imageId: true },
    });
    return [
      ...new Set(cartes.map((carte) => carte.imageId).filter((id): id is string => id !== null)),
    ];
  }
}
```

Ne rien câbler encore : cette étape ne crée que la classe. Le dépôt reçoit ses
fournisseurs au step 7, et **tous** à la fois, un dépôt qui ne connaîtrait que
les références de son propre module supprimerait celles du voisin : c'est le défaut
tout entier réintroduit un étage plus bas.

- [ ] **Step 7 : enregistrer le tableau complet, à un seul endroit**

⛔ **La première version de ce step était FAUSSE, et son échec était MUET.**
Elle posait les fournisseurs dans les `providers` d'`AppModule`. Mesuré le
10/11 : ça ne marche pas, et rien ne le dit.

`PrismaCardImageStore` est fourni par `useClass` **dans** chaque module (cf.
`loto.module.ts`), donc Nest résout son `@Inject(IMAGE_REFERENCE_PROVIDERS)`
dans la portée de CE module. Or `AppModule` est un module ordinaire, importé
par le `RootModule` composé dans `main.ts` **à côté** des modules de modules,
et un module ne voit pas les providers de ses frères. Comme l'injection est
`@Optional()`, Nest y met `undefined` **sans lever** : registre vide,
`deleteOrphans` rend 0 pour toujours, aucun ramassage, aucune erreur.

La forme ci-dessous est celle qui marche, et le step 8 la prouve par mutation :
remettre les fournisseurs dans `AppModule` fait rougir le garde de câblage.

Le tableau se construit à **un seul endroit**, dans un module `@Global()` que
`AppModule` importe :

```ts
import { IMAGE_REFERENCE_PROVIDERS, type ImageReferenceProvider } from '@quetzal/core/images';
import { LotoImageReferences } from '@quetzal/module-loto';
import { QuizImageReferences } from '@quetzal/module-quiz';

/**
 * ⛔ Tous les porteurs d'images, et à un seul endroit. Un module qui
 * construirait son propre dépôt avec ses seules références ramasserait les
 * images du voisin : c'est exactement le défaut que cette tâche corrige.
 *
 * ⚠️ La liste ne suit PAS `MODULES`, et c'est volontaire. Un module absent du
 * déploiement ne répondrait rien, donc ses images deviendraient ramassables par
 * un module présent. Une classe toujours présente répond pour lui. ⛔ Si un
 * module est retiré pour de bon, c'est son fournisseur qu'il faut retirer ici,
 * en connaissance de cause, issue à ouvrir pour ce cas.
 */
export const PORTEURS_D_IMAGES = [LotoImageReferences, QuizImageReferences] as const;
```

et le module qui le porte, dans le même fichier :

```ts
/**
 * ⚠️ `@Global()`, et ce n'est pas un raccourci de confort : c'est la seule
 * forme qui marche, pour la raison expliquée au-dessus. Le jeton est exporté,
 * donc visible depuis la portée de chaque module de module.
 */
@Global()
@Module({
  providers: [
    ...PORTEURS_D_IMAGES,
    {
      provide: IMAGE_REFERENCE_PROVIDERS,
      useFactory: (...fournisseurs: ImageReferenceProvider[]) => fournisseurs,
      inject: [...PORTEURS_D_IMAGES],
    },
  ],
  exports: [IMAGE_REFERENCE_PROVIDERS],
})
export class ImageReferencesModule {}
```

puis `ImageReferencesModule` en **première** entrée des `imports` d’`AppModule`.

⚠️ Deux contraintes du dépôt, mesurées à la même occasion, qui vont te tomber
dessus si tu ne les connais pas :

- **`packages/core/tsconfig.json` n'a pas `experimentalDecorators`.** Les
  décorateurs de **paramètre** du step 4 ne compilent alors ni sous esbuild ni
  sous `tsc`. Il faut l’activer. La portée réelle est un seul fichier :
  `prisma-image-store.ts` est le seul de tout `packages/core/src` à porter un
  décorateur.
- **`apps/api` est en `moduleResolution: Node`**, qui ne sait pas lire les
  sous-chemins d’`exports` : il ne peut donc pas importer
  `@quetzal/core/images` comme le font les modules (`TS2307`). Réexporter le
  jeton, le type et l'adaptateur depuis l'entrée racine `@quetzal/core`, que
  `apps/api` résout déjà. ⚠️ Vérifier avant que `apps/host` n’importe pas
  cette entrée racine, sinon on alourdit son bundle : au 10/11 il n'utilise
  que le sous-chemin `@quetzal/core/empreinte-du-build`.

⚠️ `PrismaCardImageStore` reste fourni par `useClass` dans chaque module : son
constructeur est `@Optional() @Inject(IMAGE_REFERENCE_PROVIDERS)`, donc Nest lui
passe le tableau dès qu'il est visible dans la portée. ⛔ `@Optional()` fait
qu'un oubli de câblage **ne lève pas**, et c'est le step 4 qui le rattrape, en
refusant de ramasser quand le tableau est vide.

Puis le garde contre la péremption de cette liste en dur, à écrire dans
`apps/api/src/porteurs-d-images.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PORTEURS_D_IMAGES } from './app.module.js';

/**
 * Une liste en dur se périme en silence : le jour où un troisième module
 * portera des images, rien ne rappellera de l'inscrire ici, et ses images
 * seront ramassées à la première suppression faite par un autre module.
 *
 * Ce test lit donc le schéma fusionné et compte les préfixes de module qui
 * déclarent une colonne `imageId`.
 */
describe('PORTEURS_D_IMAGES', () => {
  it('compte un fournisseur par module qui declare une colonne imageId', () => {
    const schema = readFileSync(
      fileURLToPath(new URL('../../../packages/db/prisma/schema.prisma', import.meta.url)),
      'utf8');

    const prefixes = new Set<string>();
    for (const bloc of schema.split(/^model /m).slice(1)) {
      const corps = bloc.slice(0, bloc.indexOf('}'));
      if (!/\bimageId\b/.test(corps)) continue;
      const nom = bloc.slice(0, bloc.indexOf(' '));
      if (!nom.includes('_')) continue;
      prefixes.add(nom.slice(0, nom.indexOf('_')).toLowerCase());
    }

    expect(
      prefixes.size,
      'aucun modele avec imageId : le schema a-t-il ete fusionne ?').toBeGreaterThan(0);
    expect(
      PORTEURS_D_IMAGES.length,
      `modules porteurs d images dans le schema : ${[...prefixes].sort().join(', ')}`).toBe(prefixes.size);
  });
});
```

⚠️ Ce garde compare un **nombre**, pas des noms : relier une classe à un préfixe
Prisma demanderait un registre que le dépôt n'a pas. Il attrape l'oubli, qui est
le cas réel ; il n'attraperait pas une substitution. C'est une limite à assumer,
pas à cacher.

⛔ Et le vérifier par mutation, sinon il peut tourner sur zéro préfixe et donner
un faux vert :

```bash
cd apps/api
cp src/app.module.ts /tmp/app.bak
sed -i "s/const PORTEURS_D_IMAGES = \[LotoImageReferences, QuizImageReferences\]/const PORTEURS_D_IMAGES = [LotoImageReferences]/" src/app.module.ts
pnpm vitest run src/porteurs-d-images.spec.ts
cp /tmp/app.bak src/app.module.ts
pnpm vitest run src/porteurs-d-images.spec.ts
```

Expected: rouge avec le message qui nomme `loto, quiz`, puis vert restauré.


- [ ] **Step 8 : prouver les gardes par mutation**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
cp packages/core/src/images/prisma-image-store.ts /tmp/img.bak

# M1 : le registre vide ne protege plus rien
sed -i "s/    if (this.fournisseurs.length === 0) return 0;//" packages/core/src/images/prisma-image-store.ts
pnpm --filter @quetzal/core test:integration
cp /tmp/img.bak packages/core/src/images/prisma-image-store.ts

# M2 : un seul fournisseur consulte au lieu de tous
sed -i "s/      this.fournisseurs.map((fournisseur) => fournisseur.referencedImageIds()),/      this.fournisseurs.slice(0, 1).map((fournisseur) => fournisseur.referencedImageIds()),/" packages/core/src/images/prisma-image-store.ts
pnpm --filter @quetzal/core test:integration
cp /tmp/img.bak packages/core/src/images/prisma-image-store.ts
pnpm --filter @quetzal/core test:integration
```

Expected: M1 rouge sur « ne supprime RIEN quand aucun consommateur n est
enregistre ». ⚠️ **M2 restera peut-être VERTE** : les deux nouveaux tests n'ont
qu'un fournisseur chacun, donc `slice(0, 1)` ne change rien pour eux. C'est une
faiblesse réelle du harnais, pas un faux positif à ignorer, si M2 est verte,
ajouter un troisième test à **deux** fournisseurs, dont le second seul référence
l'image, et le refaire rougir. Un garde qu'on n'a pas vu rougir ne garde rien.

- [ ] **Step 9 : les portes complètes, puis commit en deux**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @quetzal/core test:integration
pnpm --filter @quetzal/module-loto test:integration
```

Expected: tout vert.

```bash
git add packages/core/src/images/prisma-image-store.integration.spec.ts
git commit -m "test(core): exiger que le ramassage epargne les images d un autre module

Vu rouge d abord, a la compilation : le constructeur n acceptait pas
encore de fournisseurs.

Defaut MESURE dans le code existant, pas suppose : deleteOrphans lisait
loto_Card.imageId et rien d autre, puis supprimait tout le reste. Tant que
le loto etait seul c etait juste. Des que le quiz partage la table,
supprimer un jeu de loto detruit TOUTES les images du quiz, sans message
et sans trace.

Le second test garde un piege pire : notIn: [] ne protege rien, il
supprime toute la table. Un registre vide est une panne de cablage, et le
ramassage rendait un nombre flatteur en effacant tout.

Les deux tests tiennent sans le module quiz : un fournisseur ecrit a la
main fait le second consommateur, donc ils gardent aussi le troisieme."
git add -A
git commit -m "fix(core): le ramassage consulte chaque module, et refuse un registre vide

Le noyau ne lit plus aucune table de module : chaque module repond pour
lui-meme via ImageReferenceProvider. Ajouter un module ne demande donc
plus de modifier le noyau.

Un registre vide rend 0 au lieu de tout supprimer.

⚠️ Le tableau se construit dans app.module.ts et nulle part ailleurs : un
module qui construirait son depot avec ses seules references ramasserait
les images du voisin, soit le defaut tout entier reintroduit.

⚠️ RESTE A TRAITER, issue a ouvrir : la liste ne suit PAS MODULES, et c
est voulu. Le risque residuel est donc l inverse : retirer un fournisseur
de cette liste alors que ses images vivent encore les rendrait
ramassables."
```

---

## Task 4 : le squelette du module quiz, enregistré et vide

**Files:**
- Create: `packages/module-quiz/package.json`
- Create: `packages/module-quiz/tsconfig.json`, `tsconfig.typecheck.json`
- Create: `packages/module-quiz/vitest.config.ts`, `vitest.integration.config.ts`
- Create: `packages/module-quiz/src/{client.ts, manifest.ts, index.ts, quiz.module.ts}`
- Create: `packages/module-quiz/src/i18n/{fr,en,es}.json`
- Create: `packages/module-quiz/src/presentation/ui/banks-page.tsx`
- Create: `packages/module-quiz/tests/manifest.spec.ts`
- Modify: `apps/api/package.json`, `apps/host/package.json`

- [ ] **Step 1 : copier le squelette de hello**

```bash
mkdir -p packages/module-quiz/src/{domain/ports,application/testing,infrastructure,presentation/dto,presentation/ui,i18n} packages/module-quiz/tests
for f in tsconfig.json tsconfig.typecheck.json vitest.config.ts vitest.integration.config.ts; do
  cp packages/module-hello/$f packages/module-quiz/$f
done
```

- [ ] **Step 2 : écrire `packages/module-quiz/package.json`**

Identique à celui de `module-hello`, nom et version près :

```json
{
  "name": "@quetzal/module-quiz",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./manifest": "./dist/manifest.js",
    "./client": "./dist/client.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit --project tsconfig.typecheck.json",
    "lint": "eslint src",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "zod": "^3.24.1",
    "react": "^19.0.0",
    "next-intl": "^3.26.3",
    "@quetzal/core": "workspace:*",
    "@quetzal/db": "workspace:*",
    "@quetzal/ui": "workspace:*"
  },
  "devDependencies": {
    "@prisma/client": "^6.19.3",
    "@quetzal/config": "workspace:*",
    "@types/react": "^19.0.2",
    "typescript": "^5.7.2",
    "vite": "^7.3.7",
    "vitest": "^4.1.12",
    "@nestjs/testing": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15"
  }
}
```

⚠️ Pas de `@nestjs/websockets`, `socket.io` ni `socket.io-client` : ce plan ne
contient aucune session, donc aucune passerelle. Ils arriveront au plan 2.

- [ ] **Step 3 : écrire le manifeste client**

`packages/module-quiz/src/client.ts` :

```ts
import type { ClientModuleManifest } from '@quetzal/core';

// Bundlé par le host (Next.js) : surface UI seulement, aucun import serveur ici.
export const clientManifest: ClientModuleManifest = {
  slug: 'quiz',
  name: { fr: 'Quiz', en: 'Quiz', es: 'Quiz' },
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/banks-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
  ],
  navItem: {
    icon: 'list-checks',
    labelKey: 'module.quiz.nav.title',
    visibleTo: ['owner', 'creator'],
    order: 30,
  },
};
```

⚠️ Pas de `guestJoinComponent` : aucun invité n'entre dans ce plan. Il arrivera
au plan 2.

- [ ] **Step 4 : écrire le module Nest, vide pour l'instant**

`packages/module-quiz/src/quiz.module.ts` :

```ts
import { Module } from '@nestjs/common';

@Module({ controllers: [], providers: [] })
export class QuizModule {}
```

- [ ] **Step 5 : écrire le manifeste serveur**

`packages/module-quiz/src/manifest.ts` :

```ts
import type { QuetzalModuleManifest } from '@quetzal/core';
import { QuizModule } from './quiz.module.js';
import { clientManifest } from './client.js';

export const manifest: QuetzalModuleManifest = {
  ...clientManifest,
  description: {
    fr: 'Quiz jouable en classe',
    en: 'Classroom quiz',
    es: 'Cuestionario para la clase',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: QuizModule,
  eventsPublished: [],
  permissions: {},
  prismaModels: 'prisma/models.prisma',
};
```

⚠️ Pas de `guestAccess` : aucun invité dans ce plan. ⚠️ Et
`maxConcurrentPerSession` est de toute façon un champ décoratif dans tout le
dépôt (issue #75), donc on ne s'appuiera pas dessus au plan 2.

`packages/module-quiz/src/index.ts` :

```ts
export { manifest } from './manifest.js';
export { QuizModule } from './quiz.module.js';
```

- [ ] **Step 6 : les trois catalogues, à parité**

`packages/module-quiz/src/i18n/fr.json` :

```json
{
  "module": {
    "quiz": {
      "nav": { "title": "Quiz" },
      "banks": { "title": "Banques de questions", "empty": "Aucune banque pour l instant" }
    }
  }
}
```

`en.json` :

```json
{
  "module": {
    "quiz": {
      "nav": { "title": "Quiz" },
      "banks": { "title": "Question banks", "empty": "No bank yet" }
    }
  }
}
```

`es.json` :

```json
{
  "module": {
    "quiz": {
      "nav": { "title": "Cuestionario" },
      "banks": { "title": "Bancos de preguntas", "empty": "Todavía no hay ningún banco" }
    }
  }
}
```

- [ ] **Step 7 : l'écran minimal, pour que la route existe**

`packages/module-quiz/src/presentation/ui/banks-page.tsx` :

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { Card } from '@quetzal/ui';

export default function BanksPage() {
  const t = useTranslations();
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">{t('module.quiz.banks.title')}</h1>
      <p>{t('module.quiz.banks.empty')}</p>
    </Card>
  );
}
```

⚠️ Aucune chaîne brute dans le JSX : `react/jsx-no-literals` la refuse, y compris
un pictogramme.

- [ ] **Step 8 : le test de contrat**

`packages/module-quiz/tests/manifest.spec.ts`, copier
`packages/module-loto/tests/manifest.spec.ts` et remplacer les trois occurrences
de `loto` par `quiz` dans les imports et le nom du `describe`. Ne rien changer
d'autre : c'est ce fichier qui vérifiera, au plan 2 comme ici, que chaque route de
contrôleur est déclarée dans `permissions`.

- [ ] **Step 9 : déclarer le module dans les deux applications**

Ajouter dans `apps/api/package.json` et `apps/host/package.json`, à la suite de
`"@quetzal/module-loto"` :

```json
    "@quetzal/module-quiz": "workspace:*"
```

puis :

```bash
pnpm install
```

- [ ] **Step 10 : vérifier que le module est bien vu, puis commit**

```bash
pnpm --filter @quetzal/module-quiz lint
pnpm --filter @quetzal/module-quiz typecheck
pnpm --filter @quetzal/module-quiz test
```

Expected: les trois verts, le test de contrat passant sur un manifeste à
`permissions` vide.

```bash
git add -A
git commit -m "feat(quiz): le squelette du module, enregistre et vide

Sous-projet 3, plan 1. Copie du squelette de module-hello : manifeste
serveur et client, module Nest vide, trois catalogues a parite, un ecran
minimal pour que la route existe, et le test de contrat.

Sans passerelle ni guestAccess : ce plan ne contient aucune session, donc
aucun invite. Ils arrivent au plan 2."
```

---

## Task 5 : la normalisation d'une saisie (règle pure, D2)

**Files:**
- Create: `packages/module-quiz/src/domain/normalisation.ts`
- Test: `packages/module-quiz/src/domain/normalisation.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/normalisation.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { normaliser, type ReglesDeSaisie } from './normalisation';

const TOUT_SENSIBLE: ReglesDeSaisie = { accentsSensibles: true, casseSensible: true };
const TOUT_TOLERANT: ReglesDeSaisie = { accentsSensibles: false, casseSensible: false };

/**
 * Décision D2 de la spec : le pardon est EXPLICITE, jamais statistique. Deux
 * drapeaux, et rien d'autre, aucune distance d'édition, parce qu'une distance
 * de un traite `esta`/`está` (faute d'accent, peut-être pardonnable) et
 * `casa`/`cosa` (deux mots différents) exactement pareil.
 */
describe('normaliser', () => {
  it('coupe les blancs autour, toujours', () => {
    expect(normaliser('  la casa  ', TOUT_SENSIBLE)).toBe('la casa');
  });

  it('reduit les blancs internes multiples a un seul', () => {
    expect(normaliser('la    casa', TOUT_SENSIBLE)).toBe('la casa');
  });

  it('garde les accents quand ils sont sensibles', () => {
    expect(normaliser('está', TOUT_SENSIBLE)).toBe('está');
  });

  it('retire les accents quand ils ne le sont pas', () => {
    expect(normaliser('está', { accentsSensibles: false, casseSensible: true })).toBe('esta');
  });

  it('garde la casse quand elle est sensible', () => {
    expect(normaliser('Casa', TOUT_SENSIBLE)).toBe('Casa');
  });

  it('abaisse la casse quand elle ne l est pas', () => {
    expect(normaliser('Casa', { accentsSensibles: true, casseSensible: false })).toBe('casa');
  });

  it('ne confond JAMAIS deux mots differents, quels que soient les drapeaux', () => {
    expect(normaliser('casa', TOUT_TOLERANT)).not.toBe(normaliser('cosa', TOUT_TOLERANT));
  });

  it('rend esta et está identiques quand les accents sont tolerés', () => {
    expect(normaliser('está', TOUT_TOLERANT)).toBe(normaliser('ESTA', TOUT_TOLERANT));
  });

  it('ne touche pas au tilde du n, qui est une lettre et non un accent', () => {
    // `ñ` est une lettre de l alphabet espagnol, pas un `n` accentué. La
    // confondre avec `n` ferait accepter `ano` pour `año`, ce qui n est pas une
    // tolérance mais une faute de sens.
    expect(normaliser('año', TOUT_TOLERANT)).toBe('año');
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/normalisation.spec.ts
```

Expected: FAIL avec `Cannot find module './normalisation'`.

- [ ] **Step 3 : écrire l'implémentation minimale**

`packages/module-quiz/src/domain/normalisation.ts` :

```ts
export interface ReglesDeSaisie {
  readonly accentsSensibles: boolean;
  readonly casseSensible: boolean;
}

/**
 * ⛔ `ñ` n'est PAS un `n` accentué : c'est une lettre de l'alphabet espagnol.
 * La décomposition Unicode la sépare pourtant en `n` + tilde combinant, donc on
 * décompose grapheme par grapheme et on laisse `ñ` intact. Sans ça, `ano`
 * serait accepté pour `año`, ce qui n'est pas une tolérance mais une faute de
 * sens.
 *
 * Pas de sentinelle : un caractère de remplacement invisible rend le fichier
 * illisible et peut apparaître dans la saisie d'un élève.
 */
const LETTRES_INTACTES = new Set(['ñ', 'Ñ']);

function sansAccents(valeur: string): string {
  return [...valeur]
    .map((lettre) =>
      LETTRES_INTACTES.has(lettre)
        ? lettre
        : lettre.normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC'))
    .join('');
}

export function normaliser(valeur: string, regles: ReglesDeSaisie): string {
  let resultat = valeur.trim().replace(/\s+/g, ' ');
  if (!regles.accentsSensibles) resultat = sansAccents(resultat);
  if (!regles.casseSensible) resultat = resultat.toLocaleLowerCase('es');
  return resultat;
}
```

- [ ] **Step 4 : lancer le test pour le voir passer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/normalisation.spec.ts
```

Expected: 9 tests verts.

- [ ] **Step 5 : prouver que la garde du `ñ` peut rougir**

```bash
cd packages/module-quiz
cp src/domain/normalisation.ts /tmp/n.bak
# MUTANT : plus aucune lettre n est mise a l abri des diacritiques
sed -i "s/const LETTRES_INTACTES = new Set(\[.ñ..Ñ.\]);/const LETTRES_INTACTES = new Set<string>([]);/" src/domain/normalisation.ts
grep -n "LETTRES_INTACTES = " src/domain/normalisation.ts
pnpm vitest run src/domain/normalisation.spec.ts
```

Expected: le `grep` montre le `Set` vidé, sans cette ligne, la mutation n'a
pas pris et le vert qui suivrait ne prouverait rien, puis **ROUGE** sur
« ne touche pas au tilde du n », car `año` est devenu `ano`. Restaurer :

```bash
cp /tmp/n.bak src/domain/normalisation.ts && pnpm vitest run src/domain/normalisation.spec.ts
```

Expected: 9 verts.

- [ ] **Step 6 : commit, en deux commits comme l'exige CLAUDE.md §5**

```bash
git add packages/module-quiz/src/domain/normalisation.spec.ts
git commit -m "test(quiz): exiger une normalisation de saisie explicite

Spec D2 : deux drapeaux, accents et casse, et RIEN d autre. Vu rouge
d abord : Cannot find module './normalisation'.

Un test porte la regle qui compte : `ñ` n est pas un `n` accentue mais
une lettre de l alphabet espagnol, et la decomposition Unicode la separe
pourtant. Sans garde, `ano` serait accepte pour `año`, une faute de
sens, pas une tolerance."
git add packages/module-quiz/src/domain/normalisation.ts
git commit -m "feat(quiz): normaliser une saisie selon deux drapeaux

Aucune distance d edition, et c est la decision D2 : une distance de un
traite `esta`/`está` et `casa`/`cosa` exactement pareil. Le pardon est
donc explicite, Elda ajoute la variante acceptee, jamais statistique.

Le `ñ` est laisse intact par un parcours grapheme par grapheme, et non
par une sentinelle : un caractere de remplacement invisible rend le
fichier illisible et peut apparaitre dans la saisie d un eleve. Verifie
par mutation : vider LETTRES_INTACTES fait rougir."
```

---

## Task 6 : la validation d'une réponse (règle pure, § 5.2)

**Files:**
- Create: `packages/module-quiz/src/domain/answer-mode.ts`
- Create: `packages/module-quiz/src/domain/answer-check.ts`
- Test: `packages/module-quiz/src/domain/answer-check.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/answer-check.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { estJuste, type QuestionJouable } from './answer-check';

const CHOIX: QuestionJouable = {
  answerMode: 'choix',
  options: [
    { id: 'o-1', isCorrect: false },
    { id: 'o-2', isCorrect: true },
    { id: 'o-3', isCorrect: false },
  ],
};

const SAISIE: QuestionJouable = {
  answerMode: 'saisie',
  acceptedAnswers: ['la casa', 'el hogar'],
  regles: { accentsSensibles: false, casseSensible: false },
};

/**
 * § 5.2 de la spec : la seule règle qui décide juste ou faux, et elle est pure.
 * Le serveur ne tient aucun compte de ce que le client affirme sur sa propre
 * justesse : D5 de la spec reprend « le serveur ne fait jamais confiance au
 * marquage du client » (D1 du loto). Ce fichier est donc le seul juge.
 */
describe('estJuste, mode choix', () => {
  it('accepte l identifiant de la proposition juste', () => {
    expect(estJuste(CHOIX, { optionId: 'o-2' })).toBe(true);
  });

  it('refuse l identifiant d une proposition fausse', () => {
    expect(estJuste(CHOIX, { optionId: 'o-1' })).toBe(false);
  });

  it('refuse un identifiant qui n appartient pas a la question', () => {
    expect(estJuste(CHOIX, { optionId: 'o-dune-autre-question' })).toBe(false);
  });

  it('refuse une saisie envoyee a une question a choix', () => {
    expect(estJuste(CHOIX, { texte: 'o-2' })).toBe(false);
  });
});

describe('estJuste, mode saisie', () => {
  it('accepte une reponse listee', () => {
    expect(estJuste(SAISIE, { texte: 'la casa' })).toBe(true);
  });

  it('accepte une seconde variante listee', () => {
    expect(estJuste(SAISIE, { texte: 'el hogar' })).toBe(true);
  });

  it('applique la normalisation aux DEUX cotes de la comparaison', () => {
    // La reponse acceptee est en minuscules sans accent ; la saisie arrive
    // autrement. Normaliser un seul cote laisserait passer l un et pas l autre.
    expect(estJuste(SAISIE, { texte: '  LA   CÁSA ' })).toBe(true);
  });

  it('refuse un mot different', () => {
    expect(estJuste(SAISIE, { texte: 'la cosa' })).toBe(false);
  });

  it('refuse une reponse vide', () => {
    expect(estJuste(SAISIE, { texte: '   ' })).toBe(false);
  });

  it('refuse un identifiant de proposition envoye a une question en saisie', () => {
    expect(estJuste(SAISIE, { optionId: 'o-2' })).toBe(false);
  });

  it('respecte les drapeaux : accents sensibles refusent la variante', () => {
    const stricte: QuestionJouable = {
      answerMode: 'saisie',
      acceptedAnswers: ['está'],
      regles: { accentsSensibles: true, casseSensible: true },
    };
    expect(estJuste(stricte, { texte: 'está' })).toBe(true);
    expect(estJuste(stricte, { texte: 'esta' })).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/answer-check.spec.ts
```

Expected: FAIL avec `Cannot find module './answer-check'`.

- [ ] **Step 3 : écrire l'union fermée du mode de réponse**

`packages/module-quiz/src/domain/answer-mode.ts` :

```ts
export const ANSWER_MODES = ['choix', 'saisie'] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export function isAnswerMode(valeur: string): valeur is AnswerMode {
  return (ANSWER_MODES as readonly string[]).includes(valeur);
}
```

- [ ] **Step 4 : écrire la règle**

`packages/module-quiz/src/domain/answer-check.ts` :

```ts
import { normaliser, type ReglesDeSaisie } from './normalisation.js';

export interface OptionJouable {
  readonly id: string;
  readonly isCorrect: boolean;
}

export type QuestionJouable =
  | { readonly answerMode: 'choix'; readonly options: readonly OptionJouable[] }
  | {
      readonly answerMode: 'saisie';
      readonly acceptedAnswers: readonly string[];
      readonly regles: ReglesDeSaisie;
    };

/** Ce que l'élève a envoyé. Les deux champs sont exclusifs, et le mode décide. */
export interface ReponseRecue {
  readonly optionId?: string;
  readonly texte?: string;
}

/**
 * La seule règle qui décide juste ou faux. Pure, sans accès à la base, sans
 * horloge, ce qui la rend testable en entier, et c'est l'intérêt.
 *
 * ⛔ Une réponse envoyée dans la forme de l'AUTRE mode est fausse, jamais une
 * erreur : un client malveillant qui enverrait `{ optionId }` à une question en
 * saisie ne doit obtenir ni un point ni une exception à exploiter.
 */
export function estJuste(question: QuestionJouable, recue: ReponseRecue): boolean {
  if (question.answerMode === 'choix') {
    if (recue.optionId === undefined) return false;
    return question.options.some((option) => option.id === recue.optionId && option.isCorrect);
  }

  if (recue.texte === undefined) return false;
  const propose = normaliser(recue.texte, question.regles);
  if (propose === '') return false;
  // Les DEUX côtés sont normalisés : normaliser seulement la saisie laisserait
  // passer `la casa` et refuser `La Casa` écrit dans les réponses acceptées.
  return question.acceptedAnswers.some(
    (acceptee) => normaliser(acceptee, question.regles) === propose);
}
```

- [ ] **Step 5 : lancer les tests pour les voir passer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/answer-check.spec.ts
```

Expected: 12 tests verts.

- [ ] **Step 6 : prouver les deux gardes qui comptent, par mutation**

```bash
cd packages/module-quiz
cp src/domain/answer-check.ts /tmp/a.bak

# M1 : un seul cote normalise
sed -i "s/(acceptee) => normaliser(acceptee, question.regles) === propose,/(acceptee) => acceptee === propose,/" src/domain/answer-check.ts
pnpm vitest run src/domain/answer-check.spec.ts
cp /tmp/a.bak src/domain/answer-check.ts

# M2 : la forme de l autre mode ne fait plus faux
sed -i "s/    if (recue.optionId === undefined) return false;/    if (recue.optionId === undefined) return true;/" src/domain/answer-check.ts
pnpm vitest run src/domain/answer-check.spec.ts
cp /tmp/a.bak src/domain/answer-check.ts
pnpm vitest run src/domain/answer-check.spec.ts
```

Expected: M1 rouge sur « applique la normalisation aux DEUX cotes », M2 rouge sur
« refuse une saisie envoyee a une question a choix », puis 12 verts restaurés.

- [ ] **Step 7 : commit, en deux**

```bash
git add packages/module-quiz/src/domain/answer-check.spec.ts
git commit -m "test(quiz): exiger une regle de validation pure et symetrique

Spec §5.2. Vu rouge d abord.

Deux tests portent des pieges qui ne se voient pas : la normalisation
doit s appliquer aux DEUX cotes de la comparaison, sinon une reponse
acceptee ecrite avec une majuscule ne matcherait jamais ; et une reponse
envoyee dans la forme de l AUTRE mode doit etre FAUSSE, jamais une
exception, un client malveillant ne doit obtenir ni point ni panne."
git add packages/module-quiz/src/domain/answer-mode.ts packages/module-quiz/src/domain/answer-check.ts
git commit -m "feat(quiz): decider si une reponse est juste, pour les deux modes

Pure : aucune base, aucune horloge, donc testable en entier.

C est le seul juge. D5 de la spec reprend le principe de D1 du loto,
« le serveur ne fait jamais confiance au marquage du client », donc la
justesse ne se lit jamais dans ce que le client affirme.

Verifie par mutation : normaliser un seul cote rougit, et rendre vrai la
forme de l autre mode rougit."
```

---

## Task 7 : les erreurs du domaine

**Files:**
- Create: `packages/module-quiz/src/domain/errors.ts`
- Test: `packages/module-quiz/src/domain/errors.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/errors.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core';
import {
  BankNotFoundError,
  QuestionNotFoundError,
  InvalidQuestionShapeError,
} from './errors';

/**
 * CLAUDE.md §14 interdit `throw new Error('…')` : chaque erreur de domaine est
 * une classe typée. Ce test existe pour qu'on ne puisse pas en ajouter une qui
 * oublie d'hériter, le filtre d'exception global de l'API mappe sur
 * `DomainError`, donc une erreur qui n'en hérite pas sortirait en 500.
 */
describe('erreurs du domaine quiz', () => {
  const toutes = [
    new BankNotFoundError('b-1'),
    new QuestionNotFoundError('q-1'),
    new InvalidQuestionShapeError('choix', 'une seule proposition'),
  ];

  it('heritent toutes de DomainError', () => {
    for (const erreur of toutes) expect(erreur).toBeInstanceOf(DomainError);
  });

  it('portent chacune son identifiant dans le message, pour etre diagnosticables', () => {
    expect(new BankNotFoundError('b-42').message).toContain('b-42');
    expect(new QuestionNotFoundError('q-42').message).toContain('q-42');
  });

  it('nomment la raison pour une forme invalide, pas seulement le mode', () => {
    const erreur = new InvalidQuestionShapeError('choix', 'une seule proposition');
    expect(erreur.message).toContain('choix');
    expect(erreur.message).toContain('une seule proposition');
  });

  it('portent chacune un nom de classe distinct, que la passerelle renvoie', () => {
    // La passerelle du loto renvoie `err.name` au client, et l écran le traduit.
    // Deux erreurs au même nom seraient indiscernables côté élève.
    const noms = toutes.map((e) => e.name);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/errors.spec.ts
```

Expected: FAIL avec `Cannot find module './errors'`.

- [ ] **Step 3 : écrire les erreurs**

`packages/module-quiz/src/domain/errors.ts` :

```ts
import { DomainError } from '@quetzal/core';
import type { AnswerMode } from './answer-mode.js';

export class BankNotFoundError extends DomainError {
  constructor(bankId: string) {
    super(`Banque de questions introuvable : ${bankId}`);
  }
}

export class QuestionNotFoundError extends DomainError {
  constructor(questionId: string) {
    super(`Question introuvable : ${questionId}`);
  }
}

/** La raison, pas seulement le mode : « choix » seul n'aide personne à corriger. */
export class InvalidQuestionShapeError extends DomainError {
  constructor(mode: AnswerMode, raison: string) {
    super(`Forme de question invalide en mode ${mode} : ${raison}`);
  }
}
```

- [ ] **Step 4 : lancer le test pour le voir passer**

```bash
cd packages/module-quiz && pnpm vitest run src/domain/errors.spec.ts
```

Expected: 4 tests verts.

⚠️ Si `DomainError.name` n'est pas renseigné par la classe de base, le quatrième
test rougit. Vérifier alors `packages/core/src/errors.ts` : si la base ne pose
pas `this.name = new.target.name`, ajouter dans chaque constructeur
`this.name = new.target.name;` plutôt que de modifier le noyau.

- [ ] **Step 5 : commit, en deux**

```bash
git add packages/module-quiz/src/domain/errors.spec.ts
git commit -m "test(quiz): exiger des erreurs de domaine typees et distinctes

CLAUDE.md §14 interdit throw new Error. Vu rouge d abord.

Un test garde une consequence invisible : le filtre global de l API mappe
sur DomainError, donc une erreur qui n en herite pas sortirait en 500. Un
autre garde l unicite des noms, parce que la passerelle renvoie err.name
au client et que deux noms identiques seraient indiscernables a l ecran."
git add packages/module-quiz/src/domain/errors.ts
git commit -m "feat(quiz): les erreurs du domaine quiz"
```

---

## Task 8 : le modèle de données de la banque

**Files:**
- Create: `packages/module-quiz/prisma/models.prisma`

- [ ] **Step 1 : écrire les quatre modèles**

`packages/module-quiz/prisma/models.prisma` :

```prisma
/// Banque de questions. Même forme que Loto_Deck, `isTemplate` compris : Elda
/// duplique un modèle livré ou part de zéro.
model Quiz_Deck {
  id         String
  tenantId   String
  name       String   @db.VarChar(120)
  isTemplate Boolean  @default(false)
  createdBy  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  questions Quiz_Question[]

  @@id([id, tenantId])
  @@index([tenantId])
}

/// Une question de la banque, ÉDITABLE. La version qui fait foi en séance est
/// la copie figée au lancement (spec D10), elle arrive au plan 2.
model Quiz_Question {
  id         String
  tenantId   String
  deckId     String
  rank       Int
  prompt     String   @db.VarChar(400)
  imageId    String?
  /// Texte alternatif de l’image, écrit par Elda. ⛔ Voir le commentaire de
  /// `Quiz_Option.imageAlt` : sur une question d’identification, il donne la
  /// réponse, et c’est une tension non résolue de la spec.
  imageAlt   String?  @db.VarChar(200)
  answerMode String   @db.VarChar(8)
  /// Délai en secondes, `null` = hériter du défaut de la session (spec D10).
  /// Sans effet en mode contrôle, qui n'a aucun minuteur (spec D6).
  timeLimit  Int?
  /// Mode `saisie` seulement, ignorés en `choix` (spec D2).
  accentsSensibles Boolean @default(true)
  casseSensible    Boolean @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  deck            Quiz_Deck            @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)
  options         Quiz_Option[]
  acceptedAnswers Quiz_AcceptedAnswer[]

  @@id([id, tenantId])
  @@unique([deckId, rank, tenantId])
  @@index([tenantId, deckId])
}

/// Proposition d'une question en mode `choix`. Porte un texte, une image, ou
/// les deux, c'est ce qui fait que « appariement mot ↔ image » n'est pas un
/// type de question mais une configuration (spec D1).
model Quiz_Option {
  id         String
  tenantId   String
  questionId String
  rank       Int
  label      String? @db.VarChar(160)
  imageId    String?
  /// ⛔ TENSION NON RÉSOLUE, à ne pas trancher en silence. Sur une question
  /// d’identification « mot ↔ image », un texte alternatif fidèle DONNE la
  /// réponse à un lecteur d’écran, et son absence rend la question
  /// impossible. La colonne existe pour qu’Elda puisse en écrire un, la
  /// décision de ce qu’on affiche à défaut appartient au produit.
  imageAlt   String? @db.VarChar(200)
  isCorrect  Boolean @default(false)

  question Quiz_Question @relation(fields: [questionId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([questionId, rank, tenantId])
  @@index([tenantId, questionId])
}

/// Une variante acceptée d'une question en mode `saisie`. Une ligne par
/// variante : le pardon est explicite (spec D2).
model Quiz_AcceptedAnswer {
  id         String
  tenantId   String
  questionId String
  value      String @db.VarChar(160)

  question Quiz_Question @relation(fields: [questionId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@index([tenantId, questionId])
}
```

- [ ] **Step 2 : fusionner le schéma et regarder le SQL que Prisma veut écrire**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Expected: quatre `CREATE TABLE` et leurs index, **et rien d'autre**. Si une
instruction touche une table existante, un modèle a été altéré par erreur :
corriger avant d'écrire la migration.

- [ ] **Step 3 : créer la migration**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/db exec prisma migrate dev --name add_module_quiz_bank --create-only
```

Puis **ajouter à la main**, à la fin du fichier créé sous
`packages/db/prisma/migrations/*_add_module_quiz_bank/migration.sql`, les deux
contraintes CHECK que Prisma ne sait pas exprimer :

```sql
-- CLAUDE.md §9 : pas d'enum Postgres (ALTER TYPE bloquant), mais String +
-- CHECK + Zod. La CHECK est le dernier rempart ; le schéma Zod de la route
-- refuse avant d'arriver ici.
ALTER TABLE "Quiz_Question" ADD CONSTRAINT "Quiz_Question_answerMode_check"
  CHECK ("answerMode" IN ('choix', 'saisie'));

-- Une proposition sans texte NI image n'a rien à afficher. Le domaine le
-- refuse déjà, et cette CHECK empêche qu'une écriture directe en base crée
-- une question injouable.
ALTER TABLE "Quiz_Option" ADD CONSTRAINT "Quiz_Option_label_ou_image_check"
  CHECK ("label" IS NOT NULL OR "imageId" IS NOT NULL);
```

- [ ] **Step 4 : appliquer et vérifier que les CHECK existent VRAIMENT en base**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/db prisma:migrate:deploy
pnpm --filter @quetzal/db prisma:generate
docker exec quetzal-postgres-1 psql -U test -d quetzal_test -c \
  "SELECT conname FROM pg_constraint WHERE conname LIKE 'Quiz_%check';"
```

Expected: les **deux** contraintes listées. ⛔ Les lire dans `pg_constraint` et
non dans le modèle Prisma : le modèle n'exprime pas les CHECK, donc il ne prouve
rien.

- [ ] **Step 5 : commit**

```bash
git add packages/module-quiz/prisma/models.prisma packages/db/prisma
git commit -m "feat(quiz): le modele de donnees de la banque de questions

Quatre tables, prefixe Quiz_ obligatoire (CLAUDE.md §7), tenantId
partout, cle composite, ids UUID v7 par newId().

Deux CHECK ecrites a la main, que Prisma ne sait pas exprimer : le mode
de reponse (String + CHECK + Zod, jamais un enum Postgres, §9), et
« une proposition a un texte OU une image », sans quoi une ecriture
directe en base creerait une question injouable.

Verifiees dans pg_constraint et non dans le modele Prisma, qui ne les
exprime pas et ne prouverait donc rien."
```

---

## Task 9 : le port de persistance et sa doublure

**Files:**
- Create: `packages/module-quiz/src/domain/ports/question-bank.repository.ts`
- Create: `packages/module-quiz/src/application/testing/fake-repositories.ts`

- [ ] **Step 1 : écrire le port**

`packages/module-quiz/src/domain/ports/question-bank.repository.ts` :

```ts
import type { AnswerMode } from '../answer-mode.js';
import type { ReglesDeSaisie } from '../normalisation.js';

export interface BankSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  questionCount: number;
}

export interface QuestionOption {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  answerMode: AnswerMode;
  timeLimit: number | null;
  regles: ReglesDeSaisie;
  options: readonly QuestionOption[];
  acceptedAnswers: readonly string[];
}

export interface Bank extends BankSummary {
  questions: readonly Question[];
}

export interface NewQuestion {
  rank: number;
  prompt: string;
  answerMode: AnswerMode;
}

export interface QuestionPatch {
  prompt?: string;
  imageId?: string | null;
  timeLimit?: number | null;
  regles?: ReglesDeSaisie;
  options?: readonly Omit<QuestionOption, 'id'>[];
  acceptedAnswers?: readonly string[];
}

export interface QuestionBankRepository {
  list(): Promise<BankSummary[]>;
  findById(bankId: string): Promise<Bank | null>;
  create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank>;
  rename(bankId: string, name: string): Promise<void>;
  delete(bankId: string): Promise<void>;
  addQuestion(bankId: string, question: NewQuestion): Promise<Question>;
  updateQuestion(questionId: string, patch: QuestionPatch): Promise<void>;
  deleteQuestion(questionId: string): Promise<void>;
}
```

- [ ] **Step 2 : écrire la doublure manuelle**

⚠️ `CLAUDE.md` §11 interdit `vi.mock` : les doublures sont des classes écrites à
la main.

`packages/module-quiz/src/application/testing/fake-repositories.ts` :

```ts
import type {
  Bank,
  BankSummary,
  NewQuestion,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../../domain/ports/question-bank.repository.js';

let compteur = 0;
const nextId = (prefixe: string): string => `${prefixe}-gen-${++compteur}`;

export function questionOf(rank: number, overrides: Partial<Question> = {}): Question {
  return {
    id: nextId('question'),
    rank,
    prompt: `Question ${rank}`,
    imageId: null,
    answerMode: 'choix',
    timeLimit: null,
    regles: { accentsSensibles: true, casseSensible: false },
    options: [
      { id: nextId('option'), rank: 1, label: 'Juste', imageId: null, isCorrect: true },
      { id: nextId('option'), rank: 2, label: 'Faux', imageId: null, isCorrect: false },
    ],
    acceptedAnswers: []...overrides,
  };
}

export function bankOf(questionCount: number, overrides: Partial<Bank> = {}): Bank {
  const questions = Array.from({ length: questionCount }, (_, i) => questionOf(i + 1));
  return {
    id: 'bank-1',
    name: 'Banque de test',
    isTemplate: false,
    questionCount: questions.length,
    questions...overrides,
  };
}

/**
 * Les propositions du patch n'ont pas d'identifiant, `QuestionPatch.options`
 * est un `Omit<QuestionOption, 'id'>[]`, parce que l'écran les remplace en bloc.
 * La doublure en frappe donc de nouveaux, comme l'adaptateur Prisma le fera.
 */
function applique(question: Question, patch: QuestionPatch): Question {
  return {
    ...question...patch,
    options:
      patch.options === undefined
        ? question.options
        : patch.options.map((option) => ({ ...option, id: nextId('option') })),
  };
}

export class FakeQuestionBankRepository implements QuestionBankRepository {
  readonly banks = new Map<string, Bank>();

  add(bank: Bank): void {
    this.banks.set(bank.id, bank);
  }

  async list(): Promise<BankSummary[]> {
    return [...this.banks.values()].map(({ id, name, isTemplate, questions }) => ({
      id,
      name,
      isTemplate,
      questionCount: questions.length,
    }));
  }

  async findById(bankId: string): Promise<Bank | null> {
    return this.banks.get(bankId) ?? null;
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank> {
    const bank: Bank = {
      id: nextId('bank'),
      name: input.name,
      isTemplate: input.isTemplate,
      questionCount: input.questions.length,
      questions: input.questions.map((q) => ({ ...q, id: nextId('question') })),
    };
    this.banks.set(bank.id, bank);
    return bank;
  }

  async rename(bankId: string, name: string): Promise<void> {
    const bank = this.banks.get(bankId);
    if (bank !== undefined) this.banks.set(bankId, { ...bank, name });
  }

  async delete(bankId: string): Promise<void> {
    this.banks.delete(bankId);
  }

  async addQuestion(bankId: string, question: NewQuestion): Promise<Question> {
    const bank = this.banks.get(bankId);
    if (bank === undefined) throw new Error(`banque absente de la doublure : ${bankId}`);
    const inseree = questionOf(question.rank, {
      prompt: question.prompt,
      answerMode: question.answerMode,
      options: [],
      acceptedAnswers: [],
    });
    const questions = [...bank.questions, inseree];
    this.banks.set(bankId, { ...bank, questions, questionCount: questions.length });
    return inseree;
  }

  async updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
    for (const [bankId, bank] of this.banks) {
      if (!bank.questions.some((q) => q.id === questionId)) continue;
      this.banks.set(bankId, {
        ...bank,
        questions: bank.questions.map((q) => (q.id === questionId ? applique(q, patch) : q)),
      });
      return;
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    for (const [bankId, bank] of this.banks) {
      if (!bank.questions.some((q) => q.id === questionId)) continue;
      const questions = bank.questions.filter((q) => q.id !== questionId);
      this.banks.set(bankId, { ...bank, questions, questionCount: questions.length });
      return;
    }
  }
}
```

- [ ] **Step 3 : vérifier que ça compile, puis commit**

```bash
pnpm --filter @quetzal/module-quiz typecheck
```

Expected: vert.

```bash
git add packages/module-quiz/src/domain/ports packages/module-quiz/src/application/testing
git commit -m "feat(quiz): le port de persistance de la banque et sa doublure

Un Port dans Domain, une doublure ecrite a la main dans Application :
CLAUDE.md §11 interdit vi.mock et son levage magique.

Le port n a pas encore d adaptateur Prisma : il arrive a la tache 11, et
c est volontaire, CLAUDE.md §5 exige que le PREMIER adaptateur d un Port
arrive en TDD, pas que le Port lui-meme ait un test (une interface sans
implementation n a aucun comportement a assertir)."
```

---

## Task 10 : le cas d'usage de la banque

**Files:**
- Create: `packages/module-quiz/src/application/manage-bank.use-case.ts`
- Test: `packages/module-quiz/src/application/manage-bank.use-case.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/application/manage-bank.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { BankNotFoundError, InvalidQuestionShapeError } from '../domain/errors.js';
import { ManageBankUseCase } from './manage-bank.use-case.js';
import { FakeQuestionBankRepository, bankOf, questionOf } from './testing/fake-repositories.js';

function build() {
  const banks = new FakeQuestionBankRepository();
  const useCase = new ManageBankUseCase(banks);
  return { banks, useCase };
}

describe('ManageBankUseCase', () => {
  it('liste les banques avec leur nombre de questions', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(3));

    const liste = await useCase.list();

    expect(liste).toHaveLength(1);
    expect(liste[0]?.questionCount).toBe(3);
  });

  it('duplique une banque avec toutes ses questions', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(4, { name: 'Vocabulaire maison', isTemplate: true }));

    const copie = await useCase.duplicate({ bankId: 'bank-1', name: 'Ma copie', createdBy: 'u-1' });

    expect(copie.id).not.toBe('bank-1');
    expect(copie.name).toBe('Ma copie');
    expect(copie.questions).toHaveLength(4);
    expect(copie.isTemplate, 'une copie de travail n est jamais un gabarit').toBe(false);
  });

  it('cree une banque vide', async () => {
    const { useCase } = build();

    const banque = await useCase.createBlank({ name: 'Nouvelle', createdBy: 'u-1' });

    expect(banque.questions).toHaveLength(0);
  });

  it('refuse une banque inconnue', async () => {
    const { useCase } = build();

    await expect(useCase.findOne({ bankId: 'fantome' })).rejects.toThrow(BankNotFoundError);
  });

  it('ajoute une question au rang suivant, et non au nombre de questions', async () => {
    // Les rangs peuvent avoir des trous apres une suppression, et
    // @@unique([deckId, rank, tenantId]) refuserait un doublon.
    const { banks, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1), questionOf(7)] }));

    const ajoutee = await useCase.addQuestion({ bankId: 'bank-1', prompt: 'Nouvelle ?', answerMode: 'choix' });

    expect(ajoutee.rank, 'le rang le plus haut plus un, jamais le compte').toBe(8);
  });

  /**
   * ⛔ LA GARDE QUI COMPTE. Une question en `choix` sans proposition juste est
   * injouable : en séance, aucune réponse ne pourrait être correcte, et
   * personne ne s'en apercevrait avant la classe.
   */
  it('refuse d enregistrer une question a choix sans proposition juste', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: {
          options: [
            { rank: 1, label: 'A', imageId: null, isCorrect: false },
            { rank: 2, label: 'B', imageId: null, isCorrect: false },
          ],
        },
      })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('refuse une question a choix avec une seule proposition', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: { options: [{ rank: 1, label: 'Seule', imageId: null, isCorrect: true }] },
      })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('refuse une question en saisie sans aucune reponse acceptee', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1, { answerMode: 'saisie', options: [] })] }));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({ questionId, patch: { acceptedAnswers: [] } })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('accepte une question a choix bien formee', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: {
          options: [
            { rank: 1, label: 'Juste', imageId: null, isCorrect: true },
            { rank: 2, label: 'Faux', imageId: null, isCorrect: false },
          ],
        },
      })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
cd packages/module-quiz && pnpm vitest run src/application/manage-bank.use-case.spec.ts
```

Expected: FAIL avec `Cannot find module './manage-bank.use-case.js'`.

- [ ] **Step 3 : écrire le cas d'usage**

`packages/module-quiz/src/application/manage-bank.use-case.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { BankNotFoundError, InvalidQuestionShapeError, QuestionNotFoundError } from '../domain/errors.js';
import type { AnswerMode } from '../domain/answer-mode.js';
import type {
  Bank,
  BankSummary,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../domain/ports/question-bank.repository.js';

@Injectable()
export class ManageBankUseCase {
  constructor(private readonly banks: QuestionBankRepository) {}

  async list(): Promise<BankSummary[]> {
    return this.banks.list();
  }

  async findOne(input: { bankId: string }): Promise<Bank> {
    return this.require(input.bankId);
  }

  async duplicate(input: { bankId: string; name: string; createdBy: string }): Promise<Bank> {
    const source = await this.require(input.bankId);
    // Une copie de travail n'est jamais un gabarit : c'est ce qui permet de
    // retrouver le gabarit par `isTemplate` plutôt que par son nom.
    return this.banks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      questions: source.questions,
    });
  }

  async createBlank(input: { name: string; createdBy: string }): Promise<Bank> {
    return this.banks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      questions: [],
    });
  }

  async rename(input: { bankId: string; name: string }): Promise<void> {
    await this.require(input.bankId);
    await this.banks.rename(input.bankId, input.name);
  }

  async delete(input: { bankId: string }): Promise<void> {
    await this.require(input.bankId);
    await this.banks.delete(input.bankId);
  }

  async addQuestion(input: {
    bankId: string;
    prompt: string;
    answerMode: AnswerMode;
  }): Promise<Question> {
    const bank = await this.require(input.bankId);
    // Le rang le plus haut plus un, et non le nombre de questions : les rangs
    // peuvent avoir des trous après une suppression, et
    // @@unique([deckId, rank, tenantId]) refuserait un doublon.
    const rank = bank.questions.reduce((haut, q) => Math.max(haut, q.rank), 0) + 1;
    return this.banks.addQuestion(input.bankId, {
      rank,
      prompt: input.prompt,
      answerMode: input.answerMode,
    });
  }

  async updateQuestion(input: { questionId: string; patch: QuestionPatch }): Promise<void> {
    const question = await this.requireQuestion(input.questionId);
    const apres = { ...question...input.patch };
    this.assertJouable(apres.answerMode, apres.options, apres.acceptedAnswers);
    await this.banks.updateQuestion(input.questionId, input.patch);
  }

  async deleteQuestion(input: { questionId: string }): Promise<void> {
    await this.requireQuestion(input.questionId);
    await this.banks.deleteQuestion(input.questionId);
  }

  /**
   * ⛔ La seule garde qui empêche une question injouable d'arriver en classe.
   * Une question en `choix` sans proposition juste ne pourrait être réussie par
   * personne, et rien ne le signalerait avant la séance.
   */
  private assertJouable(
    mode: AnswerMode,
    options: readonly { isCorrect: boolean }[],
    acceptedAnswers: readonly string[]): void {
    if (mode === 'choix') {
      if (options.length < 2) {
        throw new InvalidQuestionShapeError(mode, 'au moins deux propositions sont nécessaires');
      }
      const justes = options.filter((option) => option.isCorrect).length;
      if (justes !== 1) {
        throw new InvalidQuestionShapeError(mode, 'exactement une proposition juste est attendue');
      }
      return;
    }
    if (acceptedAnswers.length === 0) {
      throw new InvalidQuestionShapeError(mode, 'au moins une réponse acceptée est nécessaire');
    }
  }

  private async require(bankId: string): Promise<Bank> {
    const bank = await this.banks.findById(bankId);
    if (bank === null) throw new BankNotFoundError(bankId);
    return bank;
  }

  private async requireQuestion(questionId: string): Promise<Question> {
    for (const bank of await this.banks.list()) {
      const complete = await this.banks.findById(bank.id);
      const trouvee = complete?.questions.find((q) => q.id === questionId);
      if (trouvee !== undefined) return trouvee;
    }
    throw new QuestionNotFoundError(questionId);
  }
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
cd packages/module-quiz && pnpm vitest run src/application/manage-bank.use-case.spec.ts
```

Expected: 9 tests verts.

- [ ] **Step 5 : prouver la garde par mutation**

```bash
cd packages/module-quiz
cp src/application/manage-bank.use-case.ts /tmp/m.bak
sed -i "s/    this.assertJouable(apres.answerMode, apres.options, apres.acceptedAnswers);//" src/application/manage-bank.use-case.ts
pnpm vitest run src/application/manage-bank.use-case.spec.ts
cp /tmp/m.bak src/application/manage-bank.use-case.ts
pnpm vitest run src/application/manage-bank.use-case.spec.ts
```

Expected: **3 tests rouges** sans la garde (aucune proposition juste, une seule
proposition, saisie sans réponse acceptée), puis 9 verts restaurés.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/application/manage-bank.use-case.spec.ts
git commit -m "test(quiz): exiger qu une question injouable soit refusee

Vu rouge d abord. La garde qui compte : une question a choix sans
proposition juste ne pourrait etre reussie par PERSONNE, et rien ne le
signalerait avant la classe. Trois tests la gardent, zero juste,
plusieurs justes, et une seule proposition, plus le cas de la saisie
sans aucune reponse acceptee.

Un quatrieme test garde le rang d ajout : le plus haut plus un, jamais le
nombre de questions, parce que les rangs ont des trous apres une
suppression et que @@unique refuserait un doublon."
git add packages/module-quiz/src/application/manage-bank.use-case.ts
git commit -m "feat(quiz): orchestrer la banque de questions

Verifie par mutation : retirer assertJouable fait rougir trois tests."
```

---

## Task 11 : l'adaptateur Prisma, premier adaptateur du port

**Files:**
- Create: `packages/module-quiz/src/infrastructure/prisma-question-bank.repository.ts`
- Test: `packages/module-quiz/src/infrastructure/prisma-question-bank.repository.integration.spec.ts`

⚠️ `CLAUDE.md` §5 : le **premier adaptateur** d'un Port doit arriver en TDD, et
contre un vrai Postgres, pas contre une doublure (§11 : ne jamais mocker la base
ni Prisma).

- [ ] **Step 1 : écrire le test d'intégration qui échoue**

`packages/module-quiz/src/infrastructure/prisma-question-bank.repository.integration.spec.ts` :

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaQuestionBankRepository } from './prisma-question-bank.repository.js';
import type { Question } from '../domain/ports/question-bank.repository.js';

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const QUESTION_CHOIX: Question = {
  id: 'ignoré-a-la-creation',
  rank: 1,
  prompt: '¿Cómo se dice « chaise » ?',
  imageId: null,
  answerMode: 'choix',
  timeLimit: null,
  regles: { accentsSensibles: true, casseSensible: false },
  options: [
    { id: 'x', rank: 1, label: 'la silla', imageId: null, isCorrect: true },
    { id: 'y', rank: 2, label: 'la mesa', imageId: null, isCorrect: false },
  ],
  acceptedAnswers: [],
};

describe('PrismaQuestionBankRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('cree une banque et la relit avec ses questions et propositions', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Vocabulaire', isTemplate: false, createdBy: ownerId, questions: [QUESTION_CHOIX] }));

    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));
    expect(relue?.questions).toHaveLength(1);
    expect(relue?.questions[0]?.options).toHaveLength(2);
    expect(relue?.questions[0]?.options.find((o) => o.isCorrect)?.label).toBe('la silla');
  });

  it('rend les propositions dans l ordre de leur rang, pas dans celui de la base', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const desordre: Question = {
      ...QUESTION_CHOIX,
      options: [
        { id: 'a', rank: 3, label: 'troisieme', imageId: null, isCorrect: false },
        { id: 'b', rank: 1, label: 'premiere', imageId: null, isCorrect: true },
        { id: 'c', rank: 2, label: 'deuxieme', imageId: null, isCorrect: false },
      ],
    };

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Ordre', isTemplate: false, createdBy: ownerId, questions: [desordre] }));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));

    expect(relue?.questions[0]?.options.map((o) => o.label)).toEqual([
      'premiere',
      'deuxieme',
      'troisieme',
    ]);
  });

  it('enregistre les reponses acceptees d une question en saisie', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const saisie: Question = {
      ...QUESTION_CHOIX,
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: ['la casa', 'el hogar'],
    };

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Saisie', isTemplate: false, createdBy: ownerId, questions: [saisie] }));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));

    expect([...(relue?.questions[0]?.acceptedAnswers ?? [])].sort()).toEqual(['el hogar', 'la casa']);
  });

  it('supprimer une banque emporte ses questions et leurs propositions', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'À supprimer', isTemplate: false, createdBy: ownerId, questions: [QUESTION_CHOIX] }));

    await inTenant(tenantId, ownerId, () => repo.delete(creee.id));

    expect(await inTenant(tenantId, ownerId, () => repo.findById(creee.id))).toBeNull();
  });

  it('cloisonne les banques entre locataires', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const sienne = await inTenant(voisin.tenantId, voisin.ownerId, () =>
      repo.create({ name: 'Chez le voisin', isTemplate: false, createdBy: voisin.ownerId, questions: [] }));

    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findById(sienne.id)),
      'une banque d un autre locataire doit etre introuvable').toBeNull();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz test:integration
```

Expected: FAIL avec `Cannot find module './prisma-question-bank.repository.js'`.

- [ ] **Step 3 : écrire l'adaptateur**

`packages/module-quiz/src/infrastructure/prisma-question-bank.repository.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isAnswerMode } from '../domain/answer-mode.js';
import { BankNotFoundError, InvalidQuestionShapeError } from '../domain/errors.js';
import type {
  Bank,
  BankSummary,
  NewQuestion,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../domain/ports/question-bank.repository.js';

interface LigneOption {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  isCorrect: boolean;
}

interface LigneQuestion {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  answerMode: string;
  timeLimit: number | null;
  accentsSensibles: boolean;
  casseSensible: boolean;
  options: LigneOption[];
  acceptedAnswers: { value: string }[];
}

interface LigneBanque {
  id: string;
  name: string;
  isTemplate: boolean;
  questions: LigneQuestion[];
}

/**
 * `findFirst` et les variantes *Many, jamais `findUnique` ni `update` : les
 * tables ont une clé composite `@@id([id, tenantId])` et l'extension de
 * cloisonnement fusionne `tenantId` à plat dans les variantes *Many. Même
 * raison que dans `prisma-deck.repository.ts` du loto.
 */
@Injectable()
export class PrismaQuestionBankRepository implements QuestionBankRepository {
  private get prisma() {
    return getTenantScopedPrisma() as unknown as {
      quiz_Deck: {
        findMany(args?: unknown): Promise<LigneBanque[]>;
        findFirst(args: unknown): Promise<LigneBanque | null>;
        create(args: unknown): Promise<{ id: string }>;
        updateMany(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<unknown>;
      };
      quiz_Question: {
        findFirst(args: unknown): Promise<LigneQuestion | null>;
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<unknown>;
      };
      quiz_Option: { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
      quiz_AcceptedAnswer: { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
    };
  }

  private toQuestion(ligne: LigneQuestion): Question {
    if (!isAnswerMode(ligne.answerMode)) {
      // Une ligne désynchronisée, comme un statut inconnu chez le loto : on ne
      // rend pas une question dont on ne sait pas la juger.
      throw new InvalidQuestionShapeError('choix', `mode inconnu en base : ${ligne.answerMode}`);
    }
    return {
      id: ligne.id,
      rank: ligne.rank,
      prompt: ligne.prompt,
      imageId: ligne.imageId,
      answerMode: ligne.answerMode,
      timeLimit: ligne.timeLimit,
      regles: {
        accentsSensibles: ligne.accentsSensibles,
        casseSensible: ligne.casseSensible,
      },
      // Trié par rang ici, et non laissé à l'ordre de la base : un `ORDER BY`
      // absent rend un ordre non garanti, et l'écran afficherait les
      // propositions dans le désordre une fois sur deux.
      options: [...ligne.options].sort((a, b) => a.rank - b.rank),
      acceptedAnswers: ligne.acceptedAnswers.map((a) => a.value),
    };
  }

  private get inclusion() {
    return {
      questions: {
        orderBy: { rank: 'asc' as const },
        include: { options: true, acceptedAnswers: true },
      },
    };
  }

  async list(): Promise<BankSummary[]> {
    const lignes = await this.prisma.quiz_Deck.findMany({
      orderBy: { name: 'asc' },
      include: this.inclusion,
    });
    return lignes.map((ligne) => ({
      id: ligne.id,
      name: ligne.name,
      isTemplate: ligne.isTemplate,
      questionCount: ligne.questions.length,
    }));
  }

  async findById(bankId: string): Promise<Bank | null> {
    const ligne = await this.prisma.quiz_Deck.findFirst({
      where: { id: bankId },
      include: this.inclusion,
    });
    if (ligne === null) return null;
    return {
      id: ligne.id,
      name: ligne.name,
      isTemplate: ligne.isTemplate,
      questionCount: ligne.questions.length,
      questions: ligne.questions.map((q) => this.toQuestion(q)),
    };
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank> {
    const bankId = newId();
    await this.prisma.quiz_Deck.create({
      data: { id: bankId, name: input.name, isTemplate: input.isTemplate, createdBy: input.createdBy },
    });

    for (const question of input.questions) {
      const questionId = newId();
      await this.prisma.quiz_Question.createMany({
        data: [
          {
            id: questionId,
            deckId: bankId,
            rank: question.rank,
            prompt: question.prompt,
            imageId: question.imageId,
            answerMode: question.answerMode,
            timeLimit: question.timeLimit,
            accentsSensibles: question.regles.accentsSensibles,
            casseSensible: question.regles.casseSensible,
          },
        ],
      });
      if (question.options.length > 0) {
        await this.prisma.quiz_Option.createMany({
          data: question.options.map((option) => ({
            id: newId(),
            questionId,
            rank: option.rank,
            label: option.label,
            imageId: option.imageId,
            isCorrect: option.isCorrect,
          })),
        });
      }
      if (question.acceptedAnswers.length > 0) {
        await this.prisma.quiz_AcceptedAnswer.createMany({
          data: question.acceptedAnswers.map((value) => ({ id: newId(), questionId, value })),
        });
      }
    }

    const relue = await this.findById(bankId);
    // Jamais `as Bank` sur un `null` : CLAUDE.md §14 interdit le cast sans
    // typeguard. Et une banque introuvable juste après sa création signale un
    // cloisonnement mal posé, ce qu'un cast masquerait au lieu de le dire.
    if (relue === null) throw new BankNotFoundError(bankId);
    return relue;
  }

  async rename(bankId: string, name: string): Promise<void> {
    await this.prisma.quiz_Deck.updateMany({ where: { id: bankId }, data: { name } });
  }

  async delete(bankId: string): Promise<void> {
    await this.prisma.quiz_Deck.deleteMany({ where: { id: bankId } });
  }

  async addQuestion(bankId: string, question: NewQuestion): Promise<Question> {
    const id = newId();
    await this.prisma.quiz_Question.createMany({
      data: [{ id, deckId: bankId, rank: question.rank, prompt: question.prompt, answerMode: question.answerMode }],
    });
    return {
      id,
      rank: question.rank,
      prompt: question.prompt,
      imageId: null,
      answerMode: question.answerMode,
      timeLimit: null,
      regles: { accentsSensibles: true, casseSensible: false },
      options: [],
      acceptedAnswers: [],
    };
  }

  async updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
    const champs: Record<string, unknown> = {};
    if (patch.prompt !== undefined) champs['prompt'] = patch.prompt;
    if (patch.imageId !== undefined) champs['imageId'] = patch.imageId;
    if (patch.timeLimit !== undefined) champs['timeLimit'] = patch.timeLimit;
    if (patch.regles !== undefined) {
      champs['accentsSensibles'] = patch.regles.accentsSensibles;
      champs['casseSensible'] = patch.regles.casseSensible;
    }
    if (Object.keys(champs).length > 0) {
      await this.prisma.quiz_Question.updateMany({ where: { id: questionId }, data: champs });
    }

    // Remplacement en bloc, et non fusion : une proposition retirée à l'écran
    // doit disparaître, et un rang réordonné ne doit pas laisser de doublon
    // derrière lui.
    if (patch.options !== undefined) {
      await this.prisma.quiz_Option.deleteMany({ where: { questionId } });
      if (patch.options.length > 0) {
        await this.prisma.quiz_Option.createMany({
          data: patch.options.map((option) => ({
            id: newId(),
            questionId,
            rank: option.rank,
            label: option.label,
            imageId: option.imageId,
            isCorrect: option.isCorrect,
          })),
        });
      }
    }
    if (patch.acceptedAnswers !== undefined) {
      await this.prisma.quiz_AcceptedAnswer.deleteMany({ where: { questionId } });
      if (patch.acceptedAnswers.length > 0) {
        await this.prisma.quiz_AcceptedAnswer.createMany({
          data: patch.acceptedAnswers.map((value) => ({ id: newId(), questionId, value })),
        });
      }
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    await this.prisma.quiz_Question.deleteMany({ where: { id: questionId } });
  }
}
```

⚠️ Aucun `tenantId` n'est écrit à la main : l'extension de cloisonnement le
fusionne dans chaque requête. En ajouter un ici le ferait passer deux fois, et
masquerait une fuite si l'extension venait à ne plus être montée.

- [ ] **Step 4 : lancer les tests d'intégration pour les voir passer**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz test:integration
```

Expected: 5 tests verts.

- [ ] **Step 5 : prouver le tri par rang, par mutation**

```bash
cd packages/module-quiz
cp src/infrastructure/prisma-question-bank.repository.ts /tmp/r.bak
sed -i "s/      options: \[...ligne.options\].sort((a, b) => a.rank - b.rank),/      options: ligne.options,/" src/infrastructure/prisma-question-bank.repository.ts
cd ../.. && export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test" && pnpm --filter @quetzal/module-quiz test:integration
cp /tmp/r.bak packages/module-quiz/src/infrastructure/prisma-question-bank.repository.ts
pnpm --filter @quetzal/module-quiz test:integration
```

Expected: rouge sur « rend les propositions dans l ordre de leur rang », puis 5
verts restaurés. ⚠️ Si la mutation reste verte, c'est que la base a rendu les
lignes dans le bon ordre **par hasard** : le test est alors trop faible, et il
faut insérer les propositions dans un ordre inverse de leur rang pour le durcir.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/infrastructure/prisma-question-bank.repository.integration.spec.ts
git commit -m "test(quiz): exiger l adaptateur Prisma de la banque, contre un vrai Postgres

CLAUDE.md §5 : le PREMIER adaptateur d un Port arrive en TDD. §11 :
jamais de mock de la base ni de Prisma, testcontainers et un vrai
Postgres.

Cinq tests, dont deux qui gardent des pieges : l ordre des propositions
doit venir de leur RANG et non de la base, qui ne garantit rien sans
ORDER BY ; et une banque d un autre locataire doit etre introuvable."
git add packages/module-quiz/src/infrastructure/prisma-question-bank.repository.ts
git commit -m "feat(quiz): l adaptateur Prisma de la banque de questions

findFirst et les variantes *Many, jamais findUnique ni update : cle
composite @@id([id, tenantId]) et extension de cloisonnement qui fusionne
tenantId a plat dans les *Many, meme raison que chez le loto.

Les propositions et les reponses acceptees sont remplacees EN BLOC a la
mise a jour, et non fusionnees : une proposition retiree a l ecran doit
disparaitre, et un rang reordonne ne doit pas laisser de doublon.

Verifie par mutation : retirer le tri par rang fait rougir."
```

---

## Task 12 : les routes HTTP et le câblage Nest

**Files:**
- Create: `packages/module-quiz/src/presentation/dto/quiz.dto.ts`
- Create: `packages/module-quiz/src/presentation/bank.controller.ts`
- Modify: `packages/module-quiz/src/quiz.module.ts`
- Modify: `packages/module-quiz/src/manifest.ts`

- [ ] **Step 1 : écrire les schémas Zod de frontière**

`packages/module-quiz/src/presentation/dto/quiz.dto.ts` :

```ts
import { z } from 'zod';
import { ANSWER_MODES } from '../../domain/answer-mode.js';

/** `duplicateOf` absent = banque vierge ; présent = copie de travail. */
export const createBankSchema = z.object({
  name: z.string().trim().min(1).max(120),
  duplicateOf: z.string().min(1).optional(),
});

export const renameBankSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const addQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(400),
  answerMode: z.enum(ANSWER_MODES),
});

const optionSchema = z
  .object({
    rank: z.number().int().min(1).max(4),
    label: z.string().trim().max(160).nullable(),
    imageId: z.string().min(1).nullable(),
    isCorrect: z.boolean(),
  })
  // La même règle que la CHECK en base : une proposition sans texte ni image
  // n'a rien à afficher. Refusée ici, elle n'atteint jamais la base.
  .refine((option) => option.label !== null || option.imageId !== null, {
    message: 'une proposition porte un texte, une image, ou les deux',
  });

export const patchQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(400).optional(),
  imageId: z.string().min(1).nullable().optional(),
  // Bornes de la spec §3.3. `null` = hériter du défaut de session.
  timeLimit: z.number().int().min(3).max(120).nullable().optional(),
  accentsSensibles: z.boolean().optional(),
  casseSensible: z.boolean().optional(),
  options: z.array(optionSchema).min(2).max(4).optional(),
  acceptedAnswers: z.array(z.string().trim().min(1).max(160)).min(1).optional(),
});

export type CreateBankBody = z.infer<typeof createBankSchema>;
export type RenameBankBody = z.infer<typeof renameBankSchema>;
export type AddQuestionBody = z.infer<typeof addQuestionSchema>;
export type PatchQuestionBody = z.infer<typeof patchQuestionSchema>;
```

- [ ] **Step 2 : écrire le contrôleur**

`packages/module-quiz/src/presentation/bank.controller.ts` :

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import {
  addQuestionSchema,
  createBankSchema,
  patchQuestionSchema,
  renameBankSchema,
} from './dto/quiz.dto.js';

@Controller('api/modules/quiz/banks')
export class BankController {
  // Jeton explicite : sans lui, la métadonnée de type que Nest utiliserait pour
  // deviner ce use-case n'existe pas sous le transform esbuild de Vitest, et la
  // dépendance resterait à undefined. Même raison que chez le loto.
  constructor(@Inject(ManageBankUseCase) private readonly banks: ManageBankUseCase) {}

  @Get()
  async list() {
    return { banks: await this.banks.list() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.banks.findOne({ bankId: id });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createBankSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    if (parsed.data.duplicateOf !== undefined) {
      return this.banks.duplicate({
        bankId: parsed.data.duplicateOf,
        name: parsed.data.name,
        createdBy: userId,
      });
    }
    return this.banks.createBlank({ name: parsed.data.name, createdBy: userId });
  }

  @Patch(':id')
  async rename(@Param('id') id: string, @Body() body: unknown) {
    const parsed = renameBankSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.banks.rename({ bankId: id, name: parsed.data.name });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.banks.delete({ bankId: id });
    return { ok: true };
  }

  @Post(':id/questions')
  async addQuestion(@Param('id') id: string, @Body() body: unknown) {
    const parsed = addQuestionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.banks.addQuestion({
      bankId: id,
      prompt: parsed.data.prompt,
      answerMode: parsed.data.answerMode,
    });
  }

  @Patch(':id/questions/:questionId')
  async patchQuestion(
    @Param('id') _id: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown) {
    const parsed = patchQuestionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const { accentsSensibles, casseSensible...reste } = parsed.data;
    const patch =
      accentsSensibles === undefined && casseSensible === undefined
        ? reste
        : { ...reste, regles: { accentsSensibles: accentsSensibles ?? true, casseSensible: casseSensible ?? false } };

    await this.banks.updateQuestion({ questionId, patch });
    return { ok: true };
  }

  @Delete(':id/questions/:questionId')
  async removeQuestion(@Param('id') _id: string, @Param('questionId') questionId: string) {
    await this.banks.deleteQuestion({ questionId });
    return { ok: true };
  }
}
```

- [ ] **Step 3 : câbler le module Nest**

`packages/module-quiz/src/quiz.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { BankController } from './presentation/bank.controller.js';

const BANKS = 'QuizQuestionBankRepository';

@Module({
  controllers: [BankController],
  providers: [
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
  ],
})
export class QuizModule {}
```

- [ ] **Step 4 : déclarer les sept routes dans le manifeste**

Dans `packages/module-quiz/src/manifest.ts`, remplacer `permissions: {}` par :

```ts
  permissions: {
    'http:GET /api/modules/quiz/banks': ['owner', 'creator'],
    'http:GET /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:POST /api/modules/quiz/banks': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:POST /api/modules/quiz/banks/:id/questions': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/banks/:id/questions/:questionId': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/banks/:id/questions/:questionId': ['owner', 'creator'],
  },
```

⚠️ Composer la banque est un geste d'enseignante : aucun rôle `learner` ni
`guest`. Et le test de contrat de la tâche 4 **échouera** si une route manque,
c'est exactement son office.

- [ ] **Step 5 : vérifier que le contrat est tenu, et le prouver par mutation**

```bash
pnpm --filter @quetzal/module-quiz test
```

Expected: vert, test de contrat compris.

```bash
cd packages/module-quiz
cp src/manifest.ts /tmp/man.bak
sed -i "/http:DELETE \/api\/modules\/quiz\/banks\/:id'/d" src/manifest.ts
pnpm vitest run tests/manifest.spec.ts
cp /tmp/man.bak src/manifest.ts
pnpm vitest run tests/manifest.spec.ts
```

Expected: rouge sur « every controller route is declared in permissions », puis
vert restauré.

- [ ] **Step 6 : commit**

```bash
git add packages/module-quiz/src/presentation packages/module-quiz/src/quiz.module.ts packages/module-quiz/src/manifest.ts
git commit -m "feat(quiz): les routes de la banque, et leur declaration au manifeste

Huit routes, toutes reservees a owner/creator : composer une banque est
un geste d enseignante, jamais d eleve.

Le schema Zod porte la meme regle que la CHECK en base, une proposition
a un texte OU une image, pour qu une requete mal formee soit refusee a
la frontiere plutot qu au dernier rempart.

Verifie par mutation : retirer une route du manifeste fait rougir le test
de contrat du module."
```

---

## Task 13 : les deux écrans d'autorat

**Files:**
- Modify: `packages/module-quiz/src/presentation/ui/banks-page.tsx`
- Create: `packages/module-quiz/src/presentation/ui/bank-editor.tsx`
- Modify: `packages/module-quiz/src/client.ts`
- Modify: `packages/module-quiz/src/i18n/{fr,en,es}.json`

- [ ] **Step 1 : ajouter les clés de traduction, à parité**

Dans `packages/module-quiz/src/i18n/fr.json`, remplacer le bloc `banks` par :

```json
      "banks": {
        "title": "Banques de questions",
        "empty": "Aucune banque pour l instant",
        "newName": "Nom de la nouvelle banque",
        "create": "Créer",
        "questionCount": "{count} question(s)",
        "open": "Ouvrir la banque {name}"
      },
      "editor": {
        "bankName": "Nom de la banque",
        "addQuestion": "Ajouter une question",
        "prompt": "Énoncé de la question {rank}",
        "answerMode": "Type de réponse de la question {rank}",
        "modeChoix": "Choix",
        "modeSaisie": "Saisie",
        "optionLabel": "Proposition {rank} de la question {question}",
        "optionCorrect": "La proposition {rank} est la bonne réponse",
        "acceptedAnswers": "Réponses acceptées de la question {rank}, séparées par des virgules",
        "accentsSensibles": "Les accents comptent",
        "casseSensible": "Les majuscules comptent",
        "timeLimit": "Délai en secondes de la question {rank}",
        "save": "Enregistrer",
        "deleteQuestion": "Supprimer la question {rank}"
      }
```

Faire de même dans `en.json` :

```json
      "banks": {
        "title": "Question banks",
        "empty": "No bank yet",
        "newName": "New bank name",
        "create": "Create",
        "questionCount": "{count} question(s)",
        "open": "Open bank {name}"
      },
      "editor": {
        "bankName": "Bank name",
        "addQuestion": "Add a question",
        "prompt": "Prompt of question {rank}",
        "answerMode": "Answer type of question {rank}",
        "modeChoix": "Choice",
        "modeSaisie": "Typed",
        "optionLabel": "Option {rank} of question {question}",
        "optionCorrect": "Option {rank} is the correct answer",
        "acceptedAnswers": "Accepted answers of question {rank}, comma separated",
        "accentsSensibles": "Accents matter",
        "casseSensible": "Capitals matter",
        "timeLimit": "Time limit in seconds of question {rank}",
        "save": "Save",
        "deleteQuestion": "Delete question {rank}"
      }
```

et dans `es.json` :

```json
      "banks": {
        "title": "Bancos de preguntas",
        "empty": "Todavía no hay ningún banco",
        "newName": "Nombre del nuevo banco",
        "create": "Crear",
        "questionCount": "{count} pregunta(s)",
        "open": "Abrir el banco {name}"
      },
      "editor": {
        "bankName": "Nombre del banco",
        "addQuestion": "Añadir una pregunta",
        "prompt": "Enunciado de la pregunta {rank}",
        "answerMode": "Tipo de respuesta de la pregunta {rank}",
        "modeChoix": "Opción",
        "modeSaisie": "Escrita",
        "optionLabel": "Opción {rank} de la pregunta {question}",
        "optionCorrect": "La opción {rank} es la respuesta correcta",
        "acceptedAnswers": "Respuestas aceptadas de la pregunta {rank}, separadas por comas",
        "accentsSensibles": "Los acentos cuentan",
        "casseSensible": "Las mayúsculas cuentan",
        "timeLimit": "Tiempo límite en segundos de la pregunta {rank}",
        "save": "Guardar",
        "deleteQuestion": "Eliminar la pregunta {rank}"
      }
```

⚠️ Chaque libellé de champ porte le **rang de sa question**. « Énoncé » répété
vingt fois ne dit pas à un lecteur d'écran de quelle question il s'agit, c'est
la leçon que le loto a tirée pour ses cartes, et son test e2e la garde par
`getByLabel(…, { exact: true })`.

- [ ] **Step 2 : écrire la liste des banques**

`packages/module-quiz/src/presentation/ui/banks-page.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface BankSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  questionCount: number;
}

export default function BanksPage() {
  const t = useTranslations();
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [nom, setNom] = useState('');

  async function recharger(): Promise<void> {
    const res = await apiClient().apiFetch('/api/modules/quiz/banks');
    const corps = (await res.json()) as { banks: BankSummary[] };
    setBanks(corps.banks);
  }

  useEffect(() => {
    void recharger();
  }, []);

  async function creer(): Promise<void> {
    if (nom.trim() === '') return;
    await apiClient().apiFetch('/api/modules/quiz/banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom }),
    });
    setNom('');
    await recharger();
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{t('module.quiz.banks.title')}</h1>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="quiz-new-bank">{t('module.quiz.banks.newName')}</Label>
          <Input
            id="quiz-new-bank"
            value={nom}
            maxLength={120}
            onChange={(event) => setNom(event.target.value)}
          />
        </div>
        <Button onClick={() => void creer()}>{t('module.quiz.banks.create')}</Button>
      </div>

      {banks !== null && banks.length === 0 && <p>{t('module.quiz.banks.empty')}</p>}

      <ul className="flex flex-col gap-2" data-testid="quiz-banks">
        {(banks ?? []).map((bank) => (
          <li key={bank.id} className="flex items-center justify-between rounded border px-4 py-2">
            <span>{bank.name}</span>
            <span>{t('module.quiz.banks.questionCount', { count: bank.questionCount })}</span>
            <a href={`/modules/quiz/${bank.id}`} aria-label={t('module.quiz.banks.open', { name: bank.name })}>
              {t('module.quiz.banks.open', { name: bank.name })}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3 : écrire l'éditeur**

`packages/module-quiz/src/presentation/ui/bank-editor.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface Option {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  isCorrect: boolean;
}

interface Question {
  id: string;
  rank: number;
  prompt: string;
  answerMode: 'choix' | 'saisie';
  timeLimit: number | null;
  regles: { accentsSensibles: boolean; casseSensible: boolean };
  options: Option[];
  acceptedAnswers: string[];
}

interface Bank {
  id: string;
  name: string;
  questions: Question[];
}

export default function BankEditor({ bankId }: { bankId: string }) {
  const t = useTranslations();
  const [bank, setBank] = useState<Bank | null>(null);

  async function recharger(): Promise<void> {
    const res = await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}`);
    setBank((await res.json()) as Bank);
  }

  useEffect(() => {
    void recharger();
  }, [bankId]);

  async function ajouter(): Promise<void> {
    await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Un énoncé non vide est exigé par `addQuestionSchema` (min(1)). Trois
      // points sont la valeur de travail d'une question qu'Elda écrit juste
      // après : ce n'est pas un marqueur à remplacer dans ce plan.
      body: JSON.stringify({ prompt: '...', answerMode: 'choix' }),
    });
    await recharger();
  }

  async function enregistrer(question: Question): Promise<void> {
    const corps =
      question.answerMode === 'choix'
        ? {
            prompt: question.prompt,
            timeLimit: question.timeLimit,
            options: question.options.map((o) => ({
              rank: o.rank,
              label: o.label,
              imageId: o.imageId,
              isCorrect: o.isCorrect,
            })),
          }
        : {
            prompt: question.prompt,
            timeLimit: question.timeLimit,
            accentsSensibles: question.regles.accentsSensibles,
            casseSensible: question.regles.casseSensible,
            acceptedAnswers: question.acceptedAnswers,
          };

    await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}/questions/${question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    await recharger();
  }

  function modifier(questionId: string, patch: Partial<Question>): void {
    setBank((courant) =>
      courant === null
        ? courant
        : {
            ...courant,
            questions: courant.questions.map((q) => (q.id === questionId ? { ...q...patch } : q)),
          });
  }

  if (bank === null) return <p>{t('module.quiz.banks.empty')}</p>;

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Label htmlFor="quiz-bank-name">{t('module.quiz.editor.bankName')}</Label>
        <Input id="quiz-bank-name" value={bank.name} readOnly />
      </div>

      <Button onClick={() => void ajouter()}>{t('module.quiz.editor.addQuestion')}</Button>

      <ul className="flex flex-col gap-6" data-testid="quiz-questions">
        {bank.questions.map((question) => (
          <li key={question.id} className="flex flex-col gap-2 rounded border p-4">
            <Label htmlFor={`quiz-prompt-${question.id}`}>
              {t('module.quiz.editor.prompt', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-prompt-${question.id}`}
              value={question.prompt}
              maxLength={400}
              onChange={(event) => modifier(question.id, { prompt: event.target.value })}
            />

            <Label htmlFor={`quiz-time-${question.id}`}>
              {t('module.quiz.editor.timeLimit', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-time-${question.id}`}
              type="number"
              min={3}
              max={120}
              value={question.timeLimit ?? ''}
              onChange={(event) =>
                modifier(question.id, {
                  timeLimit: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />

            {question.answerMode === 'choix' ? (
              <ul className="flex flex-col gap-2">
                {question.options.map((option) => (
                  <li key={option.id} className="flex items-center gap-2">
                    <Label htmlFor={`quiz-option-${option.id}`}>
                      {t('module.quiz.editor.optionLabel', {
                        rank: option.rank,
                        question: question.rank,
                      })}
                    </Label>
                    <Input
                      id={`quiz-option-${option.id}`}
                      value={option.label ?? ''}
                      maxLength={160}
                      onChange={(event) =>
                        modifier(question.id, {
                          options: question.options.map((o) =>
                            o.id === option.id ? { ...o, label: event.target.value } : o),
                        })
                      }
                    />
                    <input
                      type="radio"
                      name={`quiz-correct-${question.id}`}
                      checked={option.isCorrect}
                      aria-label={t('module.quiz.editor.optionCorrect', { rank: option.rank })}
                      onChange={() =>
                        modifier(question.id, {
                          options: question.options.map((o) => ({
                            ...o,
                            isCorrect: o.id === option.id,
                          })),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <Label htmlFor={`quiz-accepted-${question.id}`}>
                  {t('module.quiz.editor.acceptedAnswers', { rank: question.rank })}
                </Label>
                <Input
                  id={`quiz-accepted-${question.id}`}
                  value={question.acceptedAnswers.join(', ')}
                  onChange={(event) =>
                    modifier(question.id, {
                      acceptedAnswers: event.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter((v) => v !== ''),
                    })
                  }
                />
              </>
            )}

            <Button onClick={() => void enregistrer(question)}>
              {t('module.quiz.editor.save')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

⚠️ Le bouton « la bonne réponse » est un `radio` partagé par `name` : une
question en `choix` a **exactement une** proposition juste (spec § 3.3), et un
groupe de radios rend cette règle impossible à violer à l'écran. Des cases à
cocher laisseraient l'enseignante en cocher deux et découvrir le refus au
moment d'enregistrer.

- [ ] **Step 4 : déclarer la route de l'éditeur**

Dans `packages/module-quiz/src/client.ts`, ajouter une seconde entrée à
`uiRoutes`, après celle de la liste :

```ts
    {
      path: ':bankId',
      component: () => import('./presentation/ui/bank-editor.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
```

- [ ] **Step 5 : vérifier, puis commit**

```bash
pnpm --filter @quetzal/module-quiz lint
pnpm --filter @quetzal/module-quiz typecheck
pnpm --filter @quetzal/module-quiz test
```

Expected: les trois verts. ⚠️ Si `react/jsx-no-literals` signale une chaîne,
c'est qu'un libellé a échappé à l'i18n : le passer en clé plutôt que désactiver
la règle.

```bash
git add packages/module-quiz/src
git commit -m "feat(quiz): les deux ecrans d autorat de la banque

Chaque libelle de champ porte le RANG de sa question :
« Enonce » repete vingt fois ne dit pas a un lecteur d ecran de quelle
question il s agit. C est la lecon que le loto a tiree pour ses cartes.

La bonne reponse est un groupe de radios partageant un name, et non des
cases a cocher : la spec §3.3 veut exactement une proposition juste, et
un groupe de radios rend la regle impossible a violer a l ecran plutot
que de la faire decouvrir au moment d enregistrer."
```

---

## Task 14 : les images d'une question, et leur texte alternatif

**Files:**
- Modify: `packages/module-quiz/src/presentation/dto/quiz.dto.ts`
- Create: `packages/module-quiz/src/presentation/image.controller.ts`
- Modify: `packages/module-quiz/src/quiz.module.ts`
- Modify: `packages/module-quiz/src/manifest.ts`
- Modify: `packages/module-quiz/src/domain/ports/question-bank.repository.ts`
- Modify: `packages/module-quiz/src/infrastructure/prisma-question-bank.repository.ts`
- Modify: `packages/module-quiz/src/presentation/ui/bank-editor.tsx`
- Modify: `packages/module-quiz/src/i18n/{fr,en,es}.json`
- Test: `packages/module-quiz/src/presentation/image.controller.spec.ts`

La spec § 3.1 met les images dans le périmètre, et les colonnes existent depuis
la tâche 8, mais rien ne permet encore d'en envoyer une. Cette tâche branche le
port remonté au noyau à la tâche 1 sur la banque de questions : c'est son second
consommateur, celui qui justifiait la remontée.

- [ ] **Step 1 : étendre le port pour porter le texte alternatif**

Dans `packages/module-quiz/src/domain/ports/question-bank.repository.ts`,
ajouter le champ aux deux interfaces et au patch :

```ts
export interface QuestionOption {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  imageAlt: string | null;
  isCorrect: boolean;
}
```

```ts
export interface Question {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: AnswerMode;
  timeLimit: number | null;
  regles: ReglesDeSaisie;
  options: readonly QuestionOption[];
  acceptedAnswers: readonly string[];
}
```

```ts
export interface QuestionPatch {
  prompt?: string;
  imageId?: string | null;
  imageAlt?: string | null;
  timeLimit?: number | null;
  regles?: ReglesDeSaisie;
  options?: readonly Omit<QuestionOption, 'id'>[];
  acceptedAnswers?: readonly string[];
}
```

Puis faire suivre les trois endroits qui construisent ces objets, sinon le
typecheck les signalera un par un :

- `src/application/testing/fake-repositories.ts` : `imageAlt: null` dans
  `questionOf` et dans ses deux propositions.
- `src/infrastructure/prisma-question-bank.repository.ts` : `imageAlt` dans
  `LigneQuestion`, `LigneOption`, dans `toQuestion`, dans les deux
  `createMany` de `create`, dans `addQuestion` (`imageAlt: null`) et dans le
  `createMany` des propositions de `updateQuestion`.
- `updateQuestion` : ajouter la ligne
  `if (patch.imageAlt !== undefined) champs['imageAlt'] = patch.imageAlt;`
  juste après celle de `imageId`.
- `src/infrastructure/prisma-question-bank.repository.integration.spec.ts` :
  `imageAlt: null` dans la constante `QUESTION_CHOIX` et dans ses deux
  propositions, ainsi que dans les trois propositions de `desordre`.

⚠️ Faire ces six ajouts AVANT de lancer quoi que ce soit : `Question` est une
interface, donc chaque objet littéral incomplet sort en erreur de compilation
séparée, et il est plus rapide de les traiter d'un coup que de les découvrir une
par une. Pour les relever :

```bash
grep -rn "imageId: null" packages/module-quiz/src | grep -v imageAlt
```

Expected: chaque ligne listée doit recevoir un `imageAlt` voisin.

- [ ] **Step 2 : écrire le test du contrôleur, qui doit échouer**

`packages/module-quiz/src/presentation/image.controller.spec.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CardImageStore, StoredImage } from '@quetzal/core/images';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import {
  FakeQuestionBankRepository,
  bankOf,
} from '../application/testing/fake-repositories.js';
import { QuizImageController } from './image.controller.js';

/** Doublure écrite à la main : CLAUDE.md §11 interdit `vi.mock`. */
class FakeImageStore implements CardImageStore {
  readonly stockees: StoredImage[] = [];

  async put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage> {
    // Une empreinte stable et lisible, pas un vrai SHA : ce test juge le
    // câblage du contrôleur, pas la fonction de hachage du noyau.
    const image: StoredImage = {
      id: `image-${this.stockees.length + 1}`,
      contentHash: `hash-${input.bytes.length}`,
      mimeType: input.mimeType,
      bytes: input.bytes,
    };
    this.stockees.push(image);
    return image;
  }

  async findByHash(hash: string): Promise<StoredImage | null> {
    return this.stockees.find((image) => image.contentHash === hash) ?? null;
  }

  // Le port en entier, sinon le `implements` ne compile pas. Ce test ne juge
  // pas le ramassage : la tâche 3 s'en charge, contre un vrai Postgres.
  async deleteOrphans(): Promise<number> {
    return 0;
  }
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('QuizImageController', () => {
  let images: FakeImageStore;
  let controleur: QuizImageController;
  let banque: FakeQuestionBankRepository;

  beforeEach(() => {
    images = new FakeImageStore();
    banque = new FakeQuestionBankRepository();
    banque.add(bankOf(1));
    controleur = new QuizImageController(images, new ManageBankUseCase(banque));
  });

  it('rend l empreinte du contenu, et non un identifiant de ligne', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    const { imageId } = await controleur.uploadQuestion(questionId, {
      mimeType: 'image/png',
      data: PNG_BASE64,
      alt: 'une chaise en bois',
    });

    expect(imageId).toBe(images.stockees[0]?.contentHash);
  });

  it('attache l image ET son texte alternatif a la question', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await controleur.uploadQuestion(questionId, {
      mimeType: 'image/png',
      data: PNG_BASE64,
      alt: 'une chaise en bois',
    });

    const question = (await banque.findById('bank-1'))!.questions[0]!;
    expect(question.imageId).toBe(images.stockees[0]?.contentHash);
    expect(question.imageAlt, 'une image sans alternative est un mur').toBe(
      'une chaise en bois');
  });

  it('refuse un type de fichier non image', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await expect(
      controleur.uploadQuestion(questionId, {
        mimeType: 'application/pdf',
        data: PNG_BASE64,
        alt: 'un pdf',
      })).rejects.toThrow(BadRequestException);
  });

  it('refuse un corps sans texte alternatif', async () => {
    // L alternative n est pas facultative : c est WCAG 1.1.1, et une image
    // servie nue ne laisse aucun recours a l eleve qui ne la voit pas.
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await expect(
      controleur.uploadQuestion(questionId, { mimeType: 'image/png', data: PNG_BASE64 })).rejects.toThrow(BadRequestException);
  });

  it('sert une image deja stockee par son empreinte', async () => {
    const stockee = await images.put({
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });

    const fichier = await controleur.read(stockee.contentHash);

    expect(fichier).toBeDefined();
  });

  it('rend 404 pour une empreinte inconnue, et non une image vide', async () => {
    await expect(controleur.read('empreinte-qui-n-existe-pas')).rejects.toThrow(
      NotFoundException);
  });
});
```

```bash
cd packages/module-quiz && pnpm vitest run src/presentation/image.controller.spec.ts
```

Expected: FAIL avec `Cannot find module './image.controller.js'`.

- [ ] **Step 3 : étendre les schémas Zod**

Ajouter à `packages/module-quiz/src/presentation/dto/quiz.dto.ts` :

```ts
export const uploadQuizImageSchema = z.object({
  // Une liste fermée, et non `startsWith('image/')` : `image/svg+xml` porte du
  // script, et serait servi depuis notre origine.
  mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  /** Contenu encodé en base64, déjà redimensionné par le navigateur. */
  data: z.string().min(1).max(4_000_000),
  // ⛔ Requis, pas facultatif. WCAG 1.1.1 : une image porteuse de sens sans
  // alternative est un mur. Le rendre optionnel ferait que l'oubli devient le
  // défaut, et personne ne reviendrait le corriger.
  alt: z.string().trim().min(1).max(200),
});

export type UploadQuizImageBody = z.infer<typeof uploadQuizImageSchema>;
```

Et ajouter `imageAlt` à `patchQuestionSchema`, après `imageId` :

```ts
  imageAlt: z.string().trim().min(1).max(200).nullable().optional(),
```

- [ ] **Step 4 : écrire le contrôleur**

`packages/module-quiz/src/presentation/image.controller.ts` :

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import type { CardImageStore } from '@quetzal/core/images';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import { uploadQuizImageSchema } from './dto/quiz.dto.js';

export const QUIZ_IMAGE_STORE = 'QuizImageStore';

@Controller('api/modules/quiz')
export class QuizImageController {
  // Jetons explicites : sans eux, la métadonnée de type que Nest utiliserait
  // pour deviner ces dépendances n'existe pas sous le transform esbuild de
  // Vitest, et elles resteraient à undefined. Même raison que chez le loto.
  constructor(
    @Inject(QUIZ_IMAGE_STORE) private readonly images: CardImageStore,
    @Inject(ManageBankUseCase) private readonly banks: ManageBankUseCase) {}

  // Corps binaire plutôt que du JSON : l'adresse dépend du contenu, donc le
  // navigateur peut mettre l'image en cache via un `<img src>` normal.
  @Get('images/:hash')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async read(@Param('hash') hash: string): Promise<StreamableFile> {
    const image = await this.images.findByHash(hash);
    if (image === null) throw new NotFoundException();
    return new StreamableFile(image.bytes, { type: image.mimeType });
  }

  @Post('questions/:questionId/image')
  async uploadQuestion(
    @Param('questionId') questionId: string,
    @Body() body: unknown): Promise<{ imageId: string }> {
    const parsed = uploadQuizImageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // Référencée par son empreinte et non par un identifiant de ligne :
    // l'adresse reste la même après déduplication, et deux questions qui
    // portent la même image ne la stockent qu'une fois.
    const stored = await this.images.put({
      mimeType: parsed.data.mimeType,
      bytes: new Uint8Array(Buffer.from(parsed.data.data, 'base64')),
    });
    await this.banks.updateQuestion({
      questionId,
      patch: { imageId: stored.contentHash, imageAlt: parsed.data.alt },
    });
    return { imageId: stored.contentHash };
  }
}
```

⚠️ `updateQuestion` passe par `ManageBankUseCase`, et non par le dépôt : c'est
ce qui fait que `assertJouable` s'applique aussi à une image, et qu'on ne peut
pas rendre une question injouable en contournant le cas d'usage.

- [ ] **Step 5 : lancer le test pour le voir passer**

```bash
cd packages/module-quiz && pnpm vitest run src/presentation/image.controller.spec.ts
```

Expected: 6 tests verts.

- [ ] **Step 6 : câbler, et déclarer les deux routes**

Dans `packages/module-quiz/src/quiz.module.ts`, ajouter l'adaptateur du noyau et
le contrôleur :

```ts
import { Module } from '@nestjs/common';
import { PrismaCardImageStore } from '@quetzal/core/images';
import { ManageBankUseCase } from './application/manage-bank.use-case.js';
import type { QuestionBankRepository } from './domain/ports/question-bank.repository.js';
import { PrismaQuestionBankRepository } from './infrastructure/prisma-question-bank.repository.js';
import { BankController } from './presentation/bank.controller.js';
import { QuizImageController, QUIZ_IMAGE_STORE } from './presentation/image.controller.js';

const BANKS = 'QuizQuestionBankRepository';

@Module({
  controllers: [BankController, QuizImageController],
  providers: [
    { provide: BANKS, useClass: PrismaQuestionBankRepository },
    { provide: QUIZ_IMAGE_STORE, useClass: PrismaCardImageStore },
    {
      provide: ManageBankUseCase,
      useFactory: (banks: QuestionBankRepository) => new ManageBankUseCase(banks),
      inject: [BANKS],
    },
  ],
})
export class QuizModule {}
```

Et dans `packages/module-quiz/src/manifest.ts`, ajouter les deux routes à
`permissions` :

```ts
    'http:GET /api/modules/quiz/images/:hash': ['owner', 'creator', 'learner', 'guest'],
    'http:POST /api/modules/quiz/questions/:questionId/image': ['owner', 'creator'],
```

⚠️ La lecture d'une image est la **seule** route de ce plan ouverte à `learner`
et `guest` : en séance, un élève doit voir l'image de la question. L'envoi reste
réservé à l'enseignante.

⛔ **Et il manque encore une chose, sans laquelle les images du quiz seraient
effacées à la première suppression de jeu de loto.** Le ramassage installé à la
tâche 3 consulte des fournisseurs de références ; le quiz doit en enregistrer un.
Créer `packages/module-quiz/src/infrastructure/quiz-image-references.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { ImageReferenceProvider } from '@quetzal/core/images';

/**
 * ⛔ LES DEUX PORTEURS, et pas seulement la question : une proposition porte
 * aussi une image (c'est ce qui fait de « mot ↔ image » une configuration et
 * non un type de question). En oublier un ferait ramasser des images vivantes.
 */
@Injectable()
export class QuizImageReferences implements ImageReferenceProvider {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as {
      quiz_Question: { findMany(args: unknown): Promise<{ imageId: string | null }[]> };
      quiz_Option: { findMany(args: unknown): Promise<{ imageId: string | null }[]> };
    };

    const [questions, options] = await Promise.all([
      prisma.quiz_Question.findMany({
        where: { imageId: { not: null } },
        select: { imageId: true },
      }),
      prisma.quiz_Option.findMany({
        where: { imageId: { not: null } },
        select: { imageId: true },
      }),
    ]);

    return [
      ...new Set(
        [...questions...options]
          .map((ligne) => ligne.imageId)
          .filter((id): id is string => id !== null)),
    ];
  }
}
```

et l'enregistrer dans `quiz.module.ts`, en ajoutant aux `providers` :

```ts
    { provide: IMAGE_REFERENCE_PROVIDERS, useClass: QuizImageReferences, multi: true },
```

⚠️ Nest n'a pas de `multi: true` comme Angular. Le jeton collecteur de la tâche 3
est donc un tableau construit par fabrique : relire son step 4 et suivre la forme
exacte qui y est écrite plutôt que celle-ci, qui n'est là que pour dire **quoi**
enregistrer.

- [ ] **Step 7 : prouver que le contrat tient toujours**

```bash
pnpm --filter @quetzal/module-quiz test
```

Expected: vert. Puis la mutation, qui doit rougir :

```bash
cd packages/module-quiz
cp src/manifest.ts /tmp/man2.bak
sed -i "/http:POST \/api\/modules\/quiz\/questions\/:questionId\/image'/d" src/manifest.ts
pnpm vitest run tests/manifest.spec.ts
cp /tmp/man2.bak src/manifest.ts
pnpm vitest run tests/manifest.spec.ts
```

Expected: rouge sur la route non déclarée, puis vert restauré.

- [ ] **Step 8 : le champ dans l'éditeur**

Ajouter aux trois catalogues, dans le bloc `editor` :

`fr.json` :

```json
        "image": "Image de la question {rank}",
        "imageAlt": "Description de l image de la question {rank}, pour qui ne la voit pas",
        "imageAltRequis": "Une image sans description est inutilisable par une partie des élèves"
```

`en.json` :

```json
        "image": "Image of question {rank}",
        "imageAlt": "Description of the image of question {rank}, for those who cannot see it",
        "imageAltRequis": "An image without a description is unusable by some students"
```

`es.json` :

```json
        "image": "Imagen de la pregunta {rank}",
        "imageAlt": "Descripción de la imagen de la pregunta {rank}, para quien no la ve",
        "imageAltRequis": "Una imagen sin descripción no la pueden usar algunos alumnos"
```

Puis, dans `bank-editor.tsx`, ajouter à l'état du composant et au corps de
chaque `<li>`, juste après le champ de délai :

```tsx
            <Label htmlFor={`quiz-image-${question.id}`}>
              {t('module.quiz.editor.image', { rank: question.rank })}
            </Label>
            <input
              id={`quiz-image-${question.id}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const fichier = event.target.files?.[0];
                if (fichier !== undefined) void envoyerImage(question, fichier);
              }}
            />

            <Label htmlFor={`quiz-alt-${question.id}`}>
              {t('module.quiz.editor.imageAlt', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-alt-${question.id}`}
              value={question.imageAlt ?? ''}
              maxLength={200}
              required
              onChange={(event) => modifier(question.id, { imageAlt: event.target.value })}
            />
            {question.imageId !== null && (question.imageAlt ?? '') === '' && (
              <p role="status">{t('module.quiz.editor.imageAltRequis')}</p>
            )}
```

Ajouter `imageId: string | null;` et `imageAlt: string | null;` à l'interface
`Question` locale du fichier, et la fonction d'envoi au-dessus du `return` :

```tsx
  async function envoyerImage(question: Question, fichier: File): Promise<void> {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    let binaire = '';
    for (const octet of octets) binaire += String.fromCharCode(octet);

    // Le texte alternatif part AVEC l'image, parce que la route l'exige : une
    // image déjà en base dont l'alternative viendrait « plus tard » reste sans
    // alternative pour toujours.
    await apiClient().apiFetch(`/api/modules/quiz/questions/${question.id}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mimeType: fichier.type,
        data: btoa(binaire),
        alt: (question.imageAlt ?? '').trim() === '' ? fichier.name : question.imageAlt,
      }),
    });
    await recharger();
  }
```

⚠️ Le nom du fichier en alternative de secours est un **pis-aller assumé**, pas
une solution : il évite un envoi refusé, et le message d'avertissement reste
affiché tant qu'Elda n'a pas écrit la vraie description.

- [ ] **Step 9 : vérifier, puis commit en deux**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz lint
pnpm --filter @quetzal/module-quiz typecheck
pnpm --filter @quetzal/module-quiz test
pnpm --filter @quetzal/module-quiz test:integration
```

Expected: tout vert.

```bash
git add packages/module-quiz/src/presentation/image.controller.spec.ts
git commit -m "test(quiz): exiger qu une image arrive avec son texte alternatif

Vu rouge d abord. Le test qui compte n est pas l envoi mais le REFUS
d un corps sans alternative : WCAG 1.1.1, et une image servie nue ne
laisse aucun recours a l eleve qui ne la voit pas. Rendre le champ
optionnel ferait de l oubli le defaut, et personne n y reviendrait."
git add -A packages/module-quiz
git commit -m "feat(quiz): envoyer et servir les images d une question

Second consommateur du port remonte au noyau a la tache 1 : c est ce qui
justifiait la remontee.

L image est referencee par son EMPREINTE et non par un identifiant de
ligne, donc deux questions qui portent la meme image ne la stockent qu une
fois et l adresse survit a la deduplication.

Le type MIME est une liste fermee et non un prefixe image/ : svg+xml
porte du script et serait servi depuis notre origine.

L envoi passe par ManageBankUseCase et non par le depot, pour qu
assertJouable s applique aussi a une image.

⚠️ TENSION NON RESOLUE, nommee dans le modele et pas tranchee ici : sur
une question d identification « mot ↔ image », un alternatif fidele DONNE
la reponse a un lecteur d ecran, et son absence rend la question
impossible. La colonne existe, la decision de ce qu on affiche a defaut
appartient au produit."
```

---

## Task 15 : enregistrer le slug `quiz` partout où il doit l'être

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `render.yaml`
- Modify: `turbo.json`

- [ ] **Step 1 : relever tous les endroits qui nomment les modules**

```bash
grep -rn "hello,loto" --include="*.yml" --include="*.yaml" --include="*.json" . \
  | grep -v node_modules
```

Expected: les occurrences dans `.github/workflows/ci.yml` et `render.yaml`.
**Chacune** doit devenir `hello,loto,quiz`, une seule oubliée et le module
n'existe pas dans cet environnement, sans qu'aucune erreur ne le dise.

- [ ] **Step 2 : remplacer dans les deux fichiers**

```bash
sed -i 's/hello,loto/hello,loto,quiz/g' .github/workflows/ci.yml render.yaml
grep -rn "hello,loto,quiz" .github/workflows/ci.yml render.yaml
```

Expected: toutes les occurrences, `MODULES` comme `NEXT_PUBLIC_MODULES`.

- [ ] **Step 3 : vérifier que rien d'autre ne liste les modules**

```bash
grep -rn "MODULES" turbo.json | head
```

Expected: `MODULES` et `NEXT_PUBLIC_MODULES` figurent dans les listes `env` des
tâches. Elles nomment la **variable**, pas sa valeur : rien à changer ici. Si une
tâche les oublie, son cache ignorerait un changement de modules, l'ajouter
alors.

- [ ] **Step 4 : commit**

```bash
git add .github/workflows/ci.yml render.yaml
git commit -m "ci(quiz): enregistrer le slug quiz dans les deux environnements

MODULES et NEXT_PUBLIC_MODULES sont lus par apps/api/src/main.ts pour
charger les manifestes, et par generate-module-routes.ts pour ecrire la
carte statique des chargeurs du host. Une occurrence oubliee et le module
n existe pas dans cet environnement, sans qu aucune erreur ne le dise."
```

---

## Task 16 : vérification de bout en bout, sur la recette locale complète

- [ ] **Step 1 : monter la pile, avec la garde dans le même script**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP Neon"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
export BETTER_AUTH_SECRET="e2e-local-secret-not-a-real-one-0123456789"
export GUEST_TOKEN_SECRET="e2e-local-guest-secret-0123456789"
export HOST_URL="http://localhost:3010" API_URL="http://localhost:3011"
export NEXT_PUBLIC_API_URL="http://localhost:3011" NEXT_PUBLIC_HOST_URL="http://localhost:3010"
export MODULES="hello,loto,quiz" NEXT_PUBLIC_MODULES="hello,loto,quiz"
export SEED_OWNER_EMAIL="elda@test.dev" SEED_OWNER_PASSWORD="TestPassword123!"
export E2E_HOST_URL="http://localhost:3010"

pnpm --filter @quetzal/db prisma:migrate:deploy
pnpm --filter @quetzal/db prisma:generate
rm -rf apps/host/.next
pnpm build
pnpm --filter @quetzal/auth seed
PORT=3011 pnpm --filter quetzal-api start &
pnpm --filter quetzal-host exec next start -p 3010 &
```

⛔ **Ne pas lancer `pnpm dev`** : il lit `.env.local`, qui pointe sur Neon.

⚠️ Si `next build` échoue sur un `TypeError: Cannot read properties of undefined
(reading 'length')` sans nommer de fichier, c'est `.next` qui porte un build
précédent : `rm -rf apps/host/.next` et recommencer. La ligne est déjà au-dessus
pour cette raison.

- [ ] **Step 2 : prouver que le module est chargé, témoin de fraîcheur**

```bash
grep -c "quiz" apps/host/src/lib/module-loaders.generated.ts
```

Expected: **au moins 1**. ⛔ C'est la preuve que le slug a été pris en compte au
build ; sans elle, la suite vérifierait un host sans module quiz et tomberait sur
des erreurs trompeuses.

- [ ] **Step 3 : faire le geste complet d'Elda, par l'API**

```bash
JETON=$(curl -s -X POST "http://localhost:3010/api/auth/sign-in/email" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3010" \
  -c /tmp/cookies.txt -d '{"email":"elda@test.dev","password":"TestPassword123!"}' >/dev/null \
  && curl -s -b /tmp/cookies.txt http://localhost:3010/api/auth/token | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

BANQUE=$(curl -s -X POST http://localhost:3010/api/modules/quiz/banks \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d '{"name":"Vocabulaire de la maison"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "banque : $BANQUE"

QUESTION=$(curl -s -X POST "http://localhost:3010/api/modules/quiz/banks/$BANQUE/questions" \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d '{"prompt":"¿Cómo se dice chaise ?","answerMode":"choix"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")

curl -s -X PATCH "http://localhost:3010/api/modules/quiz/banks/$BANQUE/questions/$QUESTION" \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d '{"options":[{"rank":1,"label":"la silla","imageId":null,"isCorrect":true},{"rank":2,"label":"la mesa","imageId":null,"isCorrect":false}]}'
echo

curl -s "http://localhost:3010/api/modules/quiz/banks/$BANQUE" -H "Authorization: Bearer $JETON"
```

Expected: la dernière lecture rend la banque avec une question, deux
propositions, et `"isCorrect":true` sur `la silla`.

- [ ] **Step 4 : prouver que la garde refuse une question injouable**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "http://localhost:3010/api/modules/quiz/banks/$BANQUE/questions/$QUESTION" \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d '{"options":[{"rank":1,"label":"A","imageId":null,"isCorrect":false},{"rank":2,"label":"B","imageId":null,"isCorrect":false}]}'
```

Expected: **400**. Une question à choix sans proposition juste n'atteint pas la
base.

- [ ] **Step 5 : arrêter les serveurs, puis les portes complètes**

```bash
kill %1 %2
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @quetzal/core test:integration
pnpm --filter @quetzal/module-loto test:integration
pnpm --filter @quetzal/module-quiz test:integration
pnpm exec playwright test --reporter=line
```

Expected: tout vert. La suite e2e existante ne touche pas le quiz et doit rester
inchangée ; si `loto-guest` ou `enchainer-les-figures` rougit, **ce n'est pas ce
plan**, relire le commentaire de `loto-guest.e2e.spec.ts` et l'issue #68 avant
de soupçonner son propre travail.

- [ ] **Step 6 : la PR**

```bash
git push -u origin feat/module-quiz-banque
```

Puis ouvrir la PR vers `main` avec, en première ligne, `Closes #` suivi du numéro
de l'issue si une issue suit ce plan, `Closes`, `Fixes` ou `Resolves`, jamais
« Ferme », que GitHub ne reconnaît pas. Décrire : contexte, changement, plan de
test, et **ce qui a été vu rougir** par mutation.

---

## Ce que ce plan laisse au plan 2

La séance, en entier : `Quiz_Session`, le figement de la banque
(`Quiz_SessionQuestion` et son `timeLimitResolved`), les participants et l'unité
solo/équipes, l'ouverture et la fermeture paresseuse d'une question, le scoring
des deux modes, le bonus borné de D7, la marge de grâce, la passerelle
WebSocket, l'écran animatrice, l'écran élève, le podium et le retour de séance.

Le plancher d'accessibilité de la spec § 8 relève presque entièrement du plan 2 :
il porte sur le minuteur et sur l'écran élève, qui n'existent pas ici. Le seul
point qui s'applique à ce plan-ci est l'étiquetage des champs par rang (tâche 13)
et le texte alternatif des images (tâche 14).
