/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // Constant dans les deux modes : voir le commentaire dans globals.css.
        panel: {
          DEFAULT: 'hsl(var(--panel))',
          foreground: 'hsl(var(--panel-foreground))',
          muted: 'hsl(var(--panel-muted))',
        },
        brand: {
          crimson: 'hsl(var(--brand-crimson))',
          gold: 'hsl(var(--brand-gold))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Deux familles plus une. Archivo porte les titres, Source Sans 3 le
      // texte courant, JetBrains Mono les étiquettes et les codes de séance —
      // c'est elle qui rend un code lisible à voix haute sans confondre O et 0.
      fontFamily: {
        display: ['var(--font-display)', 'Archivo', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Source Sans 3', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      // L'échelle de la maquette, valeur pour valeur. Les corps titres portent
      // un interlettrage négatif qui se resserre à mesure qu'ils grandissent :
      // sans lui, Archivo 600 en 56 px paraît lâche.
      fontSize: {
        'display-1': ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.022em' }],
        'display-2': ['2.5rem', { lineHeight: '1.06', letterSpacing: '-0.018em' }],
        h1: ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        h2: ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        h3: ['1.25rem', { lineHeight: '1.3' }],
        'body-lg': ['1.125rem', { lineHeight: '1.55' }],
        body: ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        label: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.12em' }],
        micro: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.14em' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
