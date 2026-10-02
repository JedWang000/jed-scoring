import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PlaywrightProcessResult {
  readonly exitCode: number | null;
  readonly output: string;
}

function runReporterFixture(grep: string): Promise<PlaywrightProcessResult> {
  const cliPath = resolve('node_modules/@playwright/test/cli.js');
  const configPath = resolve(
    'tests/fixtures/playwright-skip-reporter/playwright.config.ts'
  );

  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, [
      cliPath,
      'test',
      '--config',
      configPath,
      '--grep',
      grep
    ], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', rejectProcess);
    child.on('close', (exitCode) => resolveProcess({ exitCode, output }));
  });
}

describe('forbid-skipped-tests reporter process behavior', () => {
  it('makes the Playwright process fail when grep selects an intentional skip', async () => {
    const result = await runReporterFixture('selected-skip');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Core E2E delivery gate rejected skipped tests');
    expect(result.output).toContain('selected-skip');
  }, 30_000);

  it('does not count a grep-filtered unselected test as skipped', async () => {
    const result = await runReporterFixture('selected-pass');

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Core E2E delivery gate rejected skipped tests');
  }, 30_000);
});
