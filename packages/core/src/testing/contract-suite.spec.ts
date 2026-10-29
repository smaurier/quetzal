import { describe, it, expect } from 'vitest';
import { RequestMethod, type Type } from '@nestjs/common';
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { runContractSuite, findUndeclaredControllerRoutes } from './contract-suite.js';
import type { QuetzalModuleManifest } from '../module-contract.js';

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

// Vitest 4 refuse `describe()` appele depuis un `it()` : « Calling the suite
// function inside test function is not allowed ». Or runContractSuite enregistre
// une suite, c'est tout son objet. L'appel vit donc au niveau de la suite, qui
// est un contexte autorise, et l'echec eventuel est capture pour rester
// assertable dans un `it` : le test garde son intention, « enregistrer une suite
// ne jette pas », sans violer la regle du nouveau majeur.
describe('runContractSuite', () => {
  let erreurDEnregistrement: unknown;
  try {
    runContractSuite(validManifest, { moduleRoot: process.cwd() });
  } catch (erreur) {
    erreurDEnregistrement = erreur;
  }

  it('registers a suite scoped to the module slug without throwing', () => {
    expect(erreurDEnregistrement).toBeUndefined();
  });
});

// Built by hand rather than with @Controller/@Get: those decorators require
// experimentalDecorators, which the noyau tsconfig deliberately does not enable
// (only Nest-app packages do, see packages/*/tsconfig.json). Defining the exact
// metadata the decorators would produce keeps this test scoped to what
// findUndeclaredControllerRoutes reads, per @nestjs/common/constants.
class FixtureItemsController {
  list() {
    return [];
  }

  read() {
    return {};
  }
}
Reflect.defineMetadata(PATH_METADATA, 'api/modules/fixture/items', FixtureItemsController);
Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, FixtureItemsController.prototype.list);
Reflect.defineMetadata(PATH_METADATA, '/', FixtureItemsController.prototype.list);
Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, FixtureItemsController.prototype.read);
Reflect.defineMetadata(PATH_METADATA, ':id', FixtureItemsController.prototype.read);

class FixtureModule {}
Reflect.defineMetadata(MODULE_METADATA.CONTROLLERS, [FixtureItemsController as Type<unknown>], FixtureModule);

describe('findUndeclaredControllerRoutes', () => {
  it('reports a controller route missing from the permission matrix', () => {
    const manifest: QuetzalModuleManifest = {
      ...validManifest,
      apiModule: FixtureModule as never,
      permissions: {
        'http:GET /api/modules/fixture/items': ['owner'],
      },
    };

    expect(findUndeclaredControllerRoutes(manifest)).toEqual([
      'http:GET /api/modules/fixture/items/:id',
    ]);
  });

  it('reports nothing once every controller route is declared', () => {
    const manifest: QuetzalModuleManifest = {
      ...validManifest,
      apiModule: FixtureModule as never,
      permissions: {
        'http:GET /api/modules/fixture/items': ['owner'],
        'http:GET /api/modules/fixture/items/:id': ['owner'],
      },
    };

    expect(findUndeclaredControllerRoutes(manifest)).toEqual([]);
  });

  it('normalizes parameter names before comparing controller route to matrix key', () => {
    const manifest: QuetzalModuleManifest = {
      ...validManifest,
      apiModule: FixtureModule as never,
      permissions: {
        'http:GET /api/modules/fixture/items': ['owner'],
        // Controller declares :id, matrix here spells the same param :itemId —
        // this must still be treated as the same route.
        'http:GET /api/modules/fixture/items/:itemId': ['owner'],
      },
    };

    expect(findUndeclaredControllerRoutes(manifest)).toEqual([]);
  });
});
