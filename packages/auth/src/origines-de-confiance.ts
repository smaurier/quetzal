/**
 * D ou vient la liste des origines auxquelles Better-Auth fait confiance.
 *
 * Issue #64. `trustedOrigins` vaut `[baseURL]` par defaut, et `baseURL` valait
 * `HOST_URL`, une variable tenue a la main et definie avec UNE SEULE valeur
 * pour la production et pour les apercus. Or Vercel sert chaque apercu sur une
 * URL differente : aucune valeur unique ne pouvait satisfaire les deux, donc
 * l une des deux etait forcement refusee. C etait la production.
 *
 * On derive donc la liste de ce que la plateforme injecte dans chaque
 * deploiement, plutot que de la tenir. `HOST_URL` reste la source en local et
 * en CI, ou aucune variable Vercel n existe.
 *
 * Deux proprietes a ne pas perdre de vue en relisant ce module :
 *
 * 1. Rien ici ne vient de la requete. Faire confiance a l hote annonce par l
 *    appelant reviendrait a n avoir aucun controle d origine du tout.
 * 2. Aucun joker. `*.vercel.app` reparerait les apercus d une ligne, et c est
 *    meme l exemple de la doc de better-auth, mais ce serait faire confiance
 *    au deploiement de n importe qui.
 */

export interface EnvironnementDeDeploiement {
  readonly HOST_URL?: string | undefined;
  readonly VERCEL_ENV?: string | undefined;
  readonly VERCEL_URL?: string | undefined;
  readonly VERCEL_BRANCH_URL?: string | undefined;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
}

export const URL_LOCALE_PAR_DEFAUT = 'http://localhost:3000';

/**
 * Les variables de Vercel portent un nom d hote nu, sans schema : `VERCEL_URL`
 * vaut `mon-site.vercel.app`. `HOST_URL`, elle, porte une URL complete. On
 * accepte les deux formes et on ne garde que l origine.
 */
function origineCanonique(valeur: string | undefined): string | null {
  const brut = valeur?.trim();
  if (!brut) return null;
  const avecSchema = /^https?:\/\//.test(brut) ? brut : `https://${brut}`;
  try {
    return new URL(avecSchema).origin;
  } catch {
    return null;
  }
}

/**
 * Toutes les origines sous lesquelles ce projet repond, dans l ordre ou on les
 * prefere. Les trois variables Vercel sont ajoutees quel que soit `VERCEL_ENV`,
 * pour qu un apercu promu en production reste joignable sous les deux noms.
 */
export function originesDeConfiance(env: EnvironnementDeDeploiement): readonly string[] {
  const candidates = [
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.HOST_URL,
  ];
  const origines = [
    ...new Set(candidates.map(origineCanonique).filter((o): o is string => o !== null)),
  ];
  return origines.length > 0 ? origines : [URL_LOCALE_PAR_DEFAUT];
}

/**
 * L URL que Better-Auth considere comme la sienne. En production c est le
 * domaine de production et non celui du deploiement : ce dernier est immuable
 * et porte un nom que personne ne visite.
 */
export function urlDeBase(env: EnvironnementDeDeploiement): string {
  const preferee =
    env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  return origineCanonique(preferee) ?? origineCanonique(env.HOST_URL) ?? URL_LOCALE_PAR_DEFAUT;
}
