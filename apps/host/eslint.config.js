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

// `next/core-web-vitals` also bundles its own copy of eslint-plugin-react
// under the plugin key "react", which the shared flat config now also
// registers (for react/jsx-no-literals) on every *.tsx file — the same
// "Cannot redefine plugin" class of collision as jsx-a11y above. Unlike
// jsx-a11y, the shared config doesn't reimplement plugin:react/recommended —
// it only adds one rule — so Next's react/* rules (react/jsx-key,
// react/no-unescaped-entities, ...) are worth keeping. Only the duplicate
// `plugins.react` registration is dropped here; the rule entries that
// reference it are left in place and resolve fine, since ESLint looks up a
// plugin key across every config object that matches the linted file, not
// just the object that declared the rule — the shared config's own `react`
// registration (further down the array) satisfies the lookup for all of
// them.
function withoutBundledReactPlugin(configs) {
  return configs.map((config) => {
    if (!config.plugins || !('react' in config.plugins)) return config;
    const { react: _react, ...plugins } = config.plugins;
    return { ...config, plugins };
  });
}

module.exports = [
  ...withoutBundledReactPlugin(withoutBundledJsxA11y(compat.extends('next/core-web-vitals'))),
  ...sharedConfig,
];
