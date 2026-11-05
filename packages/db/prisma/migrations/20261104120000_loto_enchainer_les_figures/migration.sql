-- L'ordre est contraint : remplir AVANT de retirer, sinon on detruit la
-- donnee qui sert a remplir. Et aucune colonne NOT NULL sans defaut posee
-- d'un coup : c'est le bug account.issuer du 04/11, qui a laisse l'API 25 h
-- en arriere et casse l'inscription en production.

-- 1. la figure d'une reclamation, d'abord nullable
ALTER TABLE "Loto_Claim" ADD COLUMN "pattern" VARCHAR(16);

-- 2. remplie depuis la figure de sa partie, tant qu'elle existe encore
UPDATE "Loto_Claim" c
   SET "pattern" = g."pattern"
  FROM "Loto_Game" g
 WHERE c."gameId" = g."id" AND c."tenantId" = g."tenantId";

-- 3. et seulement maintenant, exigee
ALTER TABLE "Loto_Claim" ALTER COLUMN "pattern" SET NOT NULL;

-- 4. la liste et l'index de la partie, la liste remplie depuis la figure unique
ALTER TABLE "Loto_Game" ADD COLUMN "patterns" VARCHAR(64);
ALTER TABLE "Loto_Game" ADD COLUMN "patternIndex" INTEGER NOT NULL DEFAULT 0;
UPDATE "Loto_Game" SET "patterns" = "pattern";

-- 5. la figure unique NE disparait PAS ici, et c'est delibere. La base est
--    migree pendant que l'ancienne instance sert encore : elle lit encore
--    cette colonne, et elle cree des parties sans connaitre "patterns".
--    D'ou NOT NULL conserve ici, et "patterns" laissee nullable ci-dessus.
--    Second temps dans l'issue #52, au deploiement suivant.

-- 6. les figures sont contraintes en base, la liste comme la figure unique.
--    La liste borne aussi son nombre d'entrees a quatre, comme le domaine.
--    Les doublons, eux, restent du ressort du domaine : une regexp simple ne
--    sait pas les exclure. La CHECK sur une liste encore NULL passe, comme
--    toute CHECK en SQL.
ALTER TABLE "Loto_Claim" ADD CONSTRAINT "Loto_Claim_pattern_check"
  CHECK ("pattern" IN ('linea', 'esquinas', 'centro', 'llena'));

ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_patterns_check"
  CHECK ("patterns" ~ '^(linea|esquinas|centro|llena)(,(linea|esquinas|centro|llena)){0,3}$');
