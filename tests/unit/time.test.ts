import { describe, expect, it } from 'vitest';
import { computeTargetVideoTime, isReliableBinding } from '../../src/shared/time';

describe('computeTargetVideoTime', () => {
  it('maps Suno time using clip start, video in point, and offset', () => {
    expect(computeTargetVideoTime({
      clipStartSeconds: 12,
      videoInSeconds: 2,
      offsetSeconds: -0.1
    }, 20)).toBeCloseTo(9.9);
  });
});

describe('isReliableBinding', () => {
  it('accepts an unwarped binding at normal speed', () => {
    expect(isReliableBinding({ speed: 1, warped: false })).toBe(true);
  });

  it('rejects changed playback speed', () => {
    expect(isReliableBinding({ speed: 0.99, warped: false })).toBe(false);
  });

  it('rejects warped audio', () => {
    expect(isReliableBinding({ speed: 1, warped: true })).toBe(false);
  });
});
