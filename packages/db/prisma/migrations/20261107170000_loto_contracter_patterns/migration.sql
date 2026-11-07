-- Issue #52, SECOND TEMPS de la bascule expand / contract ouverte par #30.
--
-- Le premier temps (20261104120000) avait laisse deux concessions, chacune pour
-- une direction du trafic pendant la fenetre de deploiement : "pattern" restait
-- NOT NULL parce que l'ancienne instance la LISAIT, et "patterns" restait
-- nullable parce que l'ancienne instance ECRIVAIT des parties sans la connaitre.
-- #30 est en production et servie, donc la fenetre est fermee.

-- 1. REMPLIR D'ABORD, et c'est le pas que l'enonce de l'issue ne mentionnait
--    pas. `SET NOT NULL` echoue sur la premiere ligne NULL rencontree, et il en
--    existe forcement : toute partie creee par l'ancienne instance pendant la
--    fenetre a "patterns" a NULL. Sans ce remplissage, la migration part dans
--    le `buildCommand` de Render, echoue, et le deploiement casse — soit
--    exactement le motif de l'incident `account.issuer` du 04/11 que cette
--    issue cite en exemple.
--
--    Le repli est le meme que celui que le code appliquait a la lecture
--    (`patterns ?? pattern`) : une figure unique est une liste valide a une
--    entree, et la CHECK ci-dessous l'accepte telle quelle.
UPDATE "Loto_Game" SET "patterns" = "pattern" WHERE "patterns" IS NULL;

-- 2. et seulement maintenant, exigee. L'ordre est le meme que celui du premier
--    temps, pour la meme raison : jamais une colonne NOT NULL sans que la
--    donnee soit la.
ALTER TABLE "Loto_Game" ALTER COLUMN "patterns" SET NOT NULL;

-- 3. la figure unique s'en va, et "Loto_Game_pattern_check" part avec elle :
--    Postgres supprime les contraintes qui ne portent plus que sur une colonne
--    retiree. "Loto_Game_patterns_check", elle, reste et devient pleinement
--    utile — une CHECK sur une colonne nullable laissait passer NULL, celle-ci
--    ne laisse plus rien passer.
--
--    ⚠️ "Loto_Claim.pattern" n'est PAS concernee : c'est la figure reclamee,
--    une donnee propre a la reclamation, remplie au premier temps et gardee.
ALTER TABLE "Loto_Game" DROP COLUMN "pattern";
