import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { empreinteDuBuild, VARIABLES_DE_COMMIT } from './empreinte-du-build';

const empreinteAttendue = (commit: string): string =>
  createHash('sha256').update(commit).digest('hex').slice(0, 12);

/**
 * Issue #69 : `verifier-la-prod.mjs` ne savait demander son commit qu a l API,
 * servie par Render. Rien n interrogeait Vercel — or c est precisement la que
 * vivait #64, et le script repondait « la prod sert bien origin/main » pendant
 * que la connexion etait cassee dans le host.
 *
 * Le calcul deménage donc ici pour que les DEUX applications l appellent. C est
 * tout l enjeu de cette extraction : une seconde copie dans le host aurait
 * derive du format que le script compare, sans qu aucun test ne s en apercoive,
 * et c est le script qui aurait menti.
 *
 * Le format lui-meme est deja epingle par `health.controller.spec.ts`, qui
 * traverse maintenant cette fonction. Ce test-ci garde l unite elle-meme, et
 * surtout la raison d etre de l empreinte : le depot est PUBLIC.
 */
describe('empreinteDuBuild', () => {
  const COMMIT = '40b2c87d1f3a4b5c6d7e8f90123456789abcdef0';

  it('rend une empreinte de douze caracteres hexadecimaux', () => {
    const empreinte = empreinteDuBuild({ RENDER_GIT_COMMIT: COMMIT });
    expect(empreinte).toBe(empreinteAttendue(COMMIT));
    expect(empreinte).toMatch(/^[0-9a-f]{12}$/);
  });

  /**
   * La raison d etre de toute cette mecanique, et la seule chose qu il ne faut
   * jamais « simplifier » : publier le SHA en clair dirait a quiconque quelles
   * versions de dependances tournent, donc quelles CVE connues s appliquent a
   * cette instance. L empreinte permet de VERIFIER un commit attendu sans le
   * REVELER.
   */
  it('ne laisse jamais filtrer le commit lui-meme', () => {
    const empreinte = empreinteDuBuild({ RENDER_GIT_COMMIT: COMMIT });
    expect(empreinte).not.toContain(COMMIT);
    expect(empreinte).not.toBe(COMMIT.slice(0, 12));
  });

  it('rend « unknown » quand aucune variable n est injectee', () => {
    expect(empreinteDuBuild({})).toBe('unknown');
  });

  it('ignore une variable vide, qui ne designe aucun commit', () => {
    expect(empreinteDuBuild({ RENDER_GIT_COMMIT: '' })).toBe('unknown');
  });

  it('accepte la variable de Vercel, celle que le host recoit', () => {
    expect(empreinteDuBuild({ VERCEL_GIT_COMMIT_SHA: COMMIT })).toBe(empreinteAttendue(COMMIT));
  });

  it('accepte la variable generique, porte de sortie d un autre hebergeur', () => {
    expect(empreinteDuBuild({ GIT_COMMIT: COMMIT })).toBe(empreinteAttendue(COMMIT));
  });

  it('prefere Render, puis Vercel, puis la generique', () => {
    expect(
      empreinteDuBuild({
        RENDER_GIT_COMMIT: 'render',
        VERCEL_GIT_COMMIT_SHA: 'vercel',
        GIT_COMMIT: 'generique',
      }),
    ).toBe(empreinteAttendue('render'));
    expect(
      empreinteDuBuild({ VERCEL_GIT_COMMIT_SHA: 'vercel', GIT_COMMIT: 'generique' }),
    ).toBe(empreinteAttendue('vercel'));
  });

  it('rend la meme empreinte deux fois, sinon deux sondes ne seraient pas comparables', () => {
    const env = { RENDER_GIT_COMMIT: COMMIT };
    expect(empreinteDuBuild(env)).toBe(empreinteDuBuild(env));
  });

  /**
   * L ordre est lu par `verifier-la-prod.mjs` ET par les deux applications. Le
   * figer ici evite qu une reecriture le change en silence.
   */
  it('expose l ordre de preference, que le script et les deux apps partagent', () => {
    expect(VARIABLES_DE_COMMIT).toEqual([
      'RENDER_GIT_COMMIT',
      'VERCEL_GIT_COMMIT_SHA',
      'GIT_COMMIT',
    ]);
  });
});
