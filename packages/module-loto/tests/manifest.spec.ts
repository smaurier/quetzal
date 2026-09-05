import { runContractSuite } from '@quetzal/core/testing/index';
import { resolve } from 'node:path';
import { manifest } from '../src/manifest.js';

runContractSuite(manifest, { moduleRoot: resolve(import.meta.dirname, '..') });
