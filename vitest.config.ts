import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['packages/*/src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/__tests__/**', 'packages/*/src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@polyx/core': '/Users/wick/Documents/workspaces/polyx/packages/core/src/index.ts',
      '@polyx/runtime': '/Users/wick/Documents/workspaces/polyx/packages/runtime/src/index.ts',
      '@polyx/compiler': '/Users/wick/Documents/workspaces/polyx/packages/compiler/src/index.ts',
      '@polyx/ssr': '/Users/wick/Documents/workspaces/polyx/packages/ssr/src/index.ts',
    },
  },
});
