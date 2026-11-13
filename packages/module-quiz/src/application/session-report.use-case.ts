import { Injectable } from '@nestjs/common';
import { SessionNotFoundError } from '../domain/errors.js';
import type {
  AnswerRow,
  FrozenQuestion,
  Participant,
  SessionRepository,
} from '../domain/ports/session.repository.js';

export interface LigneDeClassement {
  participantId: string;
  label: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  /** ⛔ Distinct de `wrongCount` : une absence n'est pas une erreur. */
  missingCount: number;
}

export interface ReponseDuRapport {
  participantId: string;
  authorGuestId: string;
  isCorrect: boolean;
  elapsedMs: number;
  points: number;
}

export interface QuestionDuRapport {
  sessionQuestionId: string;
  rank: number;
  prompt: string;
  answerCount: number;
  correctCount: number;
  answers: readonly ReponseDuRapport[];
}

export interface RapportDeSeance {
  sessionId: string;
  mode: string;
  questionCount: number;
  participantCount: number;
  questions: readonly QuestionDuRapport[];
  classement: readonly LigneDeClassement[];
}

/**
 * Le nom d'affichage d'un participant. Un nom choisi gagne ; sinon un membre
 * unique prête le sien, et au-delà c'est le numéro.
 *
 * Même décision que `teamNameFor` du loto (issue #29) : `null` est le cas
 * normal, pas un cas dégradé.
 */
export function labelDuParticipant(participant: Participant): string {
  const choisi = participant.name?.trim();
  if (choisi !== undefined && choisi !== '') return choisi;
  if (participant.memberNames.length === 1) return participant.memberNames[0] ?? '';
  return String(participant.participantIndex);
}

/** Seules les questions JOUÉES comptent : une question figée mais jamais ouverte n'a pas « échoué ». */
export function questionsJouees(questions: readonly FrozenQuestion[]): FrozenQuestion[] {
  return questions.filter((q) => q.openedAt !== null);
}

/**
 * Le seul classement : le retour de séance et le « meneur » annoncé à la fin
 * s'en servent tous deux, pour ne jamais désigner deux gagnants.
 *
 * Départage : score, puis réponses justes, puis label, puis numéro d'arrivée.
 * Le dernier critère rend l'ordre total, y compris pour deux labels identiques.
 */
export function construireClassement(
  participants: readonly Participant[],
  jouees: readonly FrozenQuestion[],
  reponses: readonly AnswerRow[]): LigneDeClassement[] {
  const idsJouees = new Set(jouees.map((q) => q.id));

  return participants
    .map((participant) => {
      const siennes = reponses.filter(
        (r) => r.participantId === participant.id && idsJouees.has(r.sessionQuestionId));
      const correctCount = siennes.filter((r) => r.isCorrect).length;
      return {
        participantIndex: participant.participantIndex,
        ligne: {
          participantId: participant.id,
          label: labelDuParticipant(participant),
          score: participant.score,
          correctCount,
          wrongCount: siennes.length - correctCount,
          // ⛔ Une ABSENCE, et non une erreur : un élève dont le téléphone a
          // lâché n'a pas raté la question. Les confondre donnerait à Elda un
          // diagnostic faux, sur le seul écran qu'elle regarde après la séance.
          missingCount: jouees.length - siennes.length,
        },
      };
    })
    .sort((a, b) =>
      b.ligne.score - a.ligne.score
      || b.ligne.correctCount - a.ligne.correctCount
      || a.ligne.label.localeCompare(b.ligne.label, 'fr')
      || a.participantIndex - b.participantIndex)
    .map(({ ligne }) => ligne);
}

/**
 * D12 : le retour vit DANS le module, sans port et sans capacité de plateforme.
 * Le retour du loto n'a pas la même forme, il n'a aucune bonne réponse par
 * élève, et fabriquer une abstraction au-dessus de deux choses qui ne se
 * ressemblent pas est exactement ce que #28 évite en attendant un vrai second
 * consommateur.
 */
@Injectable()
export class SessionReportUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(input: { sessionId: string }): Promise<RapportDeSeance> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);

    const toutes = await this.sessions.allAnswers(session.id);
    const jouees = questionsJouees(session.questions);

    const questions: QuestionDuRapport[] = jouees.map((question) => {
      const reponses = toutes.filter((r) => r.sessionQuestionId === question.id);
      return {
        sessionQuestionId: question.id,
        rank: question.rank,
        prompt: question.prompt,
        answerCount: reponses.length,
        correctCount: reponses.filter((r) => r.isCorrect).length,
        answers: reponses.map((r) => ({
          participantId: r.participantId,
          authorGuestId: r.authorGuestId,
          isCorrect: r.isCorrect,
          elapsedMs: r.elapsedMs,
          points: r.points,
        })),
      };
    });

    return {
      sessionId: session.id,
      mode: session.mode,
      questionCount: jouees.length,
      participantCount: session.participants.length,
      questions,
      classement: construireClassement(session.participants, jouees, toutes),
    };
  }
}
