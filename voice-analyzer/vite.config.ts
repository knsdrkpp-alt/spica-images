import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so dist/ also works from a sub-path (e.g. GitHub Pages /<repo>/).
  base: './',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
