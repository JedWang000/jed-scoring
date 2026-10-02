import { describe, expect, it } from 'vitest';
import {
  isNewerTransport,
  parseTransportBinding,
  type TransportObservation
} from '../../src/background/transport-protocol';

function observation(overrides: Partial<TransportObservation> = {}): TransportObservation {
  return {
    sequence: 8,
    pageTimestampMs: 1234,
    receivedAtMs: 2000,
    projectTimeSeconds: 12.5,
    isPlaying: true,
    isScrubbing: false,
    strategyId: 'semantic-time-cluster-v1',
    ...overrides
  };
}

describe('parseTransportBinding', () => {
  it('accepts a strict finite transport payload', () => {
    expect(parseTransportBinding(JSON.stringify({
      v: 1,
      sequence: 8,
      pageTimestampMs: 1234,
      projectTimeSeconds: 12.5,
      isPlaying: true,
      isScrubbing: false,
      strategyId: 'semantic-time-cluster-v1'
    }), 2000)).toEqual(observation());
  });

  it('accepts a bounded negative pre-roll project time', () => {
    expect(parseTransportBinding(JSON.stringify({
      v: 1,
      sequence: 8,
      pageTimestampMs: 1234,
      projectTimeSeconds: -0.75,
      isPlaying: false,
      isScrubbing: true,
      strategyId: 'react-studio-controller-v1'
    }), 2000)).toMatchObject({
      projectTimeSeconds: -0.75,
      isPlaying: false,
      isScrubbing: true
    });
  });

  it.each([
    '{',
    JSON.stringify({
      v: 2,
      sequence: 1,
      pageTimestampMs: 1,
      projectTimeSeconds: 0,
      isPlaying: false,
      isScrubbing: false,
      strategyId: 'x'
    }),
    JSON.stringify({
      v: 1,
      sequence: 1,
      pageTimestampMs: 1,
      projectTimeSeconds: -(24 * 60 * 60) - 0.001,
      isPlaying: false,
      isScrubbing: false,
      strategyId: 'x'
    }),
    JSON.stringify({
      v: 1,
      sequence: 1,
      pageTimestampMs: 1,
      projectTimeSeconds: 1,
      isPlaying: false,
      isScrubbing: false,
      strategyId: 'x',
      token: 'x'
    }),
    JSON.stringify({
      v: 1,
      sequence: 1,
      pageTimestampMs: 1,
      projectTimeSeconds: 1,
      isPlaying: false,
      isScrubbing: false,
      strategyId: '../unsafe'
    })
  ])('rejects unsafe binding payload %s', (payload) => {
    expect(parseTransportBinding(payload, 2)).toBeUndefined();
  });
});

describe('isNewerTransport', () => {
  it('requires a higher sequence and nondecreasing page timestamp', () => {
    const previous = observation();
    expect(isNewerTransport(previous, observation({ sequence: 9, pageTimestampMs: 1235 }))).toBe(true);
    expect(isNewerTransport(previous, observation({ sequence: 8, pageTimestampMs: 1235 }))).toBe(false);
    expect(isNewerTransport(previous, observation({ sequence: 9, pageTimestampMs: 1233 }))).toBe(false);
  });
});
