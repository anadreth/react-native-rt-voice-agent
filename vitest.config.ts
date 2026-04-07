import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
    alias: {
      'react-native': new URL('./src/__tests__/__mocks__/react-native.ts', import.meta.url).pathname,
      'react-native-webrtc': new URL('./src/__tests__/__mocks__/react-native-webrtc.ts', import.meta.url).pathname,
    },
  },
});
