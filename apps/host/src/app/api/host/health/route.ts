// Le SOUS-CHEMIN plutot que `@quetzal/core` tout court : l index du noyau tire
// le bus d evenements, le registre d invites, l adaptateur de handshake et le
// journal, c est-a-dire tout le serveur, dans le bundle Next. Meme esprit que
// CLAUDE.md §3, ou le host n importe jamais l entree racine d un module.
import { empreinteDuBuild } from '@quetzal/core/empreinte-du-build';

/**
 * QUEL COMMIT LE HOST SERT-IL ?
 *
 * ⛔ `/api/host/health` et NON `/api/health`, et c est le piege central de
 * cette issue : `next.config.ts` REECRIT `/api/health` vers l API Render
 * (`{ source: '/api/health', destination: ... }`). Un temoin pose la-bas
 * interrogerait donc RENDER en croyant mesurer Vercel, et repondrait vert quoi
 * qu il arrive au host.
 *
 * Mesure du 07/11 : les deux URL rendaient la MEME empreinte, `a772cc6451f0`.
 * C est aussi pourquoi personne n avait remarque que le host n avait pas de
 * temoin — il avait l air d en avoir un.
 *
 * Issue #69. `verifier-la-prod.mjs` ne savait poser la question qu a l API,
 * servie par Render. Rien n interrogeait Vercel — or #64, la connexion cassee
 * en production, vivait dans le host, et le script repondait « la prod sert
 * bien origin/main » pendant que personne ne pouvait se connecter. Pour savoir
 * si le correctif etait reellement en ligne, le 07/11, il a fallu sortir du
 * depot et interroger l API de Vercel avec un jeton. Cette route rend sa
 * reponse au script.
 *
 * Miroir exact de `/api/health` de l API : meme forme, meme empreinte, meme
 * code — `empreinteDuBuild` vit dans `@quetzal/core` precisement pour qu il n y
 * en ait pas deux.
 */

/**
 * ⛔ `force-dynamic` n est pas decoratif. Sans lui, Next peut figer cette route
 * au build, et le cache Turborepo peut resservir un build fabrique pour un
 * AUTRE commit : la route attesterait alors un commit qui n est pas celui qui
 * tourne, c est-a-dire exactement le mensonge que ce temoin existe pour rendre
 * impossible. On lit la variable a l execution.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    build: empreinteDuBuild(process.env),
  });
}
