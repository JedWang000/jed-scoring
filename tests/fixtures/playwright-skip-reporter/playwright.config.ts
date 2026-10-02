import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'skip-behavior.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [[resolve(
    process.cwd(),
    'tests/helpers/forbid-skipped-tests-reporter.ts'
  )]]
});
