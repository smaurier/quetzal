const boundaries = require('eslint-plugin-boundaries');

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: true },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
