import type { Participant } from './ports/session.repository.js';

/**
 * Le nom d'affichage d'un participant. Un nom choisi gagne ; sinon un membre
 * unique prête le sien, et au-delà c'est le numéro.
 *
 * Même décision que `teamNameFor` du loto (issue #29) : `null` est le cas
 * normal, pas un cas dégradé.
 */
export function labelDuParticipant(
  participant: Pick<Participant, 'name' | 'memberNames' | 'participantIndex'>): string {
  const choisi = participant.name?.trim();
  if (choisi !== undefined && choisi !== '') return choisi;
  if (participant.memberNames.length === 1) return participant.memberNames[0] ?? '';
  return String(participant.participantIndex);
}
