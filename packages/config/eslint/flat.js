const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const jsxA11y = require('eslint-plugin-jsx-a11y');

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
      'packages/config/eslint/base.js',
      'packages/config/eslint/module.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
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
    rules: asErrors(jsxA11y.flatConfigs.recommended.rules),
  },
);
