import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    base: './',
    // Plain CSS: do not inherit unrelated PostCSS configuration above the checkout.
    css: { postcss: { plugins: [] } },
    build: {
      outDir: 'dist',
    },
  };
});
