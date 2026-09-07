import { rootPrisma, newId } from '@quetzal/db';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from '../src/infrastructure/traditional-deck.js';
import { manifest } from '../src/manifest.js';

/**
 * Idempotent : relancé sur une base déjà amorcée, il ne crée aucun doublon.
 * C est la même exigence que le seed du noyau, et pour la même raison — il
 * tourne à chaque déploiement.
 */
async function main(): Promise<void> {
  const tenantSlug = process.env['SEED_TENANT_SLUG'] ?? 'default';
  const organization = await rootPrisma.organization.findFirst({ where: { slug: tenantSlug } });
  if (organization === null) throw new Error(`Locataire introuvable : ${tenantSlug}`);

  const owner = await rootPrisma.member.findFirst({ where: { organizationId: organization.id } });
  if (owner === null) throw new Error(`Aucun membre dans le locataire ${tenantSlug}`);

  // Le catalogue Module d abord : TenantModule.moduleSlug le référence, et le
  // seed du noyau n y inscrit que hello, en dur. Sans cette étape, l activation
  // échoue en P2003 — c est à chaque module de s inscrire lui-même.
  await rootPrisma.module.upsert({
    where: { slug: manifest.slug },
    create: {
      slug: manifest.slug,
      version: manifest.version,
      contractVersion: manifest.contractVersion,
      enabledByDefault: manifest.enabledByDefault,
      metadata: { name: manifest.name },
    },
    update: { version: manifest.version, contractVersion: manifest.contractVersion },
  });

  await rootPrisma.tenantModule.upsert({
    where: { tenantId_moduleSlug: { tenantId: organization.id, moduleSlug: manifest.slug } },
    create: { tenantId: organization.id, moduleSlug: manifest.slug, enabled: true },
    update: { enabled: true },
  });

  const existing = await rootPrisma.loto_Deck.findFirst({
    where: { tenantId: organization.id, isTemplate: true, name: TRADITIONAL_DECK_NAME },
  });
  if (existing !== null) {
    console.log(`[seed:loto] modèle déjà présent (${existing.id})`);
    return;
  }

  const deckId = newId();
  await rootPrisma.loto_Deck.create({
    data: {
      id: deckId,
      tenantId: organization.id,
      name: TRADITIONAL_DECK_NAME,
      isTemplate: true,
      createdBy: owner.userId,
    },
  });
  await rootPrisma.loto_Card.createMany({
    data: TRADITIONAL_CARDS.map((card) => ({
      id: newId(),
      tenantId: organization.id,
      deckId,
      rank: card.rank,
      label: card.label,
      imageId: null,
    })),
  });

  console.log(`[seed:loto] ${String(TRADITIONAL_CARDS.length)} cartes créées (${deckId})`);
}

await main();
await rootPrisma.$disconnect();
