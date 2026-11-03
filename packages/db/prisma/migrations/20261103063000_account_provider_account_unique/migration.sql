-- 20261102150000 a retire account_issuer_accountId_uidx avec la colonne `issuer`,
-- sans rien mettre a sa place : `account` se retrouvait sans aucune contrainte
-- d'unicite. Better-Auth resout un compte par (providerId, accountId) depuis la
-- 1.6, c'est donc ce couple qui porte l'invariant.
--
-- Cette migration ECHOUE au deploiement si des doublons existent deja, et c'est
-- voulu : mieux vaut un deploiement arrete qu'une cle posee en silence sur des
-- donnees qui la violent.
--   SELECT "providerId", "accountId", count(*) FROM "account"
--   GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
