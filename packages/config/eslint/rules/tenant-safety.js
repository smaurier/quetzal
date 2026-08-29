module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Interdit $queryRaw / $executeRaw dans les modules' },
    messages: {
      forbiddenRawQuery: '{{method}} interdit dans un module. Utiliser ctx.tenantRawQuery.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].includes(node.property.name)) {
          context.report({ node, messageId: 'forbiddenRawQuery', data: { method: node.property.name }});
        }
      },
    };
  },
};
