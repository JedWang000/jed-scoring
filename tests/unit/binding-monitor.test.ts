import { describe, expect, it } from 'vitest';
import type { SunoClip } from '../../src/content/suno-adapter';
import { createBinding, inspectBinding } from '../../src/content/binding-monitor';

const clip: SunoClip = {
  id: 'clip-1',
  startSeconds: 12,
  durationSeconds: 30,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  label: 'Reference audio',
  bindingEligibility: 'ready'
};

const binding = createBinding(clip, 1234);

describe('createBinding', () => {
  it('captures the confirmed reference mapping', () => {
    expect(binding).toEqual({
      clipId: 'clip-1',
      clipStartSeconds: 12,
      clipDurationSeconds: 30,
      trimStartSeconds: 0,
      speed: 1,
      warped: false,
      confirmedAtMs: 1234
    });
  });
});

describe('inspectBinding', () => {
  it('blocks sync when the bound clip is warped', () => {
    expect(inspectBinding(binding, [{
      ...clip,
      warped: true,
      bindingEligibility: 'warped'
    }])).toMatchObject({
      state: 'warning',
      reason: 'warped'
    });
  });

  it('blocks sync when playback speed changes', () => {
    expect(inspectBinding(binding, [{
      ...clip,
      speed: 1.01,
      bindingEligibility: 'speed-changed'
    }])).toMatchObject({
      state: 'warning',
      reason: 'speed-changed'
    });
  });

  it.each([
    ['looped', 'looped'],
    ['reversed', 'reversed'],
    ['analysis-pending', 'analysis-pending'],
    ['unsupported-mapping', 'unsupported-mapping']
  ] as const)('blocks sync when the candidate becomes %s', (eligibility, reason) => {
    expect(inspectBinding(binding, [{
      ...clip,
      bindingEligibility: eligibility,
      ...(eligibility === 'unsupported-mapping'
        ? { trimStartSeconds: undefined, speed: undefined }
        : {})
    }])).toEqual({ state: 'warning', reason });
  });

  it('blocks sync when the bound clip is deleted', () => {
    expect(inspectBinding(binding, [])).toEqual({
      state: 'warning',
      reason: 'missing'
    });
  });

  it('blocks sync when clip identity becomes ambiguous', () => {
    expect(inspectBinding(binding, [clip, { ...clip }])).toEqual({
      state: 'warning',
      reason: 'identity-ambiguous'
    });
  });

  it('accepts movement and trimming with the updated clip mapping', () => {
    const changed = {
      ...clip,
      startSeconds: 20,
      durationSeconds: 25,
      trimStartSeconds: 5
    };

    expect(inspectBinding(binding, [changed])).toEqual({
      state: 'ready',
      clip: changed,
      mappingChanged: true
    });
  });

  it('keeps a ready near-1 speed inside the shared tolerance', () => {
    const nearNormal = {
      ...clip,
      speed: 1 + 5e-10,
      bindingEligibility: 'ready' as const
    };
    const binding = createBinding(nearNormal, 1);

    expect(inspectBinding(binding, [nearNormal])).toMatchObject({ state: 'ready' });
  });

  it('reports an unchanged reliable binding as ready', () => {
    expect(inspectBinding(binding, [clip])).toEqual({
      state: 'ready',
      clip,
      mappingChanged: false
    });
  });
});
