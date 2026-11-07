import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Issue #64, reproduit sans reseau ni base.
 *
 * `origines-de-confiance.spec.ts` prouve la DERIVATION. Ce test-ci prouve le
 * BRANCHEMENT : que la config Better-Auth consomme bien cette derivation. Sans
 * lui, on pourrait debrancher `trustedOrigins` de `config.ts` sans qu aucun
 * test ne rougisse, et le defaut reviendrait intact.
 *
 * L environnement monte ici est celui qui cassait la production : un `HOST_URL`
 * tenu a la main qui ne designe PAS le domaine de production. C est tout ce qu
 * il fallait pour que personne ne puisse se connecter.
 *
 * `rootPrisma` est un Proxy paresseux (cf `packages/db/src/clients.ts`), donc
 * construire la config ne touche aucune base. On lit `auth.options` et non
 * `auth.$context`, qui lui initialiserait l adaptateur.
 */
describe('config auth', () => {
  const PROD = 'quetzal-theta.vercel.app';
  const APERCU = 'quetzal-abc123-smauriers-projects.vercel.app';

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('HOST_URL', 'https://une-valeur-qui-ne-designe-pas-la-prod.example');
    vi.stubEnv('BETTER_AUTH_SECRET', 'secret-de-test-sans-valeur');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function optionsAvec(env: Record<string, string>) {
    for (const [cle, valeur] of Object.entries(env)) vi.stubEnv(cle, valeur);
    const { auth } = await import('./config.js');
    return auth.options;
  }

  it('fait confiance au domaine de production malgre un HOST_URL faux', async () => {
    const options = await optionsAvec({
      VERCEL_ENV: 'production',
      VERCEL_URL: APERCU,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(options.trustedOrigins).toContain(`https://${PROD}`);
  });

  it('fait confiance a l apercu qui sert la requete', async () => {
    const options = await optionsAvec({
      VERCEL_ENV: 'preview',
      VERCEL_URL: APERCU,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(options.trustedOrigins).toContain(`https://${APERCU}`);
  });

  it('prend le domaine de production comme baseURL en production', async () => {
    const options = await optionsAvec({
      VERCEL_ENV: 'production',
      VERCEL_URL: APERCU,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(options.baseURL).toBe(`https://${PROD}`);
  });

  it('garde HOST_URL hors de Vercel, ou il est la seule source', async () => {
    vi.stubEnv('HOST_URL', 'http://localhost:3010');
    const options = await optionsAvec({});
    expect(options.baseURL).toBe('http://localhost:3010');
    expect(options.trustedOrigins).toContain('http://localhost:3010');
  });
});
