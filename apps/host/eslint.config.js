const { FlatCompat } = require('@eslint/eslintrc');
const sharedConfig = require('@quetzal/config/eslint/flat');

const compat = new FlatCompat({ baseDirectory: __dirname });

// `next/core-web-vitals` bundles its own (partial, non-strict) copy of
// eslint-plugin-jsx-a11y. The shared flat config already wires the full
// jsx-a11y/recommended set as errors for every *.tsx file in the repo — two
// registrations of the same plugin name under overlapping globs is a hard
// ESLint config error ("Cannot redefine plugin"), and the shared copy is the
// stricter one, so the Next-provided jsx-a11y plugin + its rules are dropped
// here. Every other Next rule (react, react-hooks, @next/next, import) is
// kept as-is.
function withoutBundledJsxA11y(configs) {
  return configs.map((config) => {
    if (!config.plugins || !('jsx-a11y' in config.plugins)) return config;
    const { 'jsx-a11y': _jsxA11y, ...plugins } = config.plugins;
    const rules = config.rules
      ? Object.fromEntries(Object.entries(config.rules).filter(([name]) => !name.startsWith('jsx-a11y/')))
      : config.rules;
    return { ...config, plugins, rules };
  });
}

module.exports = [
  ...withoutBundledJsxA11y(compat.extends('next/core-web-vitals')),
  ...sharedConfig,
];
