const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const react = require('eslint-plugin-react');

// jsx-a11y/recommended ships every enabled rule as 'error' already; this makes
// that explicit and keeps it true if a future plugin version downgrades one to
// 'warn' — a11y violations must fail CI, not just be noted.
function asErrors(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, config]) => {
      const level = Array.isArray(config) ? config[0] : config;
      if (level === 'off') return [name, config];
      return Array.isArray(config) ? [name, ['error', ...config.slice(1)]] : [name, 'error'];
    }),
  );
}

module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.generated.ts',
      '**/next-env.d.ts',
      '**/model-tenant-registry.ts',
      '**/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Registered unscoped (no `files`) rather than inside the `**/*.tsx`
    // block below: apps/host merges next/core-web-vitals, which references
    // `react/*` rules (react/jsx-key, react/display-name, ...) on every JS/TS
    // file it lints, not just .tsx ones. Its own bundled copy of the plugin
    // is stripped there to avoid a duplicate-registration error, so this
    // registration is what those rule references resolve against — scoping
    // it to .tsx only would leave them dangling on plain .ts files.
    plugins: { react },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/tests/**/*.ts', '**/scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...asErrors(jsxA11y.flatConfigs.recommended.rules),
      // noStrings: catches literal strings anywhere in JSX (children AND
      // ones already wrapped in `{'...'}`), not just bare unwrapped text —
      // the default (noStrings: false) only requires braces around a
      // literal, it doesn't flag the literal itself, so a raw string
      // "smuggled" inside `{}` would pass. ignoreProps: true because prop
      // values (className, data-testid, href, ...) are plumbing, not
      // visible copy, and flagging them would bury real i18n misses in
      // noise unrelated to this rule's purpose. allowedStrings lists exact
      // punctuation/separator glyphs that can stand alone as a JSX text
      // node (e.g. a bullet between two translated fragments) — they carry
      // no words to translate, so listing the literal characters here is
      // more honest than inventing a translation key for "·".
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ['·', '-', '–', '—', '/', ':', '|', '•', '&nbsp;'],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/(?:^|\\s)dark:/]',
          message:
            "Pas d'utilitaire `dark:` : la configuration est darkMode: ['class'], il ne s'appliquerait donc pas en mode système — cassé chez l'utilisateur qui n'a rien réglé. Utiliser les jetons, qui basculent seuls.",
        },
        {
          selector:
            'Literal[value=/(?:^|\\s)(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:white|black|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d{1,3})?(?:$|\\s)/]',
          message:
            'Couleur Tailwind en dur : elle échappe au test de contraste de packages/ui. Utiliser un jeton (bg-background, text-foreground, border-input…).',
        },
      ],
    },
  },
  {
    // LA FRONTIERE NOYAU / MODULE DE CLAUDE.md §3, TENUE POUR DE VRAI.
    //
    // Les trois interdits de §3 existaient dans packages/config/eslint/module.js
    // depuis l'origine, au format eslintrc, et PERSONNE ne chargeait ce fichier :
    // aucun paquet packages/module-* n'avait de configuration qui l'etende.
    // Mesure le 12/11 par sonde : un module important PrismaClient en direct
    // passait `eslint src` en code 0. Issue #86.
    //
    // Le bloc vit ici plutot que dans un eslint.config.js par module, pour que
    // le prochain module soit couvert sans rien ecrire.
    files: ['packages/module-*/**/*.ts', 'packages/module-*/**/*.tsx'],
    // Les tests d'integration sont EXCLUS, et c'est un choix, pas un oubli : un
    // test qui prouve le cloisonnement par locataire a besoin de regarder la
    // base SANS le client cloisonne, sinon il ne verifie que lui-meme.
    // `module-hello` le fait deja pour relire une ligne et confirmer son
    // tenantId. Interdire ici rendrait le cloisonnement invérifiable.
    ignores: ['packages/module-*/**/*.spec.ts', 'packages/module-*/**/*.spec.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@quetzal/module-*'],
              message:
                'Import entre modules interdit (CLAUDE.md §3). Passer par le bus et les types de @quetzal/core/events/.',
            },
            {
              group: ['@prisma/client'],
              importNames: ['PrismaClient'],
              message:
                'PrismaClient direct interdit dans un module : il contourne le cloisonnement par locataire. Utiliser ctx.prisma (CLAUDE.md §3).',
            },
          ],
          paths: [
            {
              name: '@quetzal/db',
              importNames: ['RootPrismaClient', 'createRootPrismaClient', 'rootPrisma'],
              message:
                'Le client non cloisonne est reserve au noyau (onBoot, migrations, jobs admin). Utiliser ctx.prisma (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },
  {
    // LES DEUX REGLES MAISON DE CLAUDE.md §7 ET §9, TENUES POUR DE VRAI.
    //
    // rules/no-raw-room-string.js et rules/tenant-safety.js existaient depuis
    // l'origine et fonctionnaient ; aucun fichier ne les chargeait. Mesure le
    // 12/11 par sonde : 1 probleme vu sur 3. Issue #98.
    //
    // Sans `ignores` sur les specs, contrairement au bloc ci-dessus : un test
    // d'integration a besoin du client non cloisonne pour prouver le
    // cloisonnement, il n'a jamais besoin de SQL brut pour le faire.
    files: ['packages/module-*/**/*.ts', 'packages/module-*/**/*.tsx'],
    plugins: {
      quetzal: {
        rules: {
          'no-raw-room-string': require('./rules/no-raw-room-string.js'),
          'tenant-safety': require('./rules/tenant-safety.js'),
        },
      },
    },
    rules: {
      'quetzal/no-raw-room-string': 'error',
      'quetzal/tenant-safety': 'error',
    },
  },
);
