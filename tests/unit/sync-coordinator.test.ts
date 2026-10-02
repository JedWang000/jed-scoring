import { describe, expect, it, vi } from 'vitest';
import type { ReferenceTrackBinding } from '../../src/shared/types';
import { SyncCoordinator } from '../../src/sync/sync-coordinator';
import { SyncEngine } from '../../src/sync/sync-engine';
import type { VideoControl } from '../../src/sync/video-controller';
import type { SunoClip, SunoSnapshot } from '../../src/content/suno-adapter';

const clip: SunoClip = {
  id: 'clip-1',
  startSeconds: 12,
  durationSeconds: 30,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  label: 'Reference',
  bindingEligibility: 'ready'
};

const binding: ReferenceTrackBinding = {
  clipId: 'clip-1',
  clipStartSeconds: 12,
  clipDurationSeconds: 30,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  confirmedAtMs: 1
};

function snapshot(overrides: Partial<SunoSnapshot> = {}): SunoSnapshot {
  return {
    health: 'healthy',
    bridgeStatus: 'ready',
    projectTimeSeconds: 16,
    isPlaying: true,
    clips: [clip],
    observedAtMs: 10,
    ...overrides
  };
}

interface ControlOptions {
  readonly paused?: boolean;
  readonly seeking?: boolean;
  readonly durationSeconds?: number;
}

