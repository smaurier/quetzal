import { describe, it, expect } from 'vitest';
import {
  MAX_PROPOSITIONS,
  ajouterProposition,
  raisonInenregistrable,
  retirerProposition,
  type PropositionEditable,
} from './propositions.js';

/**
 * ⛔ CE FICHIER GARDE UN CUL-DE-SAC, PAS UNE COMMODITE. Issue #88.
 *
 * Une question en mode `choix` nait avec ZERO proposition, et c est voulu : la
 * route de creation ne prend qu un enonce et un mode. L editeur livre par la
 * tache 13 affichait `question.options.map(...)` et rien d autre, donc zero
 * champ et aucun bouton. Elda pouvait ecrire l enonce, cliquer « Enregistrer »,
 * et recevoir un 400 de `assertJouable` sans jamais avoir eu le moyen de
 * composer une reponse. La question etait INENREGISTRABLE depuis l ecran.
 *
 * Les trois fonctions testees ici sont la logique de cet ecran, sortie du JSX
 * pour etre prouvable : le depot n a ni jsdom ni @testing-library, et sa
 * convention (`team-label.ts`, `resize-image.ts`) est d extraire le calcul et
 * de laisser le JSX n etre que du cablage.
 */

function proposition(partiel: Partial<PropositionEditable> = {}): PropositionEditable {
  return { id: 'p1', rank: 1, label: 'El gallo', imageId: null, isCorrect: false, ...partiel };
}

describe('ajouterProposition', () => {
  it('donne une premiere proposition vide a une question qui n en a aucune', () => {
    const apres = ajouterProposition([], () => 'neuve');

    expect(apres).toEqual([{ id: 'neuve', rank: 1, label: '', imageId: null, isCorrect: false }]);
  });

  /**
   * ⛔ ET SURTOUT PAS `isCorrect: true` SUR LA PREMIERE. Marquer d office la
   * premiere rendrait la question enregistrable tout de suite, donc une classe
   * entiere jouerait contre une cle de reponse qu Elda n a jamais designee. Le
   * cul-de-sac se corrige en lui donnant le moyen de choisir, pas en
   * choisissant pour elle.
   */
  it('ne designe aucune proposition comme juste', () => {
    const apres = ajouterProposition([], () => 'neuve');

    expect(
      apres.some((p) => p.isCorrect),
      'aucune juste tant qu Elda n a pas choisi',
    ).toBe(false);
  });

  it('numerote la suivante au rang d apres', () => {
    const apres = ajouterProposition([proposition({ id: 'a', rank: 1 })], () => 'b');

    expect(apres.map((p) => p.rank)).toEqual([1, 2]);
  });

  /**
   * `optionSchema` plafonne `rank` a 4 et le tableau a `.max(4)` : une
   * cinquieme serait refusee par la route. L ecran ne doit pas fabriquer un
   * etat que le serveur refuse.
   */
  it('refuse une cinquieme proposition et rend la liste inchangee', () => {
    const quatre = [1, 2, 3, 4].map((rank) => proposition({ id: `p${rank}`, rank }));

    const apres = ajouterProposition(quatre, () => 'cinquieme');

    expect(apres, `le plafond est ${MAX_PROPOSITIONS}`).toEqual(quatre);
  });
});

describe('retirerProposition', () => {
  /**
   * ⛔ LES RANGS SE REFRAPPENT. Sans ca, retirer la proposition 2 sur trois
   * laisse les rangs 1 et 3, et l ecran annonce « Proposition 3 » a la
   * deuxieme ligne : l etiquette lue par un lecteur d ecran ne designe plus la
   * ligne ou le curseur se trouve.
   */
  it('refrappe les rangs pour qu ils restent consecutifs', () => {
    const trois = [1, 2, 3].map((rank) => proposition({ id: `p${rank}`, rank }));

    const apres = retirerProposition(trois, 'p2');

    expect(apres.map((p) => [p.id, p.rank])).toEqual([
      ['p1', 1],
      ['p3', 2],
    ]);
  });

  /**
   * ⛔ ET LA CLE DE REPONSE NE SE DEPLACE PAS TOUTE SEULE. Retirer la juste
   * doit laisser la question sans juste — donc inenregistrable, donc signalee —
   * plutot que de promouvoir silencieusement une voisine au rang de bonne
   * reponse.
   */
  it('ne promeut personne quand la juste est celle qu on retire', () => {
    const deux = [
      proposition({ id: 'p1', rank: 1, isCorrect: true }),
      proposition({ id: 'p2', rank: 2, isCorrect: false }),
    ];

    const apres = retirerProposition(deux, 'p1');

    expect(
      apres.some((p) => p.isCorrect),
      'aucune juste apres avoir retire la juste',
    ).toBe(false);
  });

  it('laisse la juste tranquille quand on retire une autre', () => {
    const deux = [
      proposition({ id: 'p1', rank: 1, isCorrect: true }),
      proposition({ id: 'p2', rank: 2, isCorrect: false }),
    ];

    const apres = retirerProposition(deux, 'p2');

    expect(apres.map((p) => [p.id, p.isCorrect])).toEqual([['p1', true]]);
  });
});

