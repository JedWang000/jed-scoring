import { describe, expect, it } from 'vitest';
import {
  extractProjectState,
  isReadyClipCandidate,
  projectStateToBridgeState
} from '../../src/content/project-state';

function audioClip(overrides: Record<string, unknown> = {}) {
  return {
    type: 'audio',
    id: 'audio-1',
    name: '20260703-154527-SILENT-REFERENCE.WAV',
    startBeats: 0,
    endBeats: 43,
    readStartBeats: 0,
    transposition: 0,
    reversed: false,
    loop: { enabled: false, startBeats: 0, endBeats: 43 },
    warp: {
      enabled: false,
      awaitingAnalysis: false,
      markers: { 0: 0, 43: 43 }
    },
    asset: { type: 'clip', id: 'private-asset-id' },
    audio_url: 'https://private.example/audio.wav',
    ...overrides
  };
}

function projectState(overrides: Record<string, unknown> = {}) {
  return {
    project_id: 'private-project-id',
    user_id: 'private-user-id',
    title: 'Private title',
    lyrics: 'Private lyrics',
    prompt: 'Private prompt',
    timing: {
      type: 'manual',
      bps: 1,
      lockBPS: false,
      bpsAutomation: []
    },
    loop: { startBeats: 0, endBeats: 16, enabled: false },
    tracks: [{
      id: 'track-1',
      type: 'audio',
      clips: [
        audioClip(),
        { type: 'midi', id: 'midi-1', name: 'MIDI', startBeats: 0, endBeats: 4 },
        { type: 'video', id: 'video-1', name: 'Video', startBeats: 0, endBeats: 4 }
      ],
      takeLanes: [{ id: 'lane-1', clips: [audioClip({ id: 'take-lane-audio' })] }]
    }],
    markersRegistry: {
      privateHash: { 0: 0, 43: 43 }
    },
    ...overrides
  };
}

describe('extractProjectState', () => {
  it.each([
    ['direct state', (state: unknown) => state],
    ['top-level state', (state: unknown) => ({ state })],
    ['project state', (state: unknown) => ({ project: { state } })],
    ['revision state', (state: unknown) => ({ revision: { state } })],
    ['version state', (state: unknown) => ({ version: { state } })],
    ['single-encoded state', (state: unknown) => ({ state: JSON.stringify(state) })]
  ])('accepts the explicit %s envelope', (_name, wrap) => {
    const state = projectState();
    expect(extractProjectState(wrap(state), 'get')).toEqual(state);
  });

  it('accepts only a top-level state in a save request body', () => {
    const state = projectState();
    expect(extractProjectState({ state }, 'save')).toEqual(state);
    expect(extractProjectState({ project: { state } }, 'save')).toBeUndefined();
  });

  it('rejects recursive, ambiguous, and repeatedly encoded state discovery', () => {
    const state = projectState();
    expect(extractProjectState({ data: { state } }, 'get')).toBeUndefined();
    expect(extractProjectState({ state, project: { state } }, 'get')).toBeUndefined();
    expect(extractProjectState({ state: JSON.stringify(JSON.stringify(state)) }, 'get')).toBeUndefined();
  });
});

