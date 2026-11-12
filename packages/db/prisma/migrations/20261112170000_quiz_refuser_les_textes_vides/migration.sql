-- `''` n'est pas NULL : "label" IS NOT NULL laissait passer une proposition
-- sans rien a afficher (#100). btrim(NULL) <> '' vaut NULL, et une CHECK passe
-- sur NULL : une proposition en image seule reste donc permise.
ALTER TABLE "Quiz_Option" DROP CONSTRAINT "Quiz_Option_label_ou_image_check";
ALTER TABLE "Quiz_Option" ADD CONSTRAINT "Quiz_Option_label_ou_image_check"
  CHECK (btrim("label") <> '' OR "imageId" IS NOT NULL);

-- Une reponse acceptee vide rendrait la saisie vide correcte.
ALTER TABLE "Quiz_AcceptedAnswer" ADD CONSTRAINT "Quiz_AcceptedAnswer_value_check"
  CHECK (btrim("value") <> '');
