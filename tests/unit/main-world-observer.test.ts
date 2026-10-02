import { describe, expect, it, vi } from 'vitest';
import {
  installSunoFetchObserver,
  type SunoFetchHost
} from '../../src/content/main-world-observer';
import {
  SUNO_PAGE_BRIDGE_REQUEST,
  SUNO_PAGE_BRIDGE_SOURCE,
  SUNO_PAGE_BRIDGE_STATE,
  SUNO_PAGE_BRIDGE_VERSION
} from '../../src/content/page-bridge';

function projectState() {
  return {
    timing: { type: 'manual', bps: 1, lockBPS: false, bpsAutomation: [] },
    loop: { startBeats: 0, endBeats: 16, enabled: false },
    tracks: [{
      id: 'track-1',
      type: 'audio',
      clips: [{
        type: 'audio',
        id: 'clip-1',
        name: 'Reference',
        startBeats: 0,
        endBeats: 43,
        readStartBeats: 0,
        transposition: 0,
        reversed: false,
        loop: { enabled: false, startBeats: 0, endBeats: 43 },
        warp: { enabled: false, awaitingAnalysis: false, markers: { 0: 0, 43: 43 } }
      }],
      takeLanes: []
    }]
  };
}

function bridgeRequest() {
  return {
    source: SUNO_PAGE_BRIDGE_SOURCE,
    version: SUNO_PAGE_BRIDGE_VERSION,
    type: SUNO_PAGE_BRIDGE_REQUEST
  };
}

function createHost(fetchImpl: typeof fetch) {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  const postMessage = vi.fn();
  const location = {
    href: 'https://suno.com/studio/project-a',
    origin: 'https://suno.com'
  };
  const host: SunoFetchHost = {
    fetch: fetchImpl,
    location,
    postMessage,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener)
  };
  const dispatch = (data: unknown, origin = host.location.origin, source: unknown = host) => {
    const event = { data, origin, source } as MessageEvent<unknown>;
    for (const listener of listeners) listener(event);
  };
  return { host, location, postMessage, dispatch };
}

async function waitForPostedState(postMessage: ReturnType<typeof vi.fn>) {
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
  return postMessage.mock.calls.at(-1)?.[0] as {
    type: string;
    state: { status: string; clips?: unknown[] };
  };
}

