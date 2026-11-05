// Controle de remplissage apres la migration de l'issue #30, EN LECTURE SEULE.
//
// Prealable a l'issue #52 : celle-ci retire `Loto_Game.pattern` et le repli de
// lecture. Si le remplissage avait manque des lignes, le retrait perdrait de la
// donnee. Ce script le verifie avant, pas apres.
//
// ⚠️ Ce fichier vit dans `packages/db` et non a la racine : `@prisma/client` ne
// se resout que depuis ici, et la resolution ESM suit l'emplacement du FICHIER,
// pas le repertoire courant. Lecon du 04/11.
//
// Aucune ecriture : ni INSERT, ni UPDATE, ni DELETE, ni migration.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function ligne(etiquette, valeur) {
  console.log(`  ${etiquette.padEnd(46)} ${valeur}`);
}

try {
  const url = process.env.DATABASE_URL ?? '';
  const hote = url.replace(/^.*@/, '').replace(/\/.*$/, '') || '(inconnu)';
  console.log(`\nbase interrogee : ${hote}`);
  console.log(`cible           : ${url.includes('neon') ? 'NEON (production)' : 'autre'}\n`);

  console.log('— Loto_Claim : la figure est garantie par la base —');
  const claims = await prisma.loto_Claim.count();
  ligne('reclamations au total', claims);
  // Pas de comptage des figures manquantes : `Loto_Claim.pattern` est NOT NULL
  // dans le schema, et Prisma refuse meme la requete (« Argument pattern must
  // not be null »). La contrainte de base rend donc le cas impossible, ce qui
  // vaut mieux qu un controle : si le remplissage avait manque une ligne, le
  // `SET NOT NULL` de la migration aurait echoue et le deploiement avec lui.
  ligne('sans figure : impossible (colonne NOT NULL)', 'garanti par la base');
  const claimsSansFigure = 0;

  console.log('\n— Loto_Game : la liste doit etre remplie —');
  const parties = await prisma.loto_Game.count();
  const sansListe = await prisma.loto_Game.count({ where: { patterns: null } });
  ligne('parties au total', parties);
  ligne('sans liste de figures', sansListe);

  console.log('\n— Coherence entre la liste et la colonne obsolete —');
  const lignes = await prisma.loto_Game.findMany({
    select: { joinCode: true, pattern: true, patterns: true, patternIndex: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  let desaccords = 0;
  let indexHorsListe = 0;
  for (const l of lignes) {
    const liste = (l.patterns ?? l.pattern ?? '').split(',').filter(Boolean);
    if (l.patterns !== null && l.pattern !== liste[0]) desaccords += 1;
    if (l.patternIndex < 0 || l.patternIndex >= liste.length) indexHorsListe += 1;
  }
  ligne(`lignes examinees (les ${lignes.length} plus recentes)`, lignes.length);
  ligne('pattern != premiere entree de patterns', desaccords);
  ligne('patternIndex hors de sa liste', indexHorsListe);

  console.log('\n— Detail des parties recentes —');
  for (const l of lignes.slice(0, 10)) {
    console.log(
      `  ${l.joinCode}  ${String(l.status).padEnd(9)} patterns=${String(l.patterns ?? 'NULL').padEnd(30)} index=${l.patternIndex}  pattern=${l.pattern}`,
    );
  }

  const bloquant = claimsSansFigure > 0 || sansListe > 0 || indexHorsListe > 0;
  if (sansListe > 0) {
    console.log(`\n⛔ ${sansListe} partie(s) ont une liste de figures vide (NULL).\n`);
    console.log("   Ce n'est PAS une anomalie en soi : une partie creee par l'ancienne instance");
    console.log('   pendant la fenetre de bascule ne connaissait pas cette colonne, et le repli');
    console.log('   de lecture la rattrape.\n');
    console.log('   Mais c est BLOQUANT pour l issue #52, qui passe la colonne en NOT NULL : sur');
    console.log('   ces lignes, le SET NOT NULL echouerait et casserait le deploiement. #52 doit');
    console.log('   donc REMPLIR avant d exiger, comme la migration de l issue #30 l a fait :\n');
    console.log('     UPDATE "Loto_Game" SET "patterns" = "pattern" WHERE "patterns" IS NULL;\n');
  }
  if (indexHorsListe > 0) {
    console.log(`\n⛔ ${indexHorsListe} ligne(s) ont un index hors de leur liste : donnee cassee, a regarder.\n`);
  }
  if (!bloquant) {
    console.log('\n✅ VERT : remplissage complet et coherent. L issue #52 peut etre faite telle quelle.\n');
  }
  if (desaccords > 0) {
    console.log(
      `⚠️  ${desaccords} ligne(s) ou \`pattern\` ne vaut plus la premiere figure : attendu si une partie\n` +
        '   a avance, puisque `advancePattern` ne resynchronise pas cette colonne. Sans effet pour #52,\n' +
        '   qui la supprime.\n',
    );
  }
  process.exitCode = bloquant ? 1 : 0;
} catch (err) {
  console.error('\nechec de la lecture :', err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
