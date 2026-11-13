-- Supprimer une banque garde l'historique de ses seances (tache 6b).
-- Une seance copie ses questions au demarrage (D10) : elle n'a plus besoin
-- de sa banque pour etre relue, seul le lien "deckId" disparait.
--
-- SQL ECRIT A LA MAIN. Prisma ne sait ecrire que `ON DELETE SET NULL` sur
-- TOUTES les colonnes de la cle composite, donc aussi "tenantId", qui est
-- NOT NULL : la suppression d'une banque echouerait alors sur
-- `null value in column "tenantId"`. La liste de colonnes de SET NULL
-- (PostgreSQL >= 15) ne vide que "deckId" et laisse le cloisonnement intact.
--
-- `prisma migrate dev` POURRAIT signaler un ecart en local (son schema dit
-- SET NULL sur les deux colonnes) : refuser toute migration qui le "corrige".
-- Mesure le 13/11 (Prisma 6.19) : `migrate diff` depuis la base ne voit
-- AUCUN ecart, il ne lit pas la liste de colonnes. Donc rien ne previent
-- non plus : une migration generee qui recreerait cette cle etrangere
-- reviendrait en silence a SET NULL sur "tenantId", et la suppression d'une
-- banque ayant des seances echouerait. Relire son SQL avant de la livrer.
-- `prisma migrate deploy` (Render, tests d'integration) rejoue ce fichier
-- tel quel.

ALTER TABLE "Quiz_Session" DROP CONSTRAINT "Quiz_Session_deckId_tenantId_fkey";

ALTER TABLE "Quiz_Session" ALTER COLUMN "deckId" DROP NOT NULL;

ALTER TABLE "Quiz_Session" ADD CONSTRAINT "Quiz_Session_deckId_tenantId_fkey" FOREIGN KEY ("deckId", "tenantId") REFERENCES "Quiz_Deck"("id", "tenantId") ON DELETE SET NULL ("deckId") ON UPDATE CASCADE;
