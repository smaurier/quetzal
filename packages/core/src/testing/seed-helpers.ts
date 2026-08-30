import { rootPrisma, newId } from '@quetzal/db';

export async function seedTenant(name = 'Test Tenant'): Promise<{ tenantId: string; ownerId: string }> {
  const ownerId = newId();
  const tenantId = newId();
  await rootPrisma.user.create({
    data: { id: ownerId, email: `${ownerId}@test.dev`, name, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  });
  await rootPrisma.organization.create({
    data: { id: tenantId, slug: `test-${tenantId}`, name, createdAt: new Date() },
  });
  await rootPrisma.member.create({
    data: { id: newId(), userId: ownerId, organizationId: tenantId, role: 'owner', createdAt: new Date() },
  });
  return { tenantId, ownerId };
}
