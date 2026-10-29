import { Controller, Get } from '@nestjs/common';
import { createHash } from 'node:crypto';

/** Variables injectées par les hébergeurs, par ordre de préférence. Render pour
 *  cette API, Vercel pour l'hôte, `GIT_COMMIT` comme porte de sortie générique
 *  si l'API est déployée ailleurs un jour. */
const VARIABLES_DE_COMMIT = [
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_COMMIT',
] as const;

const LONGUEUR_EMPREINTE = 12;

@Controller('api/health')
export class HealthController {
  /** Calculée une fois par instance. Render sonde cette route en boucle
   *  (`healthCheckPath: /api/health` dans `render.yaml`) et le contrôleur est un
   *  singleton Nest : inutile de rehacher à chaque sonde. */
  private empreinte?: string;

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      build: this.empreinteDuBuild(),
    };
  }

  /**
   * L'empreinte du commit déployé, et NON le commit.
   *
   * Pourquoi une empreinte et pas le SHA : ce dépôt est **public**. Publier le
   * commit exact qui tourne reviendrait à publier la liste des versions de
   * dépendances en production, donc la liste des CVE connues qui s'appliquent à
   * cette instance. Un SHA-256 tronqué renverse la charge : qui connaît le
   * commit attendu peut le recalculer et comparer, qui ne le connaît pas
   * n'apprend rien.
   *
   * Vérification, depuis un clone à jour :
   *   node -e "console.log(require('crypto').createHash('sha256')
   *     .update('<sha>').digest('hex').slice(0,12))"
   *
   * `unknown` n'est pas une erreur : c'est le cas d'un lancement local, ou d'un
   * hébergeur qui n'injecte aucune des variables ci-dessus. Si la production
   * répond `unknown`, c'est la variable qu'il faut déclarer, pas ce code.
   */
  private empreinteDuBuild(): string {
    if (this.empreinte === undefined) {
      const commit = VARIABLES_DE_COMMIT.map((nom) => process.env[nom]).find(
        (valeur) => valeur,
      );
      this.empreinte = commit
        ? createHash('sha256').update(commit).digest('hex').slice(0, LONGUEUR_EMPREINTE)
        : 'unknown';
    }
    return this.empreinte;
  }
}
