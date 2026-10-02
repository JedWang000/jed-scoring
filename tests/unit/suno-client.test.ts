// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { SunoSnapshot } from '../../src/content/suno-adapter';
import {
  BACKGROUND_REQUEST_TYPE,
  BACKGROUND_RESPONSE_TYPE
} from '../../src/background/protocol';
import {
  SNAPSHOT_REQUEST_TYPE,
  createSnapshotRequestHandler
} from '../../src/content/index';
import { SunoClient, type RuntimeMessenger } from '../../src/runtime/suno-client';

const healthySnapshot: SunoSnapshot = {
  health: 'healthy',
  bridgeStatus: 'ready',
  projectTimeSeconds: 4,
  isPlaying: true,
  clips: [],
  observedAtMs: 10
};

describe('content snapshot request handler', () => {
  it('responds asynchronously to the allowlisted snapshot request', async () => {
    const sendResponse = vi.fn();
    const handler = createSnapshotRequestHandler({
      readSnapshot: vi.fn(async () => healthySnapshot)
    });

    expect(handler({ type: SNAPSHOT_REQUEST_TYPE }, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({
      type: 'suno-video-sync:snapshot-response/v1',
      snapshot: healthySnapshot
    }));
  });

  it('ignores unrelated extension messages', () => {
    const handler = createSnapshotRequestHandler({
      readSnapshot: vi.fn(async () => healthySnapshot)
    });

    expect(handler({ type: 'other' }, vi.fn())).toBeUndefined();
  });
});

describe('SunoClient', () => {
  it('reads a validated snapshot from the background service worker', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'snapshot',
        snapshot: healthySnapshot
      }))
    };

    await expect(new SunoClient(runtime).readSnapshot()).resolves.toEqual(healthySnapshot);
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      type: BACKGROUND_REQUEST_TYPE,
      action: 'snapshot'
    });
  });

  it('accepts the same near-1 speed tolerance as the page bridge', async () => {
    const snapshot = {
      ...healthySnapshot,
      clips: [{
        id: 'clip-1',
        label: 'Reference',
        startSeconds: 0,
        durationSeconds: 43,
        trimStartSeconds: 0,
        speed: 1 + 5e-10,
        warped: false,
        bindingEligibility: 'ready' as const
      }]
    };
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'snapshot',
        snapshot
      }))
    };

    await expect(new SunoClient(runtime).readSnapshot()).resolves.toEqual(snapshot);
  });

  it('routes explicit connect and reload actions', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async (message) => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: (message as { action: string }).action,
        snapshot: healthySnapshot
      }))
    };
    const client = new SunoClient(runtime);

    await expect(client.connect()).resolves.toEqual(healthySnapshot);
    await expect(client.reloadStudio()).resolves.toEqual(healthySnapshot);
    expect(runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: BACKGROUND_REQUEST_TYPE,
      action: 'connect'
    });
    expect(runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: BACKGROUND_REQUEST_TYPE,
      action: 'reload'
    });
  });

  it('reads only validated diagnostic entries', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'diagnostics',
        entries: [{
          atMs: 10,
          category: 'transport',
          code: 'inventory',
          data: { buttonCount: 18 }
        }]
      }))
    };

    await expect(new SunoClient(runtime).readDiagnostics()).resolves.toEqual([{
      atMs: 10,
      category: 'transport',
      code: 'inventory',
      data: { buttonCount: 18 }
    }]);
  });

  it('fails closed when the background is unavailable or invalid', async () => {
    const unavailableRuntime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => {
        throw new Error('worker stopped');
      })
    };
    await expect(new SunoClient(unavailableRuntime).readSnapshot()).resolves.toMatchObject({
      health: 'unavailable',
      reason: 'CDP background service worker is not available.'
    });

    const invalidRuntime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({ snapshot: { health: 'healthy' } }))
    };
    await expect(new SunoClient(invalidRuntime).readSnapshot()).resolves.toMatchObject({
      health: 'unavailable',
      reason: 'CDP background returned an invalid snapshot.'
    });
  });

  it('rejects a healthy snapshot with an unsafe ready candidate', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'snapshot',
        snapshot: {
          ...healthySnapshot,
          clips: [{
            id: 'clip-1',
            label: 'Reference',
            startSeconds: 0,
            durationSeconds: 43,
            warped: false,
            bindingEligibility: 'ready'
          }]
        }
      }))
    };

    await expect(new SunoClient(runtime).readSnapshot()).resolves.toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      reason: 'CDP background returned an invalid snapshot.'
    });
  });

  it('rejects diagnostics that contain sensitive or unexpected fields', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'diagnostics',
        entries: [{
          atMs: 10,
          category: 'network',
          code: 'unsafe',
          data: { token: 'secret' }
        }]
      }))
    };

    await expect(new SunoClient(runtime).readDiagnostics()).resolves.toEqual([]);
  });

  it('rejects a response whose action does not match the request', async () => {
    const runtime: RuntimeMessenger = {
      sendMessage: vi.fn(async () => ({
        type: BACKGROUND_RESPONSE_TYPE,
        action: 'connect',
        snapshot: healthySnapshot
      }))
    };

    await expect(new SunoClient(runtime).readSnapshot()).resolves.toMatchObject({
      health: 'unavailable',
      reason: 'CDP background returned an invalid snapshot.'
    });
  });
});
