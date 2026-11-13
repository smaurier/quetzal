import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env['E2E_HOST_URL'] ?? 'http://localhost:3000',

    // `on-first-retry` etait de la configuration morte : `retries` n est pas
    // defini, donc il vaut 0, donc il n y a jamais de premiere reprise et
    // aucune trace n a jamais ete produite. Mesure du 07/11 : deux tests
    // tombaient par intermittence sur `main` depuis le 05/11 et chaque enquete
    // repartait de zero, faute du moindre artefact.
    //
    // ⛔ Et on ne met PAS `retries` a 1 pour autant. Une reprise automatique
    // rendrait les deux echecs invisibles au lieu de les rendre lisibles : un
    // test instable passerait en vert au second essai et la suite mentirait.
    // Ce qui manquait n est pas une seconde chance, c est une preuve.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Deux projets, et c est une contrainte de Better-Auth qui l impose : il
  // limite les tentatives de connexion par fenetre glissante, budget trois.
  // Chaque test qui se connectait lui-meme rapprochait la suite du mur ; le
  // 05/11, le quatrieme l a franchi et `loto-teacher` est tombe sur
  // « Too many requests ». Desormais `setup` se connecte une fois et les tests
  // reprennent son etat : leur nombre n entre plus dans le budget.
  projects: [
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'e2e',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/owner.json' },
    },
  ],

  // La clé est OMISE en CI, et non mise à `undefined` : exactOptionalPropertyTypes
  // refuse une clé présente qui vaut `undefined`.
  ...(process.env['CI']
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          port: 3000,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
