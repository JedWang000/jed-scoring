import { describe, expect, it } from 'vitest';
import { isBackgroundRequest } from '../../src/background/protocol';

describe('background protocol', () => {
  it.each([
    ['snapshot'],
    ['connect'],
    ['reload'],
    ['diagnostics']
  ])('accepts %s requests', (action) => {
    expect(isBackgroundRequest({
      type: 'suno-video-sync:background-request/v1',
      action
    })).toBe(true);
  });

  it('rejects extra fields and unknown actions', () => {
    expect(isBackgroundRequest({
      type: 'suno-video-sync:background-request/v1',
      action: 'snapshot',
      token: 'secret'
    })).toBe(false);
    expect(isBackgroundRequest({
      type: 'suno-video-sync:background-request/v1',
      action: 'write-project'
    })).toBe(false);
  });
});
