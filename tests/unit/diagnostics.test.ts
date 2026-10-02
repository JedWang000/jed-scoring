import { describe, expect, it } from 'vitest';
import { exportDiagnostics } from '../../src/diagnostics/export';
import { Logger } from '../../src/diagnostics/logger';

describe('Logger', () => {
  it('retains only the newest 500 entries', () => {
    const logger = new Logger();
    for (let index = 0; index < 505; index += 1) {
      logger.log({ atMs: index, category: 'sync', code: `tick-${index}` });
    }

    expect(logger.entries()).toHaveLength(500);
    expect(logger.entries()[0]).toMatchObject({ code: 'tick-5' });
  });
});

describe('exportDiagnostics', () => {
  it('exports an allowlisted snapshot without file identity or authentication data', () => {
    const json = exportDiagnostics({
      generatedAtMs: 123,
      adapterHealth: 'healthy',
      projectTimeSeconds: 4,
      videoTimeSeconds: 3.9,
      driftSeconds: -0.1,
      bindingState: 'ready',
      selectorStrategyVersion: 'transport-structure/v1',
      errorCodes: ['none'],
      fileName: 'secret.mp4',
      fingerprint: 'secret-hash',
      authToken: 'secret-token'
    } as never);

    expect(JSON.parse(json)).toEqual({
      schemaVersion: 1,
      generatedAtMs: 123,
      adapter: {
        health: 'healthy',
        selectorStrategyVersion: 'transport-structure/v1',
        projectTimeSeconds: 4
      },
      sync: {
        videoTimeSeconds: 3.9,
        driftSeconds: -0.1,
        bindingState: 'ready'
      },
      errorCodes: ['none']
    });
    expect(json).not.toContain('secret');
  });
});
