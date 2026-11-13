-- Une carte est toujours nommee (#102). NOT VALID : la CHECK refuse toute
-- nouvelle ecriture vide sans verifier les lignes existantes, car l ancien
-- editeur creait des cartes vides et la production peut en porter. Les
-- valider d abord ferait echouer le deploiement. VALIDATE CONSTRAINT viendra
-- dans une migration a part, une fois les lignes vides comptees et nommees.
ALTER TABLE "Loto_Card" ADD CONSTRAINT "Loto_Card_label_check"
  CHECK (btrim("label") <> '') NOT VALID;
