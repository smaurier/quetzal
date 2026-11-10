import { normaliser, type ReglesDeSaisie } from './normalisation.js';

export interface OptionJouable {
  readonly id: string;
  readonly isCorrect: boolean;
}

export type QuestionJouable =
  | { readonly answerMode: 'choix'; readonly options: readonly OptionJouable[] }
  | {
      readonly answerMode: 'saisie';
      readonly acceptedAnswers: readonly string[];
      readonly regles: ReglesDeSaisie;
    };

/** Ce que l'élève a envoyé. Les deux champs sont exclusifs, et le mode décide. */
export interface ReponseRecue {
  readonly optionId?: string;
  readonly texte?: string;
}

/**
 * La seule règle qui décide juste ou faux. Pure, sans accès à la base, sans
 * horloge, ce qui la rend testable en entier, et c'est l'intérêt.
 *
 * ⛔ Une réponse envoyée dans la forme de l'AUTRE mode est fausse, jamais une
 * erreur : un client malveillant qui enverrait `{ optionId }` à une question en
 * saisie ne doit obtenir ni un point ni une exception à exploiter.
 */
export function estJuste(question: QuestionJouable, recue: ReponseRecue): boolean {
  if (question.answerMode === 'choix') {
    if (recue.optionId === undefined) return false;
    return question.options.some((option) => option.id === recue.optionId && option.isCorrect);
  }

  if (recue.texte === undefined) return false;
  const propose = normaliser(recue.texte, question.regles);
  if (propose === '') return false;
  // Les DEUX côtés sont normalisés : normaliser seulement la saisie laisserait
  // passer `la casa` et refuser `La Casa` écrit dans les réponses acceptées.
  return question.acceptedAnswers.some(
    (acceptee) => normaliser(acceptee, question.regles) === propose);
}
