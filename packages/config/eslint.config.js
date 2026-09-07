// packages/config cannot resolve '@quetzal/config/eslint/flat' as a package
// specifier from within itself (no self-referencing devDependency), so this
// loads the shared flat config by relative path instead of extending the
// root eslint.config.js like every other workspace package does.
module.exports = require('./eslint/flat');
