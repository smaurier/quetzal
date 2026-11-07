import { describe, it, expect } from 'vitest';
import {
  originesDeConfiance,
  urlDeBase,
  URL_LOCALE_PAR_DEFAUT,
} from './origines-de-confiance';

/**
 * Issue #64 : plus personne ne pouvait se connecter en production. Better-Auth
 * repondait 403 `INVALID_ORIGIN` avant meme de regarder le mot de passe, parce
 * que `trustedOrigins` vaut `[baseURL]` par defaut et que `baseURL` valait
 * `HOST_URL`, une variable tenue a la main.
 *
 * Le defaut n est pas que cette variable ait eu la mauvaise valeur : c est qu
 * une valeur unique etait demandee a couvrir deux cibles que Vercel sert sur
 * des URL differentes, la production ET chaque apercu. Aucune valeur ne pouvait
 * satisfaire les deux, donc l une des deux etait forcement cassee.
 *
 * On ne tient donc plus la liste a la main : on la derive de ce que Vercel
 * injecte dans chaque deploiement. Ce module est pur pour que ce test puisse
 * exister : la suite e2e tourne sur `localhost:3010`, ou `HOST_URL` est juste,
 * et ne pouvait rien attraper ici.
 */
describe('originesDeConfiance', () => {
  const PROD = 'quetzal-theta.vercel.app';
  const APERCU = 'quetzal-abc123-smauriers-projects.vercel.app';
  const BRANCHE = 'quetzal-git-main-smauriers-projects.vercel.app';

  it('fait confiance au domaine de production', () => {
    const origines = originesDeConfiance({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(origines).toContain(`https://${PROD}`);
  });

  it('fait confiance a l URL du deploiement courant, apercus compris', () => {
    const origines = originesDeConfiance({
      VERCEL_ENV: 'preview',
      VERCEL_URL: APERCU,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(origines).toContain(`https://${APERCU}`);
  });

  it('fait confiance a l URL de branche', () => {
    const origines = originesDeConfiance({ VERCEL_BRANCH_URL: BRANCHE });
    expect(origines).toContain(`https://${BRANCHE}`);
  });

  it('garde HOST_URL, seule source en local et en CI', () => {
    expect(originesDeConfiance({ HOST_URL: 'http://localhost:3010' })).toEqual([
      'http://localhost:3010',
    ]);
  });

  it('retombe sur le defaut local quand rien n est defini', () => {
    expect(originesDeConfiance({})).toEqual([URL_LOCALE_PAR_DEFAUT]);
  });

  it('ramene une origine nue a une origine complete', () => {
    expect(originesDeConfiance({ HOST_URL: `${PROD}/` })).toEqual([`https://${PROD}`]);
  });

  it('retire le chemin et le slash final d une URL deja complete', () => {
    expect(originesDeConfiance({ HOST_URL: `https://${PROD}/api/auth/` })).toEqual([
      `https://${PROD}`,
    ]);
  });

  it('ne repete pas une origine donnee par deux variables', () => {
    const origines = originesDeConfiance({
      HOST_URL: `https://${PROD}`,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
      VERCEL_URL: PROD,
    });
    expect(origines).toEqual([`https://${PROD}`]);
  });

  it('ignore une variable vide', () => {
    expect(originesDeConfiance({ HOST_URL: 'http://localhost:3000', VERCEL_URL: '' })).toEqual([
      'http://localhost:3000',
    ]);
  });

  /**
   * Le reflexe, pour reparer les apercus, est d ecrire `*.vercel.app` — c est
   * meme l exemple de la doc de better-auth. Ce serait faire confiance au
   * deploiement de n importe qui, donc offrir le CSRF a tout le monde. On ne
   * nomme que les hotes que la plateforme nous donne.
   */
  it('ne produit jamais de joker', () => {
    const origines = originesDeConfiance({
      HOST_URL: 'http://localhost:3000',
      VERCEL_ENV: 'production',
      VERCEL_URL: APERCU,
      VERCEL_BRANCH_URL: BRANCHE,
      VERCEL_PROJECT_PRODUCTION_URL: PROD,
    });
    expect(origines.some((origine) => origine.includes('*') || origine.includes('?'))).toBe(false);
  });
});

describe('urlDeBase', () => {
  const PROD = 'quetzal-theta.vercel.app';
  const APERCU = 'quetzal-abc123-smauriers-projects.vercel.app';

  it('vaut le domaine de production en production', () => {
    expect(
      urlDeBase({
        VERCEL_ENV: 'production',
        VERCEL_URL: APERCU,
        VERCEL_PROJECT_PRODUCTION_URL: PROD,
        HOST_URL: 'http://localhost:3000',
      }),
    ).toBe(`https://${PROD}`);
  });

  it('vaut l URL du deploiement sur un apercu', () => {
    expect(
      urlDeBase({
        VERCEL_ENV: 'preview',
        VERCEL_URL: APERCU,
        VERCEL_PROJECT_PRODUCTION_URL: PROD,
      }),
    ).toBe(`https://${APERCU}`);
  });

  it('vaut HOST_URL hors de Vercel', () => {
    expect(urlDeBase({ HOST_URL: 'http://localhost:3010' })).toBe('http://localhost:3010');
  });

  it('retombe sur le defaut local quand rien n est defini', () => {
    expect(urlDeBase({})).toBe(URL_LOCALE_PAR_DEFAUT);
  });
});
