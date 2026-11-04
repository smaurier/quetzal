-- La langue imposee a tous les ecrans invites d'une partie, resolue UNE FOIS a
-- la creation depuis celle de l'animatrice. Nullable : `null` est le defaut et
-- le seul cas qui existe pour toutes les parties deja en base, l'option etant
-- decochee par defaut. Chaque appareil garde alors la sienne.

ALTER TABLE "Loto_Game" ADD COLUMN "guestLocale" VARCHAR(5);
