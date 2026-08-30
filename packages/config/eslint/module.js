module.exports = {
  extends: ['./base.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@quetzal/module-*'],
          message: 'Cross-module imports interdits. Utiliser event bus + types dans @quetzal/core/events/',
        },
        {
          group: ['@prisma/client'],
          importNames: ['PrismaClient'],
          message: 'PrismaClient direct interdit dans modules. Utiliser ctx.prisma (tenant-scoped).',
        },
      ],
      paths: [
        {
          name: '@quetzal/db',
          importNames: ['RootPrismaClient', 'createRootPrismaClient', 'rootPrisma'],
          message: 'RootPrismaClient réservé au noyau. Utiliser ctx.prisma.',
        },
      ],
    }],
  },
};