describe('raisonInenregistrable, en mode choix', () => {
  const juste = proposition({ id: 'p1', rank: 1, label: 'El gallo', isCorrect: true });
  const fausse = proposition({ id: 'p2', rank: 2, label: 'El diablito', isCorrect: false });

  it('ne reproche rien a deux propositions dont une juste', () => {
    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [juste, fausse],
      acceptedAnswers: [],
    });

    expect(raison).toBeNull();
  });

  it('reclame une deuxieme proposition quand il n y en a qu une', () => {
    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [juste],
      acceptedAnswers: [],
    });

    expect(raison).toBe('tropPeuDePropositions');
  });

  /**
   * L ordre des reproches n est pas cosmetique : une question a qui il manque
   * des propositions ET une juste doit entendre le reproche sur lequel elle
   * peut agir maintenant. Reclamer une bonne reponse parmi zero proposition
   * serait une impasse de plus. Et c est exactement l etat ou nait toute
   * question en `choix`.
   */
  it('reclame des propositions a une question qui vient de naitre', () => {
    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [],
      acceptedAnswers: [],
    });

    expect(raison).toBe('tropPeuDePropositions');
  });

  /**
   * ⛔ LE TROU QUE LE SERVEUR N ATTRAPE PAS. `optionSchema` veut
   * `label !== null || imageId !== null`, et la CHECK
   * `Quiz_Option_label_ou_image_check` dit la meme chose. Une chaine VIDE n est
   * pas `null` : elle passe les deux, et la classe voit un bouton blanc. Cette
   * garde est donc la seule, pas une redite.
   */
  it('refuse une proposition qui n affiche ni texte ni image', () => {
    const vide = proposition({ id: 'p2', rank: 2, label: '   ', imageId: null });

    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [juste, vide],
      acceptedAnswers: [],
    });

    expect(raison).toBe('propositionVide');
  });

  it('accepte une proposition sans texte mais avec une image', () => {
    const enImage = proposition({ id: 'p2', rank: 2, label: null, imageId: 'img-1' });

    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [juste, enImage],
      acceptedAnswers: [],
    });

    expect(raison).toBeNull();
  });

  it('reclame la designation de la bonne reponse quand aucune n est juste', () => {
    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [fausse, proposition({ id: 'p3', rank: 2, label: 'La dama' })],
      acceptedAnswers: [],
    });

    expect(raison).toBe('justeNonDesignee');
  });

  /**
   * Un groupe de `radio` ne laisse pas deux cases cochees, donc cet etat ne
   * vient pas de l ecran. Il vient du serveur, et le reproche mirroite
   * `assertJouable`, qui refuse `justes !== 1` et non `justes === 0`. Les deux
   * gardes restent ainsi en phase.
   */
  it('reclame la meme chose quand deux se declarent justes', () => {
    const autreJuste = proposition({ id: 'p2', rank: 2, label: 'El diablito', isCorrect: true });

    const raison = raisonInenregistrable({
      answerMode: 'choix',
      options: [juste, autreJuste],
      acceptedAnswers: [],
    });

    expect(raison).toBe('justeNonDesignee');
  });
});

describe('raisonInenregistrable, en mode saisie', () => {
  it('ne reproche rien des qu une reponse est acceptee', () => {
    const raison = raisonInenregistrable({
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: ['la casa'],
    });

    expect(raison).toBeNull();
  });

  /**
   * Les propositions sont ignorees en saisie : `enregistrer` n envoie meme pas
   * le champ. Une question basculee de `choix` a `saisie` garde ses
   * propositions en memoire sans que ca la rende injouable.
   */
  it('ignore les propositions restees en memoire', () => {
    const orpheline = proposition({ id: 'p1', rank: 1, label: '  ', isCorrect: false });

    const raison = raisonInenregistrable({
      answerMode: 'saisie',
      options: [orpheline],
      acceptedAnswers: ['la casa'],
    });

    expect(raison).toBeNull();
  });

  it('reclame au moins une reponse acceptee', () => {
    const raison = raisonInenregistrable({
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: [],
    });

    expect(raison).toBe('aucuneReponseAcceptee');
  });
});
