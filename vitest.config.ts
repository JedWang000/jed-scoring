import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts']
  }
});
