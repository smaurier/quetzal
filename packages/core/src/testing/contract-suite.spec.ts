import { describe, it, expect } from 'vitest';
import { runContractSuite } from './contract-suite';
import type { QuetzalModuleManifest } from '../module-contract';

class NoopModule {}

const validManifest: QuetzalModuleManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
  description: { fr: 'Test', en: 'Test', es: 'Test' },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: NoopModule as never,
  eventsPublished: [],
  uiRoutes: [],
  navItem: null,
  permissions: {},
};

describe('runContractSuite', () => {
  it('registers a suite scoped to the module slug without throwing', () => {
    expect(() =>
      runContractSuite(validManifest, { moduleRoot: process.cwd() })
    ).not.toThrow();
  });
});
