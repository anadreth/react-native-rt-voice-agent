import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    alias: {
      '@rtva/core': new URL('../core/src/index.ts', import.meta.url).pathname,
      'react-native-webrtc': new URL('./src/__tests__/react-native-webrtc.mock.ts', import.meta.url).pathname,
    },
  },
});
