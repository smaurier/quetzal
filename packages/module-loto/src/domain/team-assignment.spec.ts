import { describe, it, expect } from 'vitest';
import { assignTeam, type TeamLoad } from './team-assignment.js';
import { InvalidTeamLimitError } from './errors.js';

const teams = (...counts: number[]): TeamLoad[] =>
  counts.map((memberCount, i) => ({ id: `t${i + 1}`, memberCount }));

describe('assignTeam', () => {
  it('crée une équipe tant que le maximum n est pas atteint', () => {
    expect(assignTeam(teams(), 6)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(1, 1, 1), 6)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(1, 1, 1, 1, 1), 6)).toEqual({ kind: 'new' });
  });

  it('remplit une équipe existante une fois le maximum atteint', () => {
    expect(assignTeam(teams(1, 1, 1, 1, 1, 1), 6)).toEqual({ kind: 'existing', teamId: 't1' });
  });

  it('choisit toujours l équipe la moins remplie', () => {
    expect(assignTeam(teams(3, 1, 2, 2, 2, 2), 6)).toEqual({ kind: 'existing', teamId: 't2' });
  });

  it('à effectifs égaux, choisit la première, ce qui rend la répartition déterministe', () => {
    expect(assignTeam(teams(2, 2, 2, 2, 2, 2), 6)).toEqual({ kind: 'existing', teamId: 't1' });
  });

  it('accepte que les équipes finissent inégales', () => {
    let loads = teams();
    for (let i = 0; i < 32; i++) {
      const decision = assignTeam(loads, 6);
      if (decision.kind === 'new') {
        loads = [...loads, { id: `t${loads.length + 1}`, memberCount: 1 }];
      } else {
        loads = loads.map((t) => (t.id === decision.teamId ? { ...t, memberCount: t.memberCount + 1 } : t));
      }
    }
    expect(loads).toHaveLength(6);
    expect(loads.reduce((sum, t) => sum + t.memberCount, 0)).toBe(32);
    const counts = loads.map((t) => t.memberCount).sort((a, b) => a - b);
    expect(counts[counts.length - 1]! - counts[0]!).toBeLessThanOrEqual(1);
  });

  it('avec un maximum d une seule équipe, tout le monde joue ensemble', () => {
    expect(assignTeam(teams(), 1)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(5), 1)).toEqual({ kind: 'existing', teamId: 't1' });
  });

  it('refuse un maximum d équipes nul', () => {
    let error: unknown;
    try {
      assignTeam(teams(), 0);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InvalidTeamLimitError);
  });

  it('refuse un maximum d équipes négatif', () => {
    let error: unknown;
    try {
      assignTeam(teams(), -1);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InvalidTeamLimitError);
  });
});
