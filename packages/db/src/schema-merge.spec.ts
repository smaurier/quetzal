import { describe, it, expect } from 'vitest';
import { injectMemberUnique, injectAccountUnique, injectBackRelations } from './schema-merge';

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

// Better-Auth 1.7.3 a reverte `issuer` et avec lui l'index unique
// account_issuer_accountId_uidx : son CLI ne genere plus aucune contrainte
// d'unicite sur Account. L'identite d'un compte est portee par
// (providerId, accountId) ; sans cette cle, rien n'empeche deux lignes
// identiques pour le meme compte chez le meme fournisseur.
const accountFromCli = `model Account {
  id         String   @id
  accountId  String
  providerId String
  userId     String
  password   String?
  createdAt  DateTime
  updatedAt  DateTime

  issuer String?

  @@map("account")
  @@index([userId])
}`;

describe('injectAccountUnique', () => {
  it('adds the composite unique the Better-Auth CLI no longer generates', () => {
    const out = injectAccountUnique(accountFromCli);
    expect(out).toContain('@@unique([providerId, accountId])');
    expect(out.trim().endsWith('}')).toBe(true);
  });

  it('does not duplicate the unique when applied twice', () => {
    const once = injectAccountUnique(accountFromCli);
    expect(injectAccountUnique(once).match(/@@unique\(\[providerId, accountId\]\)/g)).toHaveLength(1);
  });

  it('leaves a schema without an Account model untouched', () => {
    const schema = 'model User {\n  id String @id\n\n  @@map("user")\n}';
    expect(injectAccountUnique(schema)).toBe(schema);
  });
});
