import type { Type } from '@nestjs/common';
import { rootPrisma, Prisma } from '@quetzal/db';
import { logger, CONTRACT_VERSION, manifestSchema, type QuetzalModuleManifest } from '@quetzal/core';

export function validateContractVersion(manifestVersion: string, coreVersion: string): void {
  const manifestMajor = manifestVersion.split('.')[0];
  const coreMajor = coreVersion.split('.')[0];
  if (manifestMajor !== coreMajor) {
    throw new Error(`Module contract version ${manifestVersion} incompatible with core ${coreVersion}`);
  }
}

export async function loadManifests(slugs: string[]): Promise<QuetzalModuleManifest[]> {
  const manifests: QuetzalModuleManifest[] = [];
  for (const slug of slugs) {
    const mod = await import(`@quetzal/module-${slug}`);
    const manifest = mod.manifest as QuetzalModuleManifest;
    manifestSchema.parse(manifest);
    validateContractVersion(manifest.contractVersion, CONTRACT_VERSION);
    manifests.push(manifest);
    logger.info({ slug, version: manifest.version }, 'module loaded');
  }
  return manifests;
}

export async function upsertModuleCatalogue(manifests: QuetzalModuleManifest[]): Promise<void> {
  for (const m of manifests) {
    const metadata = { name: m.name, description: m.description } as Prisma.InputJsonValue;
    await rootPrisma.module.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        version: m.version,
        contractVersion: m.contractVersion,
        enabledByDefault: m.enabledByDefault,
        metadata,
      },
      update: {
        version: m.version,
        contractVersion: m.contractVersion,
        metadata,
      },
    });
  }
}

export function composeAppModules(manifests: QuetzalModuleManifest[]): Type<unknown>[] {
  return manifests.map(m => m.apiModule);
}
