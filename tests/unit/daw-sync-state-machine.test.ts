import { describe, expect, it } from 'vitest';
import {
  DawSyncStateMachine,
  type DawSyncObservation
} from '../../src/sync/daw-sync-state-machine';

function observation(overrides: Partial<DawSyncObservation> = {}): DawSyncObservation {
  return {
    projectTimeSeconds: 20,
    isPlaying: false,
    clipStartSeconds: 12,
    clipDurationSeconds: 30,
    observedAtMs: 1_000,
    ...overrides
  };
}

function machine() {
  return new DawSyncStateMachine({
    playbackGraceMs: 120,
    discontinuitySeconds: 0.15
  });
}

describe('DawSyncStateMachine', () => {
  it('classifies the four DAW range and transport modes', () => {
    expect(machine().update(observation({ projectTimeSeconds: 11.9 })).mode)
      .toBe('before-range');
    expect(machine().update(observation({ projectTimeSeconds: 12 })).mode)
      .toBe('inside-paused');
    expect(machine().update(observation({ isPlaying: true })).mode)
      .toBe('inside-playing');
    expect(machine().update(observation({ projectTimeSeconds: 42 })).mode)
      .toBe('after-range');
  });

  it('pauses immediately for a normal transport stop', () => {
    const runtime = machine();
    runtime.update(observation({
      projectTimeSeconds: 20,
      isPlaying: true,
      observedAtMs: 1_000
    }));

    expect(runtime.update(observation({
      projectTimeSeconds: 20.05,
      isPlaying: false,
      observedAtMs: 1_050
    }))).toMatchObject({
      mode: 'inside-paused',
      effectiveIsPlaying: false,
      discontinuity: false
    });
  });

  it('keeps playing through a transient false state after a playhead jump', () => {
    const runtime = machine();
    runtime.update(observation({
      projectTimeSeconds: 20,
      isPlaying: true,
      observedAtMs: 1_000
    }));

    expect(runtime.update(observation({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_050
    }))).toMatchObject({
      mode: 'inside-playing',
      effectiveIsPlaying: true,
      discontinuity: true
    });
  });

  it('expires jump stabilization after 120 milliseconds', () => {
    const runtime = machine();
    runtime.update(observation({
      projectTimeSeconds: 20,
      isPlaying: true,
      observedAtMs: 1_000
    }));
    runtime.update(observation({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_050
    }));

    expect(runtime.update(observation({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_171
    }))).toMatchObject({
      mode: 'inside-paused',
      effectiveIsPlaying: false
    });
  });

  it('does not renew stabilization on a later paused observation', () => {
    const runtime = machine();
    runtime.update(observation({
      projectTimeSeconds: 20,
      isPlaying: true,
      observedAtMs: 1_000
    }));
    runtime.update(observation({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_050
    }));

    expect(runtime.update(observation({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_300
    }))).toMatchObject({
      mode: 'inside-paused',
      effectiveIsPlaying: false
    });
  });

  it('stabilizes a negative Loop jump with the same transition', () => {
    const runtime = machine();
    runtime.update(observation({
      projectTimeSeconds: 35,
      isPlaying: true,
      observedAtMs: 1_000
    }));

    expect(runtime.update(observation({
      projectTimeSeconds: 15,
      isPlaying: false,
      observedAtMs: 1_050
    }))).toMatchObject({
      mode: 'inside-playing',
      effectiveIsPlaying: true,
      discontinuity: true
    });
  });

  it('reports whether the selected mode changed', () => {
    const runtime = machine();

    expect(runtime.update(observation())).toMatchObject({ transitioned: true });
    expect(runtime.update(observation({ observedAtMs: 1_050 })))
      .toMatchObject({ transitioned: false });
    expect(runtime.update(observation({ isPlaying: true, observedAtMs: 1_100 })))
      .toMatchObject({ transitioned: true });
  });
});
