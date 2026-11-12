import type { AnswerMode } from '../../domain/answer-mode.js';

/**
 * Une proposition telle que l'editeur la manipule. Elle differe de celle que le
 * serveur rend : son `id` peut etre LOCAL, fabrique par l'ecran pour une
 * proposition qui n'est pas encore partie.
 *
 * `updateQuestion` remplace les propositions en bloc (`deleteMany` puis
 * `createMany`), donc les identifiants cote serveur sont refrappes a chaque
 * enregistrement. Un `id` local n'a qu'un seul role, et il dure le temps d'une
 * saisie : porter le `key` de React et le `htmlFor` du label.
 */
export interface PropositionEditable {
  readonly id: string;
  readonly rank: number;
  readonly label: string | null;
  readonly imageId: string | null;
  readonly isCorrect: boolean;
}

/** Le plafond de `optionSchema` : `rank` au plus 4, tableau `.max(4)`. */
export const MAX_PROPOSITIONS = 4;

/** Le plancher de `optionSchema` (`.min(2)`) et de `assertJouable`. */
export const MIN_PROPOSITIONS = 2;

export type RaisonInenregistrable =
  | 'tropPeuDePropositions'
  | 'propositionVide'
  | 'justeNonDesignee'
  | 'aucuneReponseAcceptee';

interface QuestionEditable {
  readonly answerMode: AnswerMode;
  readonly options: readonly PropositionEditable[];
  readonly acceptedAnswers: readonly string[];
}

/**
 * Ajoute une proposition vide au bout, sans designer de bonne reponse.
 *
 * Au plafond, rend la liste telle quelle plutot que de lever : l'ecran desactive
 * deja le bouton, et une exception a cet endroit transformerait une borne
 * attendue en incident.
 */
export function ajouterProposition(
  existantes: readonly PropositionEditable[],
  nouvelId: () => string,
): readonly PropositionEditable[] {
  if (existantes.length >= MAX_PROPOSITIONS) return existantes;
  return [
    ...existantes,
    {
      id: nouvelId(),
      rank: existantes.length + 1,
      label: '',
      imageId: null,
      isCorrect: false,
    },
  ];
}

/**
 * Retire une proposition et refrappe les rangs pour qu'ils restent consecutifs.
 *
 * ⛔ `isCorrect` n'est jamais reattribue. Retirer la juste laisse la question
 * sans juste, donc inenregistrable, donc signalee — ce qui est le comportement
 * voulu : la cle de reponse d'une question posee a une classe ne se deplace pas
 * toute seule.
 */
export function retirerProposition(
  existantes: readonly PropositionEditable[],
  id: string,
): readonly PropositionEditable[] {
  return existantes
    .filter((proposition) => proposition.id !== id)
    .map((proposition, index) => ({ ...proposition, rank: index + 1 }));
}

/**
 * ⛔ CETTE FONCTION EXISTE POUR QU'UN REFUS SOIT LISIBLE AVANT L'ENVOI, pas
 * pour remplacer `assertJouable`. Le serveur garde le dernier mot ; l'ecran se
 * contente de ne plus mener Elda dans un mur.
 *
 * Elle attrape en plus un cas que le serveur laisse passer : une proposition
 * dont le texte est une chaine VIDE. `optionSchema` exige
 * `label !== null || imageId !== null` et la CHECK
 * `Quiz_Option_label_ou_image_check` dit la meme chose en SQL — or `''` n'est
 * pas `null`. Une proposition blanche arriverait donc jusqu'a la classe.
 *
 * L'ordre des reproches compte : on reclame d'abord ce sur quoi Elda peut agir
 * tout de suite. Demander une bonne reponse parmi zero proposition serait une
 * impasse de plus.
 */
export function raisonInenregistrable(question: QuestionEditable): RaisonInenregistrable | null {
  if (question.answerMode === 'saisie') {
    return question.acceptedAnswers.length === 0 ? 'aucuneReponseAcceptee' : null;
  }

  if (question.options.length < MIN_PROPOSITIONS) return 'tropPeuDePropositions';
  if (question.options.some((proposition) => rienAAfficher(proposition))) return 'propositionVide';

  const justes = question.options.filter((proposition) => proposition.isCorrect).length;
  return justes === 1 ? null : 'justeNonDesignee';
}

/** Un libellé d'espaces n'affiche rien, et une image absente n'affiche rien non plus. */
function rienAAfficher(proposition: PropositionEditable): boolean {
  return (proposition.label ?? '').trim() === '' && proposition.imageId === null;
}
