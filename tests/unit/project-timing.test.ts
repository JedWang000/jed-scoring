import { describe, expect, it } from 'vitest';
import {
  parseManualTiming,
  secondsBetween,
  secondsFromZero,
  type DerivedTiming
} from '../../src/content/project-timing';

describe('parseManualTiming', () => {
  it('parses fixed manual timing without automation', () => {
    const parsed = parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: []
    });

    expect(parsed).toEqual({
      status: 'ready',
      timing: { bps: 2, bpsAutomation: [], firstBeatSeconds: 0 }
    });
  });

  it('sorts validated automation without mutating the input', () => {
    const automation = [
      { beats: 4, value: 4, curve: 1 },
      { beats: 0, value: 2, curve: 1 }
    ];

    const parsed = parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: automation
    });

    expect(parsed).toMatchObject({
      status: 'ready',
      timing: { bpsAutomation: [{ beats: 0 }, { beats: 4 }] }
    });
    expect(automation.map((point) => point.beats)).toEqual([4, 0]);
  });

  it('ignores automation when manual timing locks BPS', () => {
    expect(parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: true,
      bpsAutomation: 'not-an-array'
    })).toEqual({
      status: 'ready',
      timing: { bps: 2, bpsAutomation: [], firstBeatSeconds: 0 }
    });
  });

  it('rejects malformed and duplicate automation points', () => {
    expect(parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: [{ beats: 0, value: 0, curve: 1 }]
    })).toEqual({ status: 'parse-failed' });

    expect(parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: [
        { beats: 0, value: 2, curve: 1 },
        { beats: 0, value: 3, curve: 1 }
      ]
    })).toEqual({ status: 'parse-failed' });
  });

  it('fails closed for follow-track and unknown timing', () => {
    expect(parseManualTiming({ type: 'follow-track', fallbackBPS: 2 })).toEqual({
      status: 'unsupported-timing'
    });
    expect(parseManualTiming({ type: 'future-mode', bps: 2 })).toEqual({
      status: 'unsupported-timing'
    });
    expect(parseManualTiming(null)).toEqual({ status: 'parse-failed' });
  });
});

describe('beat/second conversion', () => {
  it('converts fixed BPS, first-beat offset, negative beats, and ranges', () => {
    const timing: DerivedTiming = {
      bps: 2,
      bpsAutomation: [],
      firstBeatSeconds: 1.25
    };

    expect(secondsFromZero(4, timing)).toBe(3.25);
    expect(secondsFromZero(-2, timing)).toBe(0.25);
    expect(secondsBetween(-2, 4, timing)).toBe(3);
  });

  it('integrates a linear BPS automation segment', () => {
    const parsed = parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: [
        { beats: 4, value: 4, curve: 1 },
        { beats: 0, value: 2, curve: 1 }
      ]
    });
    expect(parsed.status).toBe('ready');
    if (parsed.status !== 'ready') throw new Error('timing did not parse');

    expect(secondsFromZero(4, parsed.timing)).toBeCloseTo(2 * Math.log(2), 8);
    expect(secondsBetween(0, 4, parsed.timing)).toBeCloseTo(2 * Math.log(2), 8);
  });

  it('matches Suno partial-segment sampling for a non-linear automation curve', () => {
    const parsed = parseManualTiming({
      type: 'manual',
      bps: 2,
      lockBPS: false,
      bpsAutomation: [
        { beats: 0, value: 2, curve: 2 },
        { beats: 4, value: 4, curve: 0 }
      ]
    });
    expect(parsed.status).toBe('ready');
    if (parsed.status !== 'ready') throw new Error('timing did not parse');

    const sampledEndBps = 2 + 2 * (1 - (1 - 0.5) ** 4);
    const expected = Math.log(sampledEndBps / 2) / ((sampledEndBps - 2) / 2);
    expect(secondsFromZero(2, parsed.timing)).toBeCloseTo(expected, 8);
  });
});
