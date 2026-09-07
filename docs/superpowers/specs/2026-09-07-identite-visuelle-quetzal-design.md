# Quetzal — Identité visuelle, phase 1 : palette et mode sombre

**Date** : 2026-09-07
**Statut** : conception validée, prête pour le plan d'implémentation
**Périmètre** : `packages/ui/src/globals.css`, préférence de mode utilisateur, coquille de l'hôte
**Hors périmètre** : logo, refonte de la coquille, mécanisme multi-locataire (phases 2 et 3)

---

## 1. Objectif

Donner à Quetzal une identité visuelle propre, et rendre le mode sombre atteignable. Aujourd'hui l'application porte la palette shadcn par défaut — des gris bleutés qu'on retrouve dans des milliers de produits — et le bloc `.dark` existe sans qu'aucun code n'ajoute jamais la classe qui l'active.

Cette phase ne déplace aucune mise en page. Elle change des valeurs et ajoute un sélecteur.

## 2. Ce qui a été décidé, et pourquoi

### D1 — Un locataire ne fournit qu'une couleur d'accent

Un établissement pourra imposer sa couleur de marque. Il ne touchera jamais aux fonds, aux textes ni aux bordures.

**Raison** : c'est ce qui rend le contraste *garantissable* au lieu d'espéré. Les paires texte/fond ne dépendent jamais d'une donnée client, donc leur conformité se vérifie une fois et ne peut pas régresser à cause d'un choix commercial.

**Conséquence à ne pas oublier en phase 3** : une couleur donnée par un client devra être déclinée en **deux** valeurs, une par mode. Un jade profond qui porte du texte blanc sur fond clair est illisible sur fond sombre.

### D2 — Le thème du locataire est écrit par le serveur

Le locataire est connu côté serveur : par la session pour le tableau de bord, par le paramètre d'URL pour la page d'entrée invité. Ses variables seront écrites dans le HTML de la première réponse.

**Raison** : aucun clignotement. Une application client seul ne peut pas connaître le thème avant que le JavaScript tourne, et le navigateur a déjà peint. Le rendu serveur supprime le problème au lieu de le panser.

### D3 — Le locataire impose la marque, l'utilisateur choisit le mode

Deux axes indépendants. L'établissement impose sa couleur ; chaque utilisateur garde le choix entre clair, sombre, et le réglage de son système.

**Raison** : le mode sombre est un besoin de confort visuel, parfois d'accessibilité. Le retirer à un élève pour servir une charte serait un mauvais échange.

### D4 — Une seule mécanique de surcharge, deux portées

Quetzal pose ses valeurs par défaut sur `:root`. Un locataire les surcharge sur `:root`, au rendu serveur. Un module les surcharge sur **son propre conteneur**.

**Raison** : la cascade CSS fait le travail nativement, il n'y a aucun code d'arbitrage à écrire. Et surtout, locataire et module ne se disputent rien — ils ne peignent pas les mêmes pixels. Le locataire tient la coquille, le module tient sa surface de jeu. Une question de portée ne peut pas être ambiguë, contrairement à une question de priorité.

**Asymétrie de confiance** : la surcharge d'un locataire est une donnée non fiable, d'où la restriction à un accent. Celle d'un module est du code relu en revue, dont le contraste se vérifie une fois — un module peut donc aller plus loin.

## 3. Le parti pris chromatique

Le quetzal resplendissant : vert émeraude irisé, poitrine cramoisie, bec doré.

**La décision porteuse est celle des neutres.** Ils occupent la quasi-totalité des pixels d'un écran d'application. Les réchauffer et les teinter très légèrement de vert — au lieu du bleu shadcn — change la perception de toute l'interface sans qu'on sache dire pourquoi. En mode sombre en particulier : un fond vert-noir au lieu du bleu-noir universel.

Le cramoisi et l'or sont des **signaux**, jamais des surfaces. C'est ce qui sépare le mésoaméricain épuré du pastiche folklorique.

## 4. Les tokens

### Correction de nommage

Dans shadcn, `--accent` et `--secondary` sont des **surfaces** : `--accent` sert aux états de survol, `--secondary` aux boutons secondaires. Y placer le cramoisi et l'or rendrait tous les survols dorés et tous les boutons secondaires rouges.

Le cramoisi et l'or reçoivent donc leurs propres tokens, et les tokens shadcn gardent leur sémantique d'origine.

### Mode clair

```css
:root {
  --background: 40 30% 99%;
  --foreground: 165 20% 12%;
  --card: 0 0% 100%;
  --card-foreground: 165 20% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 165 20% 12%;
  --primary: 165 62% 26%;
  --primary-foreground: 40 30% 99%;
  --secondary: 45 22% 94%;
  --secondary-foreground: 165 22% 18%;
  --muted: 45 20% 95%;
  --muted-foreground: 165 8% 40%;
  --accent: 45 26% 92%;
  --accent-foreground: 165 22% 18%;
  --destructive: 8 72% 48%;
  --destructive-foreground: 40 30% 99%;
  --border: 42 16% 88%;
  --input: 42 14% 53%;
  --ring: 165 62% 26%;
  --radius: 0.5rem;

  /* Signaux de marque — jamais des surfaces. */
  --brand-crimson: 355 62% 44%;
  --brand-crimson-foreground: 40 30% 99%;
  --brand-gold: 38 82% 48%;
  --brand-gold-foreground: 165 30% 10%;
}
```

