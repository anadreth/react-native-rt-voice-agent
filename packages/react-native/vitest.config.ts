import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
    alias: {
      '@rtva/core': new URL('../core/src/index.ts', import.meta.url).pathname,
      'react-native': new URL('./src/__tests__/__mocks__/react-native.ts', import.meta.url).pathname,
    },
  },
});