function controls(
  actualSeconds = 3.5,
  options: ControlOptions = {}
): VideoControl {
  let muted = false;
  let currentSeconds = actualSeconds;
  let paused = options.paused ?? true;
  const durationSeconds = options.durationSeconds ?? 30;
  return {
    seek: vi.fn((seconds) => {
      currentSeconds = Math.max(0, Math.min(seconds, durationSeconds));
    }),
    play: vi.fn(async () => {
      paused = false;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    setRate: vi.fn(),
    currentTime: vi.fn(() => currentSeconds),
    duration: vi.fn(() => durationSeconds),
    isPaused: vi.fn(() => paused),
    isSeeking: vi.fn(() => options.seeking ?? false),
    setMuted: vi.fn((value) => { muted = value; }),
    isMuted: vi.fn(() => muted)
  };
}

function coordinator(readSnapshot: () => Promise<SunoSnapshot>, controller: VideoControl) {
  return new SyncCoordinator(
    readSnapshot,
    controller,
    new SyncEngine({ smallErrorSeconds: 0.02, largeErrorSeconds: 0.15 })
  );
}

describe('SyncCoordinator', () => {
  it('forces one direct alignment seek for a healthy confirmed binding', async () => {
    const controller = controls(4.01, { paused: false });
    const runtime = coordinator(async () => snapshot(), controller);

    const result = await runtime.resync(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    });

    expect(result).toEqual({
      state: 'aligned',
      targetSeconds: 4,
      actualSeconds: 4.01
    });
    expect(controller.setRate).toHaveBeenCalledWith(1);
    expect(controller.seek).toHaveBeenCalledTimes(1);
    expect(controller.seek).toHaveBeenCalledWith(4);
    expect(controller.play).not.toHaveBeenCalled();
    expect(controller.pause).not.toHaveBeenCalled();
  });

  it('fails closed without seeking when one-shot alignment cannot validate the adapter', async () => {
    const controller = controls(4, { paused: false });
    const runtime = coordinator(async () => snapshot({ health: 'unavailable' }), controller);

    expect(await runtime.resync(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    })).toEqual({ state: 'adapter-unavailable' });
    expect(controller.pause).toHaveBeenCalledOnce();
    expect(controller.seek).not.toHaveBeenCalled();
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('seeks and plays local video for a healthy, confirmed binding', async () => {
    const controller = controls();
    const runtime = coordinator(async () => snapshot(), controller);

    const result = await runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    });

    expect(result).toMatchObject({ state: 'syncing', action: { kind: 'seek', seconds: 4 } });
    expect(controller.seek).toHaveBeenCalledWith(4);
    expect(controller.play).toHaveBeenCalledOnce();
  });

  it('uses the latest safe start and trim mapping after the bound clip moves', async () => {
    const controller = controls(0);
    const runtime = coordinator(async () => snapshot({
      projectTimeSeconds: 20,
      clips: [{ ...clip, startSeconds: 14, trimStartSeconds: 5 }]
    }), controller);

    const result = await runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    });

    expect(result).toMatchObject({ state: 'syncing', targetSeconds: 11 });
    expect(controller.seek).toHaveBeenCalledWith(11);
  });

  it('pauses when adapter health is unavailable', async () => {
    const controller = controls();
    const runtime = coordinator(async () => snapshot({ health: 'unavailable' }), controller);

    expect(await runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    })).toMatchObject({ state: 'adapter-unavailable' });
    expect(controller.pause).toHaveBeenCalledOnce();
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('pauses and reports a speed-change warning', async () => {
    const controller = controls();
    const runtime = coordinator(async () => snapshot({
      clips: [{ ...clip, speed: 1.1, bindingEligibility: 'speed-changed' }]
    }), controller);

    expect(await runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    })).toEqual({ state: 'warning', reason: 'speed-changed' });
    expect(controller.pause).toHaveBeenCalledOnce();
  });

  it('pauses and reports playback-blocked instead of retrying autoplay', async () => {
    const controller = controls();
    const blocked = new Error('user gesture required');
    blocked.name = 'NotAllowedError';
    vi.mocked(controller.play).mockRejectedValue(blocked);
    const runtime = coordinator(async () => snapshot(), controller);

    await expect(runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    })).resolves.toEqual({ state: 'playback-blocked' });
    expect(controller.pause).toHaveBeenCalledOnce();
    expect(controller.play).toHaveBeenCalledOnce();
  });

  it('does not hide unexpected media playback failures', async () => {
    const controller = controls();
    vi.mocked(controller.play).mockRejectedValue(new Error('decoder failed'));
    const runtime = coordinator(async () => snapshot(), controller);

    await expect(runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    })).rejects.toThrow('decoder failed');
  });

  it('holds the first frame once before the live reference range', async () => {
    const controller = controls(4, { paused: false });
    const runtime = coordinator(async () => snapshot({
      projectTimeSeconds: 10,
      isPlaying: true,
      observedAtMs: 100
    }), controller);
    const mapping = {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    };

    await runtime.tick(binding, mapping);
    await runtime.tick(binding, mapping);

    expect(controller.pause).toHaveBeenCalledOnce();
    expect(controller.seek).toHaveBeenCalledOnce();
    expect(controller.seek).toHaveBeenCalledWith(0);
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('holds the last frame once at the exact live reference end', async () => {
    const controller = controls(10, { paused: false, durationSeconds: 30 });
    const runtime = coordinator(async () => snapshot({
      projectTimeSeconds: 42,
      isPlaying: true,
      observedAtMs: 100
    }), controller);
    const mapping = {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    };

    await runtime.tick(binding, mapping);
    await runtime.tick(binding, mapping);

    expect(controller.pause).toHaveBeenCalledOnce();
    expect(controller.seek).toHaveBeenCalledOnce();
    expect(controller.seek).toHaveBeenCalledWith(30);
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('seeks to a paused Studio playhead without starting video playback', async () => {
    const controller = controls(1, { paused: true });
    const runtime = coordinator(async () => snapshot({
      projectTimeSeconds: 20,
      isPlaying: false,
      observedAtMs: 100
    }), controller);

    const result = await runtime.tick(binding, {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    });

    expect(result).toMatchObject({
      state: 'paused',
      mode: 'inside-paused',
      action: { kind: 'seek', seconds: 8 }
    });
    expect(controller.seek).toHaveBeenCalledWith(8);
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('resumes exactly once when a playing Studio transport enters the range', async () => {
    let currentSnapshot = snapshot({
      projectTimeSeconds: 10,
      isPlaying: true,
      observedAtMs: 100
    });
    const controller = controls(5, { paused: false });
    const runtime = coordinator(async () => currentSnapshot, controller);
    const mapping = {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    };

    await runtime.tick(binding, mapping);
    currentSnapshot = snapshot({
      projectTimeSeconds: 16,
      isPlaying: true,
      observedAtMs: 150
    });
    await runtime.tick(binding, mapping);
    await runtime.tick(binding, mapping);

    expect(controller.play).toHaveBeenCalledOnce();
    expect(controller.seek).toHaveBeenLastCalledWith(4);
  });

  it('does not pause for a transient false play state after a jump', async () => {
    let currentSnapshot = snapshot({
      projectTimeSeconds: 16,
      isPlaying: true,
      observedAtMs: 1_000
    });
    const controller = controls(4, { paused: false });
    const runtime = coordinator(async () => currentSnapshot, controller);
    const mapping = {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    };

    await runtime.tick(binding, mapping);
    currentSnapshot = snapshot({
      projectTimeSeconds: 30,
      isPlaying: false,
      observedAtMs: 1_050
    });
    const result = await runtime.tick(binding, mapping);

    expect(result).toMatchObject({
      state: 'syncing',
      mode: 'inside-playing',
      action: { kind: 'seek', seconds: 18 }
    });
    expect(controller.pause).not.toHaveBeenCalled();
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('pauses immediately for a normal Studio transport stop', async () => {
    let currentSnapshot = snapshot({
      projectTimeSeconds: 16,
      isPlaying: true,
      observedAtMs: 1_000
    });
    const controller = controls(4, { paused: false });
    const runtime = coordinator(async () => currentSnapshot, controller);
    const mapping = {
      clipStartSeconds: 12,
      videoInSeconds: 0,
      offsetSeconds: 0
    };

    await runtime.tick(binding, mapping);
    currentSnapshot = snapshot({
      projectTimeSeconds: 16.05,
      isPlaying: false,
      observedAtMs: 1_050
    });
    const result = await runtime.tick(binding, mapping);

    expect(result).toMatchObject({ state: 'paused', mode: 'inside-paused' });
    expect(controller.pause).toHaveBeenCalledOnce();
  });
});