### Mode sombre

```css
.dark {
  --background: 165 24% 7%;
  --foreground: 40 22% 95%;
  --card: 165 20% 11%;
  --card-foreground: 40 22% 95%;
  --popover: 165 20% 11%;
  --popover-foreground: 40 22% 95%;
  --primary: 158 52% 56%;
  --primary-foreground: 165 30% 9%;
  --secondary: 165 16% 18%;
  --secondary-foreground: 40 22% 95%;
  --muted: 165 16% 16%;
  --muted-foreground: 155 10% 62%;
  --accent: 165 18% 20%;
  --accent-foreground: 40 22% 95%;
  --destructive: 8 62% 58%;
  --destructive-foreground: 165 30% 9%;
  --border: 165 14% 20%;
  --input: 165 12% 39%;
  --ring: 158 52% 56%;

  --brand-crimson: 355 60% 62%;
  --brand-crimson-foreground: 165 30% 9%;
  --brand-gold: 40 78% 58%;
  --brand-gold-foreground: 165 30% 9%;
}
```

`--primary` change de valeur entre les deux modes, et c'est le point à ne jamais perdre de vue : le jade profond qui porte du texte blanc sur fond clair devient illisible sur fond sombre.

## 5. Le sélecteur de mode

Trois états : clair, sombre, système. Le troisième est le défaut.

**Il doit suivre exactement le chemin de la langue.** Une route existe déjà, `/api/user/locale`, et une préférence de langue persistée. Le thème est le même problème — une préférence d'utilisateur, mémorisée, appliquée au rendu — et mérite le même mécanisme plutôt qu'un second inventé à côté.

Conséquence : la préférence est lue **côté serveur** avant le rendu, et la classe `dark` est posée sur l'élément racine dans la réponse initiale. Aucun script en amont, aucun clignotement.

Pour l'état « système », le serveur ne peut pas connaître la préférence du système d'exploitation. Ce cas, et lui seul, se résout côté client via `prefers-color-scheme` — sans clignotement visible, parce que la règle CSS s'applique avant la première peinture.

`color-scheme` doit être posé en même temps que la classe, sinon les ascenseurs, les cases à cocher et les contrôles natifs restent clairs sur un fond sombre.

## 6. Accessibilité

Ces valeurs ne sont pas négociables. Les paires suivantes doivent être vérifiées et documentées, dans les **deux** modes :

| Paire | Seuil |
|---|---|
| `foreground` sur `background` | 4.5:1 |
| `foreground` sur `card` | 4.5:1 |
| `muted-foreground` sur `background` | 4.5:1 |
| `primary-foreground` sur `primary` | 4.5:1 |
| `destructive-foreground` sur `destructive` | 4.5:1 |
| `brand-crimson-foreground` sur `brand-crimson` | 4.5:1 |
| `brand-gold-foreground` sur `brand-gold` | 4.5:1 |
| `input` sur `background` | 3:1 |
| `input` sur `card` | 3:1 |
| `ring` sur `background` | 3:1 |
| `border` sur `background` | aucun — voir ci-dessous |

**`border` et `input` ne portent pas la même exigence, et la première version de ce document les confondait.**

`--border` dessine des filets de séparation et des contours de cartes : purement décoratifs, ils ne véhiculent aucune information et aucun seuil ne s'applique. Les garder clairs est un choix esthétique légitime.

`--input` dessine la frontière visible d'un champ de saisie. C'est un composant d'interface, donc **3:1 obligatoire**. Les deux tokens doivent par conséquent avoir des valeurs distinctes, alors que shadcn les fixe identiques par défaut.

Valeurs retenues, calculées puis vérifiées : `42 14% 53%` en clair (3,19:1 sur le fond, 3,25:1 sur une carte) et `165 12% 39%` en sombre (3,42:1 et 3,05:1). Les valeurs de la première version — `42 16% 88%` et `165 14% 20%` — atteignaient 1,26:1 et 1,55:1 : très en deçà.

Un champ de saisie repose tantôt sur `background`, tantôt sur `card`. Les deux paires doivent donc passer, et la surface la plus proche du contour est celle qui contraint : en sombre, `card` est plus claire que `background`, elle laisse moins de marge.

La vérification est **automatisée**, pas manuelle : un test lit les tokens et calcule les rapports. Une palette qu'on vérifie une fois à la main dérive à la première retouche.

Si une valeur de ce document ne passe pas son seuil, **c'est la valeur qui cède**, pas le seuil. Le test est l'arbitre.

## 7. Hors périmètre

Le logo, la refonte de la coquille et l'échelle typographique sont la phase 2. Le mécanisme de surcharge par locataire est la phase 3. Cette phase ne déplace aucune mise en page et ne touche à aucun composant : elle change des valeurs et ajoute un sélecteur.

## 8. Tests

| Objet | Approche |
|---|---|
| Contrastes | Test unitaire lisant `globals.css`, calculant les rapports des paires du paragraphe 6, dans les deux modes |
| Préférence de mode | Test de la persistance et de la relecture, comme pour la langue |
| Rendu initial | E2E : charger avec une préférence sombre et vérifier que l'élément racine porte `dark` dès la première réponse — c'est le test qui prouve l'absence de clignotement |
| Non-régression | Les E2E existants doivent passer sans modification : aucune structure ne bouge |
