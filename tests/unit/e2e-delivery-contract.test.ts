import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const coreSpecs = [
  'tests/e2e/sync-flow.spec.ts',
  'tests/package-e2e/user-package.spec.ts'
] as const;

describe('core E2E delivery contract', () => {
  it('runs TypeScript validation inside the package verification gate', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };

    expect(packageJson.scripts?.['verify:package']).toContain('tsc --noEmit');
  });

  it.each(coreSpecs)('%s uses the repository test-generated video fixture without skip escapes', async (path) => {
    const source = await readFile(path, 'utf8');

    expect(source).toContain("from '../helpers/tiny-video-fixture'");
    expect(source).not.toContain('SUNO_VIDEO_TEST_FILE');
    expect(source).not.toContain('C:\\\\Suno_Video');
    expect(source).not.toMatch(/\btest\.skip\s*\(/u);
  });

  it.each(['playwright.config.ts', 'playwright.package.config.ts'])(
    '%s fails the delivery gate when any core test is skipped',
    async (path) => {
      const source = await readFile(path, 'utf8');

      expect(source).toContain('./tests/helpers/forbid-skipped-tests-reporter.ts');
    }
  );
});
