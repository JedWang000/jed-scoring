// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  SUNO_PAGE_BRIDGE_REQUEST,
  SUNO_PAGE_BRIDGE_SOURCE,
  SUNO_PAGE_BRIDGE_STATE,
  SUNO_PAGE_BRIDGE_VERSION,
  isSunoPageBridgeMessage,
  isSunoPageBridgeRequest,
  postSunoPageBridgeRequest,
  postSunoPageBridgeState
} from '../../src/content/page-bridge';
import type { SunoBridgeState } from '../../src/content/project-state';

const readyState: SunoBridgeState = {
  status: 'ready',
  observedAtMs: 10,
  clips: [{
    id: 'clip-1',
    label: 'Reference',
    startSeconds: 0,
    durationSeconds: 43,
    trimStartSeconds: 0,
    speed: 1,
    warped: false,
    bindingEligibility: 'ready'
  }],
  loop: { startSeconds: 0, endSeconds: 16, enabled: false }
};

function stateMessage(state: unknown) {
  return {
    source: SUNO_PAGE_BRIDGE_SOURCE,
    version: SUNO_PAGE_BRIDGE_VERSION,
    type: SUNO_PAGE_BRIDGE_STATE,
    state
  };
}

describe('page bridge requests', () => {
  it('posts and validates the fixed snapshot request', () => {
    const postMessage = vi.spyOn(window, 'postMessage');

    postSunoPageBridgeRequest(window);

    const expected = {
      source: SUNO_PAGE_BRIDGE_SOURCE,
      version: 1,
      type: SUNO_PAGE_BRIDGE_REQUEST
    };
    expect(postMessage).toHaveBeenCalledWith(expected, window.location.origin);
    expect(isSunoPageBridgeRequest(expected)).toBe(true);
    expect(isSunoPageBridgeRequest({ ...expected, unexpected: true })).toBe(false);
  });
});

describe('page bridge state messages', () => {
  it('validates a ready state and every fixed non-ready status', () => {
    expect(isSunoPageBridgeMessage(stateMessage(readyState))).toBe(true);
    for (const status of [
      'waiting-for-project-state',
      'unsupported-project-shape',
      'unsupported-timing',
      'too-many-clips',
      'parse-failed'
    ]) {
      expect(isSunoPageBridgeMessage(stateMessage({ status, observedAtMs: 10 }))).toBe(true);
    }
  });

  it('posts only whitelisted state and candidate fields', () => {
    const postMessage = vi.spyOn(window, 'postMessage');
    const unsafe = {
      ...readyState,
      privateProjectId: 'must-not-cross',
      clips: [{ ...readyState.clips[0], audio_url: 'must-not-cross' }]
    } as SunoBridgeState;

    postSunoPageBridgeState(window, unsafe);

    expect(postMessage).toHaveBeenCalledWith(stateMessage(readyState), window.location.origin);
  });

  it('rejects extra keys at every protocol level', () => {
    expect(isSunoPageBridgeMessage({
      ...stateMessage(readyState),
      extra: true
    })).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      extra: true
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], extra: true }]
    }))).toBe(false);
  });

  it('rejects oversized, non-finite, and out-of-range payloads', () => {
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], label: 'x'.repeat(513) }]
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: Array.from({ length: 257 }, (_, index) => ({
        ...readyState.clips[0],
        id: `clip-${index}`
      }))
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], startSeconds: Number.NaN }]
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], durationSeconds: 86_401 }]
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], speed: 17 }]
    }))).toBe(false);
  });

  it('enforces candidate eligibility and ready mapping invariants', () => {
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], bindingEligibility: 'future-mode' }]
    }))).toBe(false);
    const { speed: _speed, ...missingSpeed } = readyState.clips[0];
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [missingSpeed]
    }))).toBe(false);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{ ...readyState.clips[0], speed: 1 + 5e-10 }]
    }))).toBe(true);
    expect(isSunoPageBridgeMessage(stateMessage({
      ...readyState,
      clips: [{
        id: 'warped-1',
        label: 'Warped',
        startSeconds: 0,
        durationSeconds: 10,
        warped: true,
        bindingEligibility: 'warped'
      }]
    }))).toBe(true);
  });

  it('rejects prototype-pollution-shaped payloads', () => {
    const pollutedState = JSON.parse(
      '{"status":"ready","observedAtMs":10,"clips":[],"__proto__":{"polluted":true}}'
    );
    expect(isSunoPageBridgeMessage(stateMessage(pollutedState))).toBe(false);
  });
});
