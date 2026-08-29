module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Interdit raw string room WS, utiliser rooms.session/rooms.tenant' },
    messages: { rawRoom: 'Raw room string détecté. Utiliser rooms.session() ou rooms.tenant() from @quetzal/core.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          ['emit', 'to', 'in', 'join', 'leave'].includes(callee.property.name)
        ) {
          const firstArg = node.arguments[0];
          if (firstArg?.type === 'Literal' && typeof firstArg.value === 'string' && firstArg.value.includes(':')) {
            context.report({ node: firstArg, messageId: 'rawRoom' });
          }
        }
      },
    };
  },
};
