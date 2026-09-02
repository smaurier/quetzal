import { describe, it, expect } from 'vitest';
import { manifest } from '../src/manifest.js';
import { clientManifest } from '../src/client.js';

// The host (Next.js) bundles the client manifest. It must carry the UI surface of the
// module and nothing server-side: importing it must never pull NestJS into a browser bundle.
describe('client manifest [hello]', () => {
  it('exposes the UI subset of the server manifest', () => {
    expect(clientManifest.slug).toBe(manifest.slug);
    expect(clientManifest.name).toEqual(manifest.name);
    expect(clientManifest.uiRoutes).toBe(manifest.uiRoutes);
    expect(clientManifest.navItem).toEqual(manifest.navItem);
    expect(clientManifest.guestJoinComponent).toBe(manifest.guestJoinComponent);
  });

  it('carries no server-only fields', () => {
    expect(clientManifest).not.toHaveProperty('apiModule');
    expect(clientManifest).not.toHaveProperty('onBoot');
    expect(clientManifest).not.toHaveProperty('permissions');
  });
});
