export interface TeamLoad {
  id: string;
  memberCount: number;
}

export type TeamAssignment = { kind: 'new' } | { kind: 'existing'; teamId: string };

/**
 * Décision D3 : tant qu il reste de la place, chaque arrivant forme sa propre
 * équipe et possède sa tabla. Au-delà, il rejoint la moins remplie. Les équipes
 * finissent donc souvent inégales, ce qui est sans effet sur le jeu.
 */
export function assignTeam(teams: readonly TeamLoad[], maxTeams: number): TeamAssignment {
  if (teams.length < maxTeams) return { kind: 'new' };

  let lightest = teams[0]!;
  for (const team of teams) {
    if (team.memberCount < lightest.memberCount) lightest = team;
  }
  return { kind: 'existing', teamId: lightest.id };
}
