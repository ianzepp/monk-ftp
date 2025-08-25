import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@src': resolve(__dirname, './src'),
      '@lib': resolve(__dirname, './src/lib'),
      '@spec': resolve(__dirname, './spec'),
    },
  },
});