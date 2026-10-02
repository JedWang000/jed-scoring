import { describe, expect, it, vi } from 'vitest';
import type { CdpApi, CdpDetach, CdpEvent } from '../../src/background/cdp-api';
import { DiagnosticsBuffer } from '../../src/background/diagnostics-buffer';
import { CdpSessionManager } from '../../src/background/session-manager';
import {
  StudioController,
  type StudioTabsApi
} from '../../src/background/studio-controller';
import { TRANSPORT_BINDING_NAME } from '../../src/background/transport-protocol';

interface FakeApi extends CdpApi {
  eventListener?: (event: CdpEvent) => void;
  detachListener?: (event: CdpDetach) => void;
}

function projectState() {
  return {
    timing: { type: 'manual', bps: 1, lockBPS: false, bpsAutomation: [] },
    tracks: [{
      id: 'track-1',
      type: 'audio',
      clips: [{
        type: 'audio',
        id: 'audio-1',
        name: '20260703-154527-silent-reference.wav',
        startBeats: 0,
        endBeats: 43,
        readStartBeats: 0,
        transposition: 0,
        reversed: false,
        loop: { enabled: false },
        warp: { enabled: false, awaitingAnalysis: false, markers: { 0: 0, 43: 43 } }
      }],
      takeLanes: []
    }]
  };
}

function fakeApi(): FakeApi {
  const api: FakeApi = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    send: vi.fn(async (_tabId, method, params) => {
      if (method === 'Runtime.evaluate') {
        if (typeof (params as { expression?: unknown } | undefined)?.expression === 'string'
          && String((params as { expression: string }).expression).includes('semantic-time-cluster-v1')) {
          return {
            result: {
              type: 'object',
              value: {
                status: 'ready',
                timeCandidateCount: 1,
                localActionCandidateCount: 1,
                reactFiberPropertyCount: 1,
                reactFiberAlternatePresent: false,
                reactCurrentTreeResolved: true,
                reactFiberAncestorCount: 3,
                reactFiberTraversalComplete: true,
                reactProviderValueCount: 1,
                reactOwnerDepth0Count: 0,
                reactOwnerDepth1Count: 0,
                reactOwnerDepth2Count: 0,
                reactOwnerDepth3Count: 1,
                reactOwnerDepth4Count: 0,
                reactEvidenceTruncated: false
              }
            }
          };
        }
        return {
          result: {
            type: 'object',
            value: {
              buttonCount: 18,
              timeTextCandidateCount: 2,
              semanticPlayCandidateCount: 1,
              semanticPauseCandidateCount: 0
            }
          }
        };
      }
      if (method === 'Accessibility.getFullAXTree') {
        return { nodes: Array.from({ length: 31 }, () => ({ role: { type: 'role', value: 'button' } })) };
      }
      if (method === 'Network.getResponseBody') {
        return {
          body: JSON.stringify({ state: JSON.stringify(projectState()) }),
          base64Encoded: false
        };
      }
      return {};
    }),
    addEventListener: vi.fn((listener) => {
      api.eventListener = listener;
    }),
    addDetachListener: vi.fn((listener) => {
      api.detachListener = listener;
    })
  };
  return api;
}

function tabs(url = 'https://suno.com/studio/project'): StudioTabsApi {
  return {
    query: vi.fn(async () => [{ id: 7, url }])
  };
}

function emitReadyProject(api: FakeApi, requestId = 'project-ready'): void {
  api.eventListener?.({
    tabId: 7,
    method: 'Network.requestWillBeSent',
    params: {
      requestId,
      request: { method: 'GET', url: 'https://studio-api-prod.suno.com/api/studio/project/private-id' }
    }
  });
  api.eventListener?.({
    tabId: 7,
    method: 'Network.responseReceived',
    params: {
      requestId,
      response: { status: 200, mimeType: 'application/json', encodedDataLength: 100 }
    }
  });
  api.eventListener?.({
    tabId: 7,
    method: 'Network.loadingFinished',
    params: { requestId, encodedDataLength: 100 }
  });
}

function emitTransport(
  api: FakeApi,
  overrides: Partial<{
    sequence: number;
    pageTimestampMs: number;
    projectTimeSeconds: number;
    isPlaying: boolean;
    isScrubbing: boolean;
  }> = {}
): void {
  api.eventListener?.({
    tabId: 7,
    method: 'Runtime.bindingCalled',
    params: {
      name: TRANSPORT_BINDING_NAME,
      payload: JSON.stringify({
        v: 1,
        sequence: 1,
        pageTimestampMs: 10,
        projectTimeSeconds: 12.5,
        isPlaying: true,
        isScrubbing: false,
        strategyId: 'semantic-time-cluster-v1',
        ...overrides
      }),
      executionContextId: 1
    }
  });
}

