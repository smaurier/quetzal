import { describe, it, expect } from 'vitest';
import { validateContractVersion } from './module-registry';

describe('validateContractVersion', () => {
  it('accepts same major', () => {
    expect(() => validateContractVersion('1.0.0', '1.0.0')).not.toThrow();
    expect(() => validateContractVersion('1.2.3', '1.0.0')).not.toThrow();
  });

  it('rejects different major', () => {
    expect(() => validateContractVersion('2.0.0', '1.0.0')).toThrow(/contract version/);
  });
});
