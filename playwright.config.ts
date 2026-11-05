import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env['E2E_HOST_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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

  webServer: process.env['CI'] ? undefined : {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
