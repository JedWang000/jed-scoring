import { describe, expect, it, vi } from 'vitest';
import {
  CdpSessionManager,
  type CdpApi,
  type CdpDetach,
  type CdpEvent
} from '../../src/background/session-manager';

interface FakeApi extends CdpApi {
  eventListener?: (event: CdpEvent) => void;
  detachListener?: (event: CdpDetach) => void;
}

function fakeApi(): FakeApi {
  const api: FakeApi = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    send: vi.fn(async () => ({})),
    addEventListener: vi.fn((listener) => {
      api.eventListener = listener;
    }),
    addDetachListener: vi.fn((listener) => {
      api.detachListener = listener;
    })
  };
  return api;
}

describe('CdpSessionManager', () => {
  it('attaches and enables only the approved domains', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);

    await manager.connect(7);

    expect(api.attach).toHaveBeenCalledWith(7, '1.3');
    expect(vi.mocked(api.send).mock.calls.map((call) => call[1])).toEqual([
      'Network.enable',
      'Runtime.enable',
      'DOM.enable',
      'Accessibility.enable',
      'Page.enable'
    ]);
    expect(manager.snapshot()).toEqual({
      state: 'attached',
      tabId: 7,
      generation: 1,
      changedAtMs: 100
    });
  });

  it('routes events only for the attached tab and current generation', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.connect(7);

    api.eventListener?.({ tabId: 8, method: 'Network.responseReceived' });
    api.eventListener?.({ tabId: 7, method: 'Network.responseReceived', params: { requestId: 'r1' } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      tabId: 7,
      method: 'Network.responseReceived',
      params: { requestId: 'r1' }
    }, 1);
  });

  it('invalidates the generation on detach and ignores late old-tab events', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.connect(7);

    api.detachListener?.({ tabId: 7, reason: 'replaced_with_devtools' });
    api.eventListener?.({ tabId: 7, method: 'Network.responseReceived' });

    expect(manager.snapshot()).toEqual({
      state: 'detached',
      generation: 2,
      changedAtMs: 100,
      reason: 'replaced_with_devtools'
    });
    expect(manager.accepts(7, 1)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reloads only an attached target', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);

    await expect(manager.reload()).rejects.toThrow(/attached/i);
    await manager.connect(7);
    await manager.reload();

    expect(api.send).toHaveBeenLastCalledWith(7, 'Page.reload', { ignoreCache: false });
    expect(manager.snapshot()).toMatchObject({ state: 'attached', tabId: 7, generation: 1 });
  });

  it('reports attach failures without accepting events', async () => {
    const api = fakeApi();
    vi.mocked(api.attach).mockRejectedValueOnce(new Error('Another debugger is attached'));
    const manager = new CdpSessionManager(api, () => 100);

    await manager.connect(7);

    expect(manager.snapshot()).toEqual({
      state: 'failed',
      tabId: 7,
      generation: 1,
      changedAtMs: 100,
      reason: 'Another debugger is attached'
    });
    expect(manager.accepts(7, 1)).toBe(false);
  });

  it('reuses the current target and detaches it explicitly', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    await manager.connect(7);

    await manager.connect(7);
    expect(api.attach).toHaveBeenCalledTimes(1);

    await manager.disconnect();
    expect(api.detach).toHaveBeenCalledWith(7);
    expect(manager.snapshot()).toEqual({
      state: 'detached',
      generation: 2,
      changedAtMs: 100
    });
  });

  it('detaches the previous target before attaching a different tab', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    await manager.connect(7);

    await manager.connect(8);

    expect(api.detach).toHaveBeenCalledWith(7);
    expect(api.attach).toHaveBeenLastCalledWith(8, '1.3');
    expect(manager.snapshot()).toMatchObject({ state: 'attached', tabId: 8, generation: 2 });
  });

  it('reports lifecycle transitions to production observers', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    const states: string[] = [];
    manager.onStateChange((snapshot) => states.push(snapshot.state));

    await manager.connect(7);
    api.detachListener?.({ tabId: 7, reason: 'target_closed' });

    expect(states).toEqual(['attaching', 'attached', 'detached']);
  });

  it('continues routing current-generation events while Page.reload is in flight', async () => {
    const api = fakeApi();
    let finishReload: (() => void) | undefined;
    vi.mocked(api.send).mockImplementation(async (_tabId, method) => {
      if (method === 'Page.reload') {
        await new Promise<void>((resolve) => {
          finishReload = resolve;
        });
      }
      return {};
    });
    const manager = new CdpSessionManager(api, () => 100);
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.connect(7);

    const reload = manager.reload();
    await vi.waitFor(() => expect(manager.snapshot().state).toBe('reloading'));
    api.eventListener?.({ tabId: 7, method: 'Network.responseReceived' });

    expect(manager.accepts(7, 1)).toBe(true);
    expect(listener).toHaveBeenCalledWith({ tabId: 7, method: 'Network.responseReceived' }, 1);
    finishReload?.();
    await reload;
  });

  it('completes an in-flight reload when the top frame has navigated', async () => {
    const api = fakeApi();
    let finishReload: (() => void) | undefined;
    vi.mocked(api.send).mockImplementation(async (_tabId, method) => {
      if (method === 'Page.reload') {
        await new Promise<void>((resolve) => {
          finishReload = resolve;
        });
      }
      return {};
    });
    const manager = new CdpSessionManager(api, () => 100);
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.connect(7);

    const reload = manager.reload();
    await vi.waitFor(() => expect(manager.snapshot().state).toBe('reloading'));
    api.eventListener?.({
      tabId: 7,
      method: 'Page.frameNavigated',
      params: { frame: { id: 'main-frame', url: 'https://suno.com/studio' } }
    });
    const afterNavigation = manager.snapshot();
    finishReload?.();
    await reload;

    expect(afterNavigation).toMatchObject({
      state: 'attached',
      tabId: 7,
      generation: 2
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'Page.frameNavigated' }),
      2
    );
  });

  it('increments the generation before routing a top-frame navigation', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    const listener = vi.fn();
    manager.onEvent(listener);
    await manager.connect(7);

    api.eventListener?.({
      tabId: 7,
      method: 'Page.frameNavigated',
      params: { frame: { id: 'main-frame', url: 'https://suno.com/studio' } }
    });

    expect(manager.snapshot()).toMatchObject({ state: 'attached', tabId: 7, generation: 2 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ method: 'Page.frameNavigated' }), 2);
  });

  it('does not change generation for a child-frame navigation', async () => {
    const api = fakeApi();
    const manager = new CdpSessionManager(api, () => 100);
    await manager.connect(7);

    api.eventListener?.({
      tabId: 7,
      method: 'Page.frameNavigated',
      params: { frame: { id: 'child-frame', parentId: 'main-frame', url: 'https://example.com/frame' } }
    });

    expect(manager.snapshot()).toMatchObject({ generation: 1 });
  });
});
