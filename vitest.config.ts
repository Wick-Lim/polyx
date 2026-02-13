import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

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
      '@polyx/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@polyx/runtime': resolve(__dirname, 'packages/runtime/src/index.ts'),
      '@polyx/compiler': resolve(__dirname, 'packages/compiler/src/index.ts'),
      '@polyx/ssr': resolve(__dirname, 'packages/ssr/src/index.ts'),
    },
  },
});
