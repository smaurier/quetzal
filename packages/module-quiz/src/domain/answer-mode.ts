export const ANSWER_MODES = ['choix', 'saisie'] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export function isAnswerMode(valeur: string): valeur is AnswerMode {
  return (ANSWER_MODES as readonly string[]).includes(valeur);
}
