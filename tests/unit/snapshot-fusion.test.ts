import { describe, expect, it } from 'vitest';
import type { SunoBridgeState } from '../../src/content/project-state';
import { SnapshotFusion } from '../../src/background/snapshot-fusion';
import type { TransportObservation } from '../../src/background/transport-protocol';

const clip = {
  id: 'audio-1',
  label: 'silent-reference.wav',
  startSeconds: 0,
  durationSeconds: 43,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  bindingEligibility: 'ready' as const
};

function readyProject(observedAtMs = 100): SunoBridgeState {
  return {
    status: 'ready',
    observedAtMs,
    clips: [clip],
    loop: { startSeconds: 0, endSeconds: 43, enabled: false }
  };
}

function transport(
  receivedAtMs = 120,
  isPlaying = true,
  isScrubbing = false
): TransportObservation {
  return {
    sequence: 1,
    pageTimestampMs: 100,
    receivedAtMs,
    projectTimeSeconds: 12,
    isPlaying,
    isScrubbing,
    strategyId: 'semantic-time-cluster-v1'
  };
}

function readyFusion(): SnapshotFusion {
  const fusion = new SnapshotFusion();
  fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 100 });
  fusion.updateProject({ generation: 4, state: readyProject(100) });
  fusion.updateTransport({ generation: 4, observation: transport(120, true) });
  return fusion;
}

describe('SnapshotFusion', () => {
  it('is healthy only when the attached project and transport share the generation', () => {
    expect(readyFusion().snapshot(150)).toEqual({
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: 12,
      isPlaying: true,
      loop: { startSeconds: 0, endSeconds: 43, enabled: false },
      clips: [clip],
      observedAtMs: 120
    });
  });

  it('preserves candidates but disables sync when transport is absent', () => {
    const fusion = new SnapshotFusion();
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 100 });
    fusion.updateProject({ generation: 4, state: readyProject(100) });

    expect(fusion.snapshot(150)).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      clips: [{ id: 'audio-1' }],
      reason: 'Studio transport has not been observed.'
    });
    expect(fusion.snapshot(150)).not.toHaveProperty('projectTimeSeconds');
    expect(fusion.snapshot(150)).not.toHaveProperty('isPlaying');
  });

  it.each([
    ['playing', transport(120, true, false), 1621],
    ['scrubbing', transport(120, false, true), 1621],
    ['paused', transport(120, false, false), 3121]
  ] as const)('disables sync when a %s transport observation is stale', (_label, observation, nowMs) => {
    const fusion = new SnapshotFusion();
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 100 });
    fusion.updateProject({ generation: 4, state: readyProject(100) });
    fusion.updateTransport({ generation: 4, observation });

    const snapshot = fusion.snapshot(nowMs);
    expect(snapshot).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      clips: [{ id: 'audio-1' }],
      reason: 'Studio transport observation is stale.'
    });
    expect(snapshot).not.toHaveProperty('projectTimeSeconds');
    expect(snapshot).not.toHaveProperty('isPlaying');
  });

  it('is degraded when transport is fresh but project state is unavailable', () => {
    const fusion = new SnapshotFusion();
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 100 });
    fusion.updateTransport({ generation: 4, observation: transport(120, false) });

    expect(fusion.snapshot(150)).toEqual({
      health: 'degraded',
      bridgeStatus: 'waiting-for-project-state',
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [],
      observedAtMs: 120,
      reason: 'Suno project state has not been observed. Reload the Studio page.'
    });
  });

  it('is degraded when a fresh transport accompanies an unsupported project', () => {
    const fusion = new SnapshotFusion();
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 100 });
    fusion.updateProject({
      generation: 4,
      state: { status: 'unsupported-timing', observedAtMs: 110 }
    });
    fusion.updateTransport({ generation: 4, observation: transport(120, false) });

    expect(fusion.snapshot(150)).toMatchObject({
      health: 'degraded',
      bridgeStatus: 'unsupported-timing',
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [],
      reason: 'This Suno project timing mode is not supported safely.'
    });
  });

  it.each(['detached', 'failed'] as const)(
    'invalidates project and transport immediately when session is %s',
    (state) => {
      const fusion = readyFusion();
      fusion.updateSession({ state, generation: 5, changedAtMs: 200 });

      expect(fusion.snapshot(201)).toMatchObject({
        health: 'unavailable',
        bridgeStatus: 'waiting-for-project-state',
        clips: []
      });
      expect(fusion.snapshot(201)).not.toHaveProperty('projectTimeSeconds');
    }
  );

  it('never trusts transport from a previous generation', () => {
    const fusion = readyFusion();
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 5, changedAtMs: 200 });
    fusion.updateProject({ generation: 5, state: readyProject(210) });
    fusion.updateTransport({ generation: 4, observation: transport(220, true) });

    expect(fusion.snapshot(230)).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      clips: [{ id: 'audio-1' }],
      reason: 'Studio transport has not been observed.'
    });
  });

  it('invalidates old observations as soon as a reload starts, even before generation changes', () => {
    const fusion = readyFusion();
    fusion.updateSession({ state: 'reloading', tabId: 7, generation: 4, changedAtMs: 200 });
    fusion.updateSession({ state: 'attached', tabId: 7, generation: 4, changedAtMs: 201 });

    expect(fusion.snapshot(202)).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: [],
      reason: 'Connected to Studio; waiting for project state.'
    });
  });
});