describe('projectStateToBridgeState', () => {
  it('projects only the safe top-level audio candidate and loop mapping', () => {
    const result = projectStateToBridgeState(projectState(), 123);

    expect(result).toEqual({
      status: 'ready',
      observedAtMs: 123,
      clips: [{
        id: 'audio-1',
        label: '20260703-154527-SILENT-REFERENCE.WAV',
        startSeconds: 0,
        durationSeconds: 43,
        trimStartSeconds: 0,
        speed: 1,
        warped: false,
        bindingEligibility: 'ready'
      }],
      loop: { startSeconds: 0, endSeconds: 16, enabled: false }
    });
    expect(JSON.stringify(result)).not.toMatch(
      /lyrics|prompt|user_id|audio_url|project_id|private-asset-id|privateHash|take-lane-audio/
    );
    if (result.status === 'ready') {
      expect(isReadyClipCandidate(result.clips[0])).toBe(true);
    }
  });

  it('resolves serialized marker hashes without exposing the registry', () => {
    const state = projectState({
      tracks: [{
        id: 'track-1',
        type: 'audio',
        clips: [audioClip({
          warp: {
            enabled: false,
            awaitingAnalysis: false,
            markersHash: 'privateHash'
          }
        })],
        takeLanes: []
      }]
    });

    const result = projectStateToBridgeState(state, 1);
    expect(result).toMatchObject({
      status: 'ready',
      clips: [{ bindingEligibility: 'ready', trimStartSeconds: 0 }]
    });
    expect(JSON.stringify(result)).not.toContain('privateHash');
  });

  it.each([
    ['analysis-pending', { warp: { enabled: false, awaitingAnalysis: true, markers: { 0: 0, 43: 43 } } }],
    ['reversed', { reversed: true }],
    ['looped', { loop: { enabled: true, startBeats: 0, endBeats: 43 } }],
    ['warped', { warp: { enabled: true, awaitingAnalysis: false, markers: { 0: 0, 43: 43 } } }],
    ['speed-changed', { transposition: 12 }],
    ['unsupported-mapping', { warp: null }]
  ])('keeps a %s candidate visible but not bindable', (eligibility, overrides) => {
    const state = projectState({
      tracks: [{
        id: 'track-1',
        type: 'audio',
        clips: [audioClip(overrides)],
        takeLanes: []
      }]
    });

    const result = projectStateToBridgeState(state, 5);
    expect(result).toMatchObject({
      status: 'ready',
      clips: [{ id: 'audio-1', bindingEligibility: eligibility }]
    });
    if (result.status === 'ready') {
      expect(isReadyClipCandidate(result.clips[0])).toBe(false);
    }
  });

  it.each([
    ['zero markers', {}],
    ['one marker', { 0: 0 }]
  ])('blocks enabled Warp with %s', (_name, markers) => {
    const result = projectStateToBridgeState(projectState({
      tracks: [{
        id: 'track-1',
        type: 'audio',
        clips: [audioClip({
          warp: { enabled: true, awaitingAnalysis: false, markers }
        })],
        takeLanes: []
      }]
    }), 10);

    expect(result).toMatchObject({
      status: 'ready',
      clips: [{ warped: true, bindingEligibility: 'warped' }]
    });
    if (result.status === 'ready') {
      expect(isReadyClipCandidate(result.clips[0])).toBe(false);
    }
  });

  it('fails closed instead of reporting a structurally changed project as empty', () => {
    expect(projectStateToBridgeState(projectState({
      tracks: [{ id: 'track-1', type: 'audio' }]
    }), 10)).toEqual({
      status: 'unsupported-project-shape',
      observedAtMs: 10
    });

    const { startBeats: _startBeats, ...renamedClip } = audioClip();
    expect(projectStateToBridgeState(projectState({
      tracks: [{ id: 'track-1', type: 'audio', clips: [{ ...renamedClip, startBeat: 0 }] }]
    }), 11)).toEqual({
      status: 'parse-failed',
      observedAtMs: 11
    });
  });

  it('reports unsupported timing instead of guessing a BPM', () => {
    expect(projectStateToBridgeState(projectState({
      timing: { type: 'follow-track', fallbackBPS: 2, trackId: 'track-1' }
    }), 10)).toEqual({
      status: 'unsupported-timing',
      observedAtMs: 10
    });
  });

  it('reports malformed state and invalid enabled project loops', () => {
    expect(projectStateToBridgeState({ timing: {}, tracks: 'invalid' }, 10)).toEqual({
      status: 'unsupported-project-shape',
      observedAtMs: 10
    });
    expect(projectStateToBridgeState(projectState({
      loop: { startBeats: 4, endBeats: 1, enabled: true }
    }), 10)).toEqual({ status: 'parse-failed', observedAtMs: 10 });
  });

  it('does not truncate projects with more than 256 audio candidates', () => {
    const clips = Array.from({ length: 257 }, (_, index) => audioClip({ id: `audio-${index}` }));
    const state = projectState({
      tracks: [{ id: 'track-1', type: 'audio', clips, takeLanes: [] }]
    });

    expect(projectStateToBridgeState(state, 10)).toEqual({
      status: 'too-many-clips',
      observedAtMs: 10
    });
  });

  it('distinguishes a valid empty project from a parse failure', () => {
    expect(projectStateToBridgeState(projectState({ tracks: [] }), 10)).toEqual({
      status: 'ready',
      observedAtMs: 10,
      clips: [],
      loop: { startSeconds: 0, endSeconds: 16, enabled: false }
    });
  });
});