describe('StudioController', () => {
  it('connects only the active Studio tab and records aggregate evidence', async () => {
    const api = fakeApi();
    const tabApi = tabs();
    const diagnostics = new DiagnosticsBuffer(20, () => 50);
    const controller = new StudioController(
      tabApi,
      new CdpSessionManager(api, () => 50),
      api,
      diagnostics
    );

    const snapshot = await controller.connect();

    expect(tabApi.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(api.attach).toHaveBeenCalledWith(7, '1.3');
    expect(api.send).toHaveBeenCalledWith(7, 'Runtime.addBinding', {
      name: TRANSPORT_BINDING_NAME
    });
    expect(api.send).toHaveBeenCalledWith(7, 'Runtime.evaluate', expect.objectContaining({
      returnByValue: true
    }));
    expect(api.send).toHaveBeenCalledWith(7, 'Accessibility.getFullAXTree');
    expect(snapshot).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: [],
      reason: 'Connected to Studio; waiting for project state.'
    });
    expect(controller.diagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'session', code: 'attached' }),
      expect.objectContaining({
        category: 'transport',
        code: 'inventory',
        data: expect.objectContaining({ buttonCount: 18, accessibilityRoleCount: 31 })
      }),
      expect.objectContaining({
        category: 'transport',
        code: 'probe-ready',
        data: expect.objectContaining({
          timeCandidateCount: 1,
          localActionCandidateCount: 1,
          reactFiberPropertyCount: 1,
          reactCurrentTreeResolved: true,
          reactOwnerDepth3Count: 1,
          reactEvidenceTruncated: false
        })
      })
    ]));
  });

  it('does not attach a non-Studio tab', async () => {
    const api = fakeApi();
    const diagnostics = new DiagnosticsBuffer(20, () => 50);
    const controller = new StudioController(
      tabs('https://suno.com/create'),
      new CdpSessionManager(api, () => 50),
      api,
      diagnostics
    );

    const snapshot = await controller.connect();

    expect(api.attach).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      health: 'unavailable',
      reason: 'No active Suno Studio tab is available.'
    });
    expect(controller.diagnostics()).toEqual([
      expect.objectContaining({ category: 'session', code: 'studio-tab-unavailable' })
    ]);
  });

  it('reloads only after a successful connection', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(20, () => 50)
    );

    await expect(controller.reload()).rejects.toThrow(/attached/i);
    await controller.connect();
    await controller.reload();

    expect(api.send).toHaveBeenCalledWith(7, 'Page.reload', { ignoreCache: false });
  });

  it('exposes projected audio candidates while transport remains unavailable', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(20, () => 50)
    );
    await controller.connect();

    api.eventListener?.({
      tabId: 7,
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'r1',
        request: { method: 'GET', url: 'https://studio-api-prod.suno.com/api/studio/project/private-id' }
      }
    });
    api.eventListener?.({
      tabId: 7,
      method: 'Network.responseReceived',
      params: {
        requestId: 'r1',
        response: { status: 200, mimeType: 'application/json', encodedDataLength: 100 }
      }
    });
    api.eventListener?.({
      tabId: 7,
      method: 'Network.loadingFinished',
      params: { requestId: 'r1', encodedDataLength: 100 }
    });

    await vi.waitFor(() => expect(controller.snapshot()).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      clips: [{
        id: 'audio-1',
        label: '20260703-154527-silent-reference.wav',
        bindingEligibility: 'ready'
      }],
      reason: 'Studio transport has not been observed.'
    }));
    expect(controller.diagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'project',
        code: 'shape',
        data: expect.objectContaining({
          timingKind: 'manual',
          trackCount: 1,
          audioTrackCount: 1,
          clipCount: 1,
          audioClipCount: 1
        })
      })
    ]));
  });

  it('keeps a ready project when a later save body is unavailable', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(20, () => 50)
    );
    await controller.connect();

    api.eventListener?.({
      tabId: 7,
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'r1',
        request: { method: 'GET', url: 'https://studio-api-prod.suno.com/api/studio/project/private-id' }
      }
    });
    api.eventListener?.({
      tabId: 7,
      method: 'Network.responseReceived',
      params: {
        requestId: 'r1',
        response: { status: 200, mimeType: 'application/json', encodedDataLength: 100 }
      }
    });
    api.eventListener?.({
      tabId: 7,
      method: 'Network.loadingFinished',
      params: { requestId: 'r1', encodedDataLength: 100 }
    });
    await vi.waitFor(() => expect(controller.snapshot().bridgeStatus).toBe('ready'));

    api.eventListener?.({
      tabId: 7,
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'save-missing',
        request: {
          method: 'POST',
          url: 'https://studio-api-prod.suno.com/api/studio/save-project'
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.snapshot()).toMatchObject({
      bridgeStatus: 'ready',
      clips: [{ id: 'audio-1' }]
    });
  });

  it('becomes healthy after same-generation project and transport observations', async () => {
    const api = fakeApi();
    const diagnostics = new DiagnosticsBuffer(30, () => 50);
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      diagnostics,
      () => 50
    );
    await controller.connect();

    emitReadyProject(api);
    emitTransport(api);

    await vi.waitFor(() => expect(controller.snapshot()).toMatchObject({
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: 12.5,
      isPlaying: true,
      clips: [{ id: 'audio-1' }]
    }));
    expect(diagnostics.entries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'transport',
        code: 'accepted',
        data: expect.objectContaining({
          generation: 1,
          sequence: 1,
          strategyId: 'semantic-time-cluster-v1'
        })
      })
    ]));
  });

  it('keeps the Studio snapshot healthy at a negative pre-roll position', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(30, () => 50),
      () => 50
    );
    await controller.connect();

    emitReadyProject(api);
    emitTransport(api, {
      projectTimeSeconds: -0.75,
      isPlaying: false,
      isScrubbing: true
    });

    await vi.waitFor(() => expect(controller.snapshot()).toMatchObject({
      health: 'healthy',
      projectTimeSeconds: -0.75,
      isPlaying: false,
      clips: [{ id: 'audio-1', startSeconds: 0 }]
    }));
  });

  it('ignores older transport payloads', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(30, () => 50),
      () => 50
    );
    await controller.connect();
    emitReadyProject(api);
    emitTransport(api, { sequence: 2, pageTimestampMs: 20, projectTimeSeconds: 20 });
    emitTransport(api, { sequence: 1, pageTimestampMs: 10, projectTimeSeconds: 99 });

    await vi.waitFor(() => expect(controller.snapshot()).toMatchObject({
      health: 'healthy',
      projectTimeSeconds: 20
    }));
  });

  it('invalidates project and transport on top-frame navigation and reinjects the probe', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(30, () => 50),
      () => 50
    );
    await controller.connect();
    emitReadyProject(api);
    emitTransport(api);
    await vi.waitFor(() => expect(controller.snapshot().health).toBe('healthy'));
    const bindingCallCount = vi.mocked(api.send).mock.calls.filter((call) => (
      call[1] === 'Runtime.addBinding'
    )).length;
    const evaluateCallCount = vi.mocked(api.send).mock.calls.filter((call) => (
      call[1] === 'Runtime.evaluate'
    )).length;

    api.eventListener?.({
      tabId: 7,
      method: 'Page.frameNavigated',
      params: { frame: { id: 'top-frame', url: 'https://suno.com/studio/next-project' } }
    });
    await vi.waitFor(() => expect(controller.snapshot()).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: []
    }));
    await vi.waitFor(() => expect(
      vi.mocked(api.send).mock.calls.filter((call) => call[1] === 'Runtime.evaluate').length
    ).toBeGreaterThan(evaluateCallCount));
    expect(vi.mocked(api.send).mock.calls.filter((call) => (
      call[1] === 'Runtime.addBinding'
    ))).toHaveLength(bindingCallCount);
  });

  it('invalidates old project and transport immediately when an explicit reload starts', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(30, () => 50),
      () => 50
    );
    await controller.connect();
    emitReadyProject(api);
    emitTransport(api);
    await vi.waitFor(() => expect(controller.snapshot().health).toBe('healthy'));

    await controller.reload();

    expect(controller.snapshot()).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: []
    });
  });

  it('reinstalls the transport probe when the user reconnects an already attached tab', async () => {
    const api = fakeApi();
    const controller = new StudioController(
      tabs(),
      new CdpSessionManager(api, () => 50),
      api,
      new DiagnosticsBuffer(30, () => 50),
      () => 50
    );
    await controller.connect();
    const probeEvaluateCount = () => vi.mocked(api.send).mock.calls.filter((call) => (
      call[1] === 'Runtime.evaluate'
      && typeof (call[2] as { expression?: unknown } | undefined)?.expression === 'string'
      && String((call[2] as { expression: string }).expression).includes('semantic-time-cluster-v1')
    )).length;
    const firstCount = probeEvaluateCount();

    await controller.connect();

    expect(probeEvaluateCount()).toBeGreaterThan(firstCount);
    expect(vi.mocked(api.send).mock.calls.filter((call) => (
      call[1] === 'Runtime.addBinding'
    ))).toHaveLength(1);
  });
});
