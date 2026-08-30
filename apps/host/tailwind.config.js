/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@quetzal/config/tailwind/preset')],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/module-*/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
  },
};
