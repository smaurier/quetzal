// Lecteur volontairement minimal : il sert à vérifier notre propre fichier de
// jetons, pas à analyser du CSS quelconque. Ajouter postcss ici serait une
// dépendance pour un besoin de test.
export function readTokenBlock(css: string, selector: string): Record<string, string> {
  const start = findSelector(css, selector);
  const open = css.indexOf('{', start);
  if (open === -1) throw new Error(`Bloc sans accolade pour « ${selector} »`);

  let depth = 0;
  let close = -1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`Bloc non refermé pour « ${selector} »`);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name!] = value!.trim();
  }
  return tokens;
}

// `:root` est un préfixe littéral de `:root:not(.light):not(.dark)`. Un
// indexOf simple rendrait le mauvais bloc et le test de parité se comparerait
// alors à lui-même : il passerait toujours, en ne prouvant rien.
function findSelector(css: string, selector: string): number {
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) throw new Error(`Sélecteur introuvable : « ${selector} »`);
    const after = css.slice(at + selector.length).trimStart()[0];
    if (after === '{' || after === ',') return at;
    from = at + selector.length;
  }
}
