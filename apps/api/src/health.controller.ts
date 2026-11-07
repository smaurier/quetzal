import { Controller, Get } from '@nestjs/common';
import { empreinteDuBuild } from '@quetzal/core';

@Controller('api/health')
export class HealthController {
  /** Calculee une fois par instance. Render sonde cette route en boucle
   *  (`healthCheckPath: /api/health` dans `render.yaml`) et le controleur est un
   *  singleton Nest : inutile de rehacher a chaque sonde. */
  private readonly empreinte = empreinteDuBuild(process.env);

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      build: this.empreinte,
    };
  }
}
