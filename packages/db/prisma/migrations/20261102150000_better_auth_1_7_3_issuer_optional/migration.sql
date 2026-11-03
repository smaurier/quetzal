-- Better Auth 1.7.3 a retire l'exigence posee par 20260903000000_better_auth_1_7 :
-- l'identite d'un compte est portee par (providerId, accountId), comme en 1.6.
-- Les versions corrigees (>= 1.7.7, qui ferment une prise de controle de compte
-- via OAuth state/Magic Link) n'ecrivent plus `issuer`, donc la contrainte
-- NOT NULL fait echouer toute insertion dans `account`.
--
-- Ordre impose par le guide officiel : retirer l'index unique AVANT de relacher
-- la colonne. La colonne est conservee et rendue nullable plutot que supprimee :
-- aucune donnee existante n'est perdue.
-- https://www.better-auth.com/docs/guides/1-7-upgrade-guide

DROP INDEX "account_issuer_accountId_uidx";
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
