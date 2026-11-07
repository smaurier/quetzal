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
/**
 * ⚠️ Le délai n'est pas un pansement sur une course : chaque cas réimporte
 * `./config.js` pour relire `process.env`, et cet import CONSTRUIT la vraie
 * instance Better-Auth — adaptateur Prisma, greffon d'organisation, greffon JWT
 * avec sa configuration de paire RS256. Mesuré le 07/11 : 3,8 s au premier
 * import, et quatre imports par fichier.
 *
 * Le défaut de Vitest est de 5 s, donc ce fichier vivait sur le fil. Il est
 * tombé le 07/11 dans un `pnpm test` complet, où les paquets tournent en
 * parallèle — « Test timed out in 5000ms » — après être passé trois fois en CI
 * par chance. Un test dont le SUJET coûte quatre secondes à construire n'a rien
 * à faire sous un plafond de cinq.
 */
describe('config auth', { timeout: 30_000 }, () => {
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

  /**
   * DEUX imports, et non quatre.
   *
   * Chaque cas appelle `vi.resetModules()` puis réimporte `./config.js`, ce qui
   * vide le registre et refait payer TOUTE la chaîne. Mesuré le 07/11, et ce
   * n est pas là où on l attend : `import 'better-auth'` coûte **3,5 s** et ses
   * greffons **1,4 s**, contre 0,45 s pour `@quetzal/db` — le gros du temps est
   * le chargement de la bibliothèque sous la transformation de Vitest, pas la
   * construction de la config.
   *
   * Quatre cas faisaient donc quatre fois cinq secondes : ce fichier passait
   * seul et dépassait **30 s** dans un `pnpm test` complet, où les paquets
   * tournent en parallèle. Le plafond était déjà passé de 5 à 30 s ; le relever
   * une seconde fois serait traiter le symptôme deux fois. Le seul vrai levier
   * est le NOMBRE d imports.
   *
   * D où UN seul, et c est suffisant parce que la question posée ici est
   * BINAIRE : `config.ts` passe-t-il `process.env` à la dérivation, oui ou non.
   * Un environnement de production y répond pour `baseURL` et pour
   * `trustedOrigins` à la fois. Le repli sur `HOST_URL` hors de Vercel emprunte
   * exactement le même chemin de code, et ses cas sont épinglés par
   * `origines-de-confiance.spec.ts`, pur et instantané — un second import ne
   * prouverait rien de plus et coûterait cinq secondes de contention.
   *
   * Ce que ce fichier doit prouver est le BRANCHEMENT — que `config.ts`
   * consomme bien la dérivation — et un seul environnement de production le
   * prouve pour `baseURL` ET `trustedOrigins` à la fois. La matrice des cas
   * (aperçu, branche, hôte nu, doublon, joker) vit dans
   * `origines-de-confiance.spec.ts`, qui est pur et instantané : c est là
   * qu elle coûte le moins et qu elle se lit le mieux.
   */
  it('derive baseURL ET les origines de confiance, malgre un HOST_URL faux', async () => {
    const options = await optionsAvec({
      VERCEL_ENV: 'production',
      VERCEL_URL: APERCU,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });

    expect(options.baseURL, 'le domaine de production, pas celui du deploiement').toBe(
      `https://${PROD}`,
    );
    expect(options.trustedOrigins).toContain(`https://${PROD}`);
    expect(options.trustedOrigins, 'l apercu qui sert la requete reste accepte').toContain(
      `https://${APERCU}`,
    );
  });
});
