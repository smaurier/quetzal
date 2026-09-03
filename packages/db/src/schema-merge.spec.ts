import { describe, it, expect } from 'vitest';
import { injectMemberUnique, injectBackRelations } from './schema-merge';

// Better-Auth ≥1.7 generates @@index lines after @@map("member"); the injection must
// still land inside the model, otherwise the composite unique key the seed relies on
// silently disappears (prisma migrate diff wanted to DROP member_userId_organizationId_key).
const memberWithIndexes = `model Member {
  id             String       @id
  organizationId String
  userId         String
  role           String
  createdAt      DateTime

  @@map("member")
  @@index([organizationId])
  @@index([userId])
}`;

const memberLegacy = `model Member {
  id             String       @id
  organizationId String
  userId         String

  @@map("member")
}`;

describe('injectMemberUnique', () => {
  it('adds the composite unique when @@index lines follow @@map', () => {
    const out = injectMemberUnique(memberWithIndexes);
    expect(out).toContain('@@unique([userId, organizationId])');
    expect(out.trim().endsWith('}')).toBe(true);
  });

  it('adds the composite unique on the legacy shape too', () => {
    expect(injectMemberUnique(memberLegacy)).toContain('@@unique([userId, organizationId])');
  });

  it('does not duplicate the unique when applied twice', () => {
    const once = injectMemberUnique(memberWithIndexes);
    expect(injectMemberUnique(once).match(/@@unique\(\[userId, organizationId\]\)/g)).toHaveLength(1);
  });
});

describe('injectBackRelations', () => {
  it('adds auditLogs to User and tenantModules to Organization', () => {
    const schema = `model User {\n  id String @id\n\n  @@map("user")\n  @@index([email])\n}\nmodel Organization {\n  id String @id\n\n  @@map("organization")\n}`;
    const out = injectBackRelations(schema);
    expect(out).toContain('auditLogs     AuditLog[]');
    expect(out).toContain('tenantModules TenantModule[]');
  });
});