describe('installSunoFetchObserver', () => {
  it('returns the original GET promise and publishes a safe project snapshot', async () => {
    const response = new Response(JSON.stringify({ state: projectState() }), { status: 200 });
    const originalPromise = Promise.resolve(response);
    const originalFetch = vi.fn(() => originalPromise) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    const restore = installSunoFetchObserver(host);

    const returned = host.fetch('https://suno.com/api/studio/project/project-1');

    expect(returned).toBe(originalPromise);
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(await waitForPostedState(postMessage)).toMatchObject({
      type: SUNO_PAGE_BRIDGE_STATE,
      state: { status: 'ready', clips: [{ id: 'clip-1', label: 'Reference' }] }
    });
    restore();
  });

  it.each([
    ['foreign origin', 'https://evil.example/api/studio/project/project-1', undefined],
    ['near-match path', 'https://suno.com/api/studio/project/project-1/extra', undefined],
    ['trailing-slash expansion', 'https://suno.com/api/studio/project/project-1/', undefined],
    ['unrelated path', 'https://suno.com/api/studio/clips/clip-1', undefined],
    ['wrong method', 'https://suno.com/api/studio/project/project-1', { method: 'POST' }]
  ])('ignores a %s while preserving fetch', async (_name, input, init) => {
    const originalPromise = Promise.resolve(new Response('{}', { status: 200 }));
    const originalFetch = vi.fn(() => originalPromise) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);

    expect(host.fetch(input, init)).toBe(originalPromise);
    await originalPromise;
    await Promise.resolve();
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('accepts the production Studio API origin and URL input', async () => {
    const originalFetch = vi.fn(async () => new Response(
      JSON.stringify({ project: { state: projectState() } }),
      { status: 200 }
    )) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);

    await host.fetch(new URL('https://studio-api-prod.suno.com/api/studio/project/p1'));

    expect((await waitForPostedState(postMessage)).state.status).toBe('ready');
  });

  it('reads a successful save body from init without publishing failed saves', async () => {
    const successfulFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const successful = createHost(successfulFetch);
    installSunoFetchObserver(successful.host);

    await successful.host.fetch('https://suno.com/api/studio/save-project', {
      method: 'POST',
      body: JSON.stringify({ project_id: 'private', state: projectState() })
    });
    expect((await waitForPostedState(successful.postMessage)).state.status).toBe('ready');

    const failedFetch = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const failed = createHost(failedFetch);
    installSunoFetchObserver(failed.host);
    await failed.host.fetch('https://suno.com/api/studio/save-project', {
      method: 'POST',
      body: JSON.stringify({ state: projectState() })
    });
    await Promise.resolve();
    expect(failed.postMessage).not.toHaveBeenCalled();
  });

  it('accepts the planned trailing-slash save endpoint', async () => {
    const originalFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);

    await host.fetch('https://suno.com/api/studio/save-project/', {
      method: 'POST',
      body: JSON.stringify({ state: projectState() })
    });

    expect((await waitForPostedState(postMessage)).state.status).toBe('ready');
  });

  it('clones a Request body without consuming the original', async () => {
    const originalFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);
    const request = new Request('https://suno.com/api/studio/save-project', {
      method: 'POST',
      body: JSON.stringify({ state: projectState() })
    });

    await host.fetch(request);

    expect(request.bodyUsed).toBe(false);
    expect((await waitForPostedState(postMessage)).state.status).toBe('ready');
  });

  it('honors an init method and body override', async () => {
    const originalFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);
    const request = new Request('https://suno.com/api/studio/save-project', {
      method: 'GET',
      body: undefined
    });

    await host.fetch(request, {
      method: 'POST',
      body: JSON.stringify({ state: projectState() })
    });

    expect((await waitForPostedState(postMessage)).state.status).toBe('ready');
  });

  it('preserves rejection and synchronous throw semantics', async () => {
    const rejected = Promise.reject(new Error('network failed'));
    rejected.catch(() => undefined);
    const rejectedFetch = vi.fn(() => rejected) as unknown as typeof fetch;
    const rejectedHost = createHost(rejectedFetch);
    installSunoFetchObserver(rejectedHost.host);

    const returned = rejectedHost.host.fetch('https://suno.com/api/studio/project/p1');
    expect(returned).toBe(rejected);
    await expect(returned).rejects.toThrow('network failed');
    expect(rejectedHost.postMessage).not.toHaveBeenCalled();

    const thrown = new Error('sync failure');
    const throwingFetch = vi.fn(() => { throw thrown; }) as unknown as typeof fetch;
    const throwingHost = createHost(throwingFetch);
    installSunoFetchObserver(throwingHost.host);
    expect(() => throwingHost.host.fetch('https://suno.com/api/studio/project/p1')).toThrow(thrown);
  });

  it('turns observation parsing failures into status without changing the response', async () => {
    const response = new Response('not-json', { status: 200 });
    const originalFetch = vi.fn(async () => response) as unknown as typeof fetch;
    const { host, postMessage } = createHost(originalFetch);
    installSunoFetchObserver(host);

    await expect(host.fetch('https://suno.com/api/studio/project/p1')).resolves.toBe(response);

    expect((await waitForPostedState(postMessage)).state.status).toBe('parse-failed');
  });

  it('responds to validated requests with waiting then the cached safe state', async () => {
    const originalFetch = vi.fn(async () => new Response(
      JSON.stringify({ state: projectState() }),
      { status: 200 }
    )) as unknown as typeof fetch;
    const { host, postMessage, dispatch } = createHost(originalFetch);
    installSunoFetchObserver(host);

    dispatch(bridgeRequest());
    expect((await waitForPostedState(postMessage)).state.status).toBe('waiting-for-project-state');
    postMessage.mockClear();

    await host.fetch('https://suno.com/api/studio/project/p1');
    await waitForPostedState(postMessage);
    postMessage.mockClear();
    dispatch(bridgeRequest());

    expect((await waitForPostedState(postMessage)).state.status).toBe('ready');
    postMessage.mockClear();
    dispatch(bridgeRequest(), 'https://evil.example');
    dispatch(bridgeRequest(), host.location.origin, {});
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('drops an old-route response and scopes cached handshakes to the observed route', async () => {
    let resolveResponse!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const originalFetch = vi.fn(() => pendingResponse) as unknown as typeof fetch;
    const { host, location, postMessage, dispatch } = createHost(originalFetch);
    installSunoFetchObserver(host);

    const returned = host.fetch('https://suno.com/api/studio/project/project-a');
    location.href = 'https://suno.com/studio/project-b';
    resolveResponse(new Response(JSON.stringify({ state: projectState() }), { status: 200 }));
    await returned;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(postMessage).not.toHaveBeenCalled();
    dispatch(bridgeRequest());
    expect((await waitForPostedState(postMessage)).state.status).toBe('waiting-for-project-state');
  });

  it('installs idempotently and restores only its own wrapper', () => {
    const originalFetch = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const { host } = createHost(originalFetch);

    const firstRestore = installSunoFetchObserver(host);
    const wrapper = host.fetch;
    const secondRestore = installSunoFetchObserver(host);
    expect(host.fetch).toBe(wrapper);

    secondRestore();
    expect(host.fetch).toBe(originalFetch);
    firstRestore();
    expect(host.fetch).toBe(originalFetch);
  });

  it('never reads headers, cookies, or browser storage', async () => {
    const requestLike = {
      url: 'https://suno.com/api/studio/project/p1',
      method: 'GET',
      clone: vi.fn(),
      get headers() { throw new Error('headers touched'); }
    } as unknown as Request;
    const originalFetch = vi.fn(async () => new Response(
      JSON.stringify({ state: projectState() }),
      { status: 200 }
    )) as unknown as typeof fetch;
    const created = createHost(originalFetch);
    Object.defineProperties(created.host, {
      cookie: { get: () => { throw new Error('cookie touched'); } },
      localStorage: { get: () => { throw new Error('localStorage touched'); } },
      sessionStorage: { get: () => { throw new Error('sessionStorage touched'); } }
    });
    installSunoFetchObserver(created.host);

    await created.host.fetch(requestLike);

    expect((await waitForPostedState(created.postMessage)).state.status).toBe('ready');
  });
});
