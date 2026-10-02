import { describe, expect, it } from 'vitest';
import { DiagnosticsBuffer } from '../../src/background/diagnostics-buffer';

describe('DiagnosticsBuffer', () => {
  it('keeps a bounded defensive copy of safe structured events', () => {
    const buffer = new DiagnosticsBuffer(2, () => 10);
    buffer.log('network', 'request-seen', { endpoint: 'project', count: 1 });
    buffer.log('transport', 'candidate-count', { count: 3 });
    buffer.log('session', 'attached', { generation: 1 });

    const entries = buffer.entries();
    expect(entries.map((entry) => entry.code)).toEqual(['candidate-count', 'attached']);
    expect(entries[1]).toEqual({
      atMs: 10,
      category: 'session',
      code: 'attached',
      data: { generation: 1 }
    });
  });

  it('rejects sensitive keys and raw-looking string values', () => {
    const buffer = new DiagnosticsBuffer(2, () => 10);
    expect(() => buffer.log('network', 'unsafe', { token: 'x' })).toThrow(/sensitive/i);
    expect(() => buffer.log('network', 'unsafe', {
      detail: 'https://studio-api-prod.suno.com/api/studio/project/secret'
    })).toThrow(/sensitive/i);
    expect(buffer.entries()).toEqual([]);
  });
});
