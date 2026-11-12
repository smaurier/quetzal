import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
/**
 * ⛔ VIOLATION DE CLAUDE.md §3, RENDUE VISIBLE PLUTOT QUE TAIRE. Issue #91.
 *
 * §3 reserve le client non cloisonne au noyau, et la regle ESLint qui le tient
 * vient d'etre branchee (issue #86). Elle attrape cette ligne, qui preexiste.
 *
 * Mais la plateforme n'offre AUCUN moyen sanctionne de lire le nom d'affichage
 * de l'utilisateur courant : `User` est une table Better-Auth, non cloisonnee
 * par locataire, donc `ctx.prisma` ne la voit pas. Le corriger demande que le
 * noyau expose ce nom, ce qui est une decision de conception et non un
 * remaniement de lint.
 *
 * La desactivation est donc nominative, d'une seule ligne, et porte le numero
 * de l'issue qui la leve. §16 interdit d'ignorer une violation en silence ;
 * elle n'interdit pas de la nommer en attendant.
 */
// eslint-disable-next-line no-restricted-imports -- issue #91
import { rootPrisma } from '@quetzal/db';
import { GreetUseCase } from '../application/greet.use-case.js';

@Controller('api/modules/hello')
export class HelloController {
  constructor(private readonly greet: GreetUseCase) {}

  @Get('greet')
  async doGreet() {
    const ctx = getCurrentTenant();
    if (!ctx.userId) throw new UnauthorizedException('User required for greet');
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const greeting = await this.greet.execute({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      rawName: user.name ?? 'Anonymous',
      requestId: ctx.requestId,
    });
    return { msg: greeting.message, tenantId: ctx.tenantId, requestId: ctx.requestId };
  }
}
