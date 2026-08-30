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

  describe('create', () => {
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

  describe('upsert', () => {
    it('injects tenantId into where, create, and strips from update', () => {
      const args = {
        where: { id: 'g1' },
        create: { id: 'g1', label: 'x' },
        update: { label: 'y' },
      };
      const result = applyTenantConstraint('Loto_Game', 'upsert', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
      expect(result.create.tenantId).toBe('t-A');
      expect('tenantId' in result.update).toBe(false);
    });

    it('throws when where.tenantId differs from ctx', () => {
      const args = { where: { id: 'g1', tenantId: 't-B' }, create: {}, update: {} };
      expect(() => applyTenantConstraint('Loto_Game', 'upsert', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });

    it('throws when create.tenantId differs from ctx', () => {
      const args = { where: { id: 'g1' }, create: { tenantId: 't-B' }, update: {} };
      expect(() => applyTenantConstraint('Loto_Game', 'upsert', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });

    it('throws when update.tenantId differs from ctx', () => {
      const args = { where: { id: 'g1' }, create: {}, update: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'upsert', args, 't-A'))
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

  describe('createManyAndReturn (Prisma 5.14+)', () => {
    it('injects tenantId on each item', () => {
      const args = { data: [{ id: 'g1' }, { id: 'g2' }] };
      const result = applyTenantConstraint('Loto_Game', 'createManyAndReturn', args, 't-A');
      expect(result.data).toEqual([
        { id: 'g1', tenantId: 't-A' },
        { id: 'g2', tenantId: 't-A' },
      ]);
    });

    it('throws if any item has different tenantId', () => {
      const args = { data: [{ id: 'g1', tenantId: 't-B' }] };
      expect(() => applyTenantConstraint('Loto_Game', 'createManyAndReturn', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('updateManyAndReturn (Prisma 5.16+)', () => {
    it('injects where.tenantId', () => {
      const args = { where: { status: 'pending' }, data: { status: 'done' } };
      const result = applyTenantConstraint('Loto_Game', 'updateManyAndReturn', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
    });

    it('throws if data.tenantId attempted change', () => {
      const args = { where: {}, data: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'updateManyAndReturn', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('unknown operations (fail-closed)', () => {
    it('throws TenantScopeViolationError for unrecognized operation names', () => {
      expect(() => applyTenantConstraint('Loto_Game', 'someUnknownOp', {}, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });
});
