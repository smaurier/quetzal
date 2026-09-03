import { describe, it, expect } from 'vitest';
import { mergeCatalogues, type Catalogue } from './merge.js';

describe('mergeCatalogues', () => {
  it('returns a copy of core when no modules', () => {
    const core: Catalogue = { common: { save: 'Save' } };
    const merged = mergeCatalogues(core, []);
    expect(merged).toEqual(core);
    expect(merged).not.toBe(core);
  });

  it('overlays module keys on top of core', () => {
    const core: Catalogue = { common: { save: 'Save' } };
    const modA: Catalogue = { module: { hello: { title: 'Hello' } } };
    const merged = mergeCatalogues(core, [modA]);
    expect(merged).toEqual({
      common: { save: 'Save' },
      module: { hello: { title: 'Hello' } },
    });
  });

  it('later module overrides earlier module on top-level key collision', () => {
    const core: Catalogue = {};
    const modA: Catalogue = { module: { hello: { title: 'A' } } };
    const modB: Catalogue = { module: { hello: { title: 'B' } } };
    const merged = mergeCatalogues(core, [modA, modB]);
    expect((merged.module as Record<string, Record<string, string>>).hello.title).toBe('B');
  });

  it('does not mutate the core catalogue', () => {
    const core: Catalogue = { common: { save: 'Save' } };
    const snapshot = JSON.parse(JSON.stringify(core));
    mergeCatalogues(core, [{ common: { save: 'OVERRIDE' } }]);
    expect(core).toEqual(snapshot);
  });
});

// Module catalogues all live under the same top-level "module" key. A shallow overlay
// keeps only the last module (loto would erase hello) and drops any core key that
// happens to share a top-level name. Merge must be deep.
describe('mergeCatalogues (deep)', () => {
  it('keeps every module under the shared "module" key', () => {
    const merged = mergeCatalogues({}, [
      { module: { hello: { nav: { title: 'Hello' } } } },
      { module: { loto: { nav: { title: 'Loto' } } } },
    ]);
    expect(merged).toEqual({
      module: {
        hello: { nav: { title: 'Hello' } },
        loto: { nav: { title: 'Loto' } },
      },
    });
  });

  it('merges nested objects with core instead of replacing the branch', () => {
    const merged = mergeCatalogues({ common: { save: 'Save', cancel: 'Cancel' } }, [{ common: { save: 'Enregistrer' } }]);
    expect(merged).toEqual({ common: { save: 'Enregistrer', cancel: 'Cancel' } });
  });
});
