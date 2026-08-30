import { describe, it, expect } from 'vitest';
import { applyTenantConstraint } from './tenant-scope';
import { TenantScopeViolationError } from './errors';

describe('applyTenantConstraint', () => {
  describe('reads (findMany, findFirst, count, aggregate, groupBy)', () => {
    it('injects where.tenantId when absent', () => {
      const args = { where: { status: 'pending' } };
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
      expect(result.where.status).toBe('pending');
    });

    it('passes through when where.tenantId matches ctx', () => {
      const args = { where: { tenantId: 't-A', status: 'pending' } };
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
    });

    it('throws when where.tenantId differs from ctx', () => {
      const args = { where: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'findMany', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });

    it('handles missing where clause entirely', () => {
      const args = {};
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where).toEqual({ tenantId: 't-A' });
    });
  });

  describe('creates (create, upsert)', () => {
    it('injects data.tenantId when absent', () => {
      const args = { data: { id: 'g1' } };
      const result = applyTenantConstraint('Loto_Game', 'create', args, 't-A');
      expect(result.data.tenantId).toBe('t-A');
    });

    it('throws when data.tenantId differs from ctx', () => {
      const args = { data: { id: 'g1', tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'create', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('updates/deletes', () => {
    it('injects where.tenantId', () => {
      const args = { where: { id: 'g1' }, data: { status: 'finished' } };
      const result = applyTenantConstraint('Loto_Game', 'update', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
    });

    it('throws if data.tenantId attempted change', () => {
      const args = { where: { id: 'g1' }, data: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'update', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('createMany', () => {
    it('injects tenantId on each item', () => {
      const args = { data: [{ id: 'g1' }, { id: 'g2' }] };
      const result = applyTenantConstraint('Loto_Game', 'createMany', args, 't-A');
      expect(result.data).toEqual([
        { id: 'g1', tenantId: 't-A' },
        { id: 'g2', tenantId: 't-A' },
      ]);
    });

    it('throws if any item has different tenantId', () => {
      const args = { data: [{ id: 'g1' }, { id: 'g2', tenantId: 't-B' }] };
      expect(() => applyTenantConstraint('Loto_Game', 'createMany', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });
});
