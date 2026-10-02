import {
  isSunoPageBridgeRequest,
  postSunoPageBridgeState
} from './page-bridge';
import {
  extractProjectState,
  projectStateToBridgeState,
  type SunoBridgeState
} from './project-state';

export interface SunoFetchHost {
  fetch: typeof fetch;
  readonly location: { readonly href: string; readonly origin: string };
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void
  ): void;
}

interface RequestLike {
  readonly url: string;
  readonly method: string;
  clone(): { text(): Promise<string> };
}

interface Observation {
  readonly kind: 'get' | 'save';
  readonly pageIdentity: string;
  readonly requestBody?: Promise<BodyReadResult>;
}

type BodyReadResult =
  | { readonly status: 'parsed'; readonly value: unknown }
  | { readonly status: 'parse-failed' };

interface Installation {
  readonly wrapper: typeof fetch;
  readonly restore: () => void;
}

const allowedOrigins = new Set([
  'https://suno.com',
  'https://studio-api-prod.suno.com'
]);

const getPaths = [
  /^\/api\/studio\/project\/[^/]+$/,
  /^\/api\/studio\/project_revision\/[^/]+$/,
  /^\/api\/studio\/[^/]+\/version\/[^/]+$/
];

const savePath = /^\/api\/studio\/save-project\/?$/;
const installations = new WeakMap<object, Installation>();

function isRequestLike(value: unknown): value is RequestLike {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { url?: unknown }).url === 'string'
    && typeof (value as { method?: unknown }).method === 'string'
    && typeof (value as { clone?: unknown }).clone === 'function';
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return isRequestLike(input) ? input.url : undefined;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (isRequestLike(input) ? input.method : 'GET');
  return method.toUpperCase();
}

function currentPageIdentity(host: SunoFetchHost): string | undefined {
  try {
    const page = new URL(host.location.href);
    return `${page.origin}${page.pathname}`;
  } catch {
    return undefined;
  }
}

async function parseJsonText(text: string): Promise<BodyReadResult> {
  try {
    return { status: 'parsed', value: JSON.parse(text) as unknown };
  } catch {
    return { status: 'parse-failed' };
  }
}

function readSaveBody(input: RequestInfo | URL, init?: RequestInit): Promise<BodyReadResult> {
  if (init?.body !== undefined && init.body !== null) {
    return typeof init.body === 'string'
      ? parseJsonText(init.body)
      : Promise.resolve({ status: 'parse-failed' });
  }
  if (!isRequestLike(input)) return Promise.resolve({ status: 'parse-failed' });
  try {
    const clone = input.clone();
    return clone.text().then(parseJsonText, () => ({ status: 'parse-failed' }));
  } catch {
    return Promise.resolve({ status: 'parse-failed' });
  }
}

function classifyRequest(
  host: SunoFetchHost,
  input: RequestInfo | URL,
  init?: RequestInit
): Observation | undefined {
  const rawUrl = requestUrl(input);
  if (!rawUrl) return undefined;

  let url: URL;
  try {
    url = new URL(rawUrl, host.location.href);
  } catch {
    return undefined;
  }
  if (!allowedOrigins.has(url.origin)) return undefined;
  const pageIdentity = currentPageIdentity(host);
  if (!pageIdentity) return undefined;

  const method = requestMethod(input, init);
  if (method === 'GET' && getPaths.some((pattern) => pattern.test(url.pathname))) {
    return { kind: 'get', pageIdentity };
  }
  if (method === 'POST' && savePath.test(url.pathname)) {
    return { kind: 'save', pageIdentity, requestBody: readSaveBody(input, init) };
  }
  return undefined;
}

function postState(host: SunoFetchHost, state: SunoBridgeState): void {
  postSunoPageBridgeState(host as unknown as Window, state);
}

async function readGetEnvelope(response: Response): Promise<BodyReadResult> {
  try {
    return { status: 'parsed', value: await response.clone().json() as unknown };
  } catch {
    return { status: 'parse-failed' };
  }
}

export function installSunoFetchObserver(host: SunoFetchHost): () => void {
  const existing = installations.get(host);
  if (existing) return existing.restore;

  const originalFetch = host.fetch;
  let latestObservation: {
    readonly state: SunoBridgeState;
    readonly pageIdentity: string;
  } | undefined;

  const publish = (state: SunoBridgeState, pageIdentity: string) => {
    if (pageIdentity !== currentPageIdentity(host)) return;
    latestObservation = { state, pageIdentity };
    postState(host, state);
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== host || event.origin !== host.location.origin) return;
    if (!isSunoPageBridgeRequest(event.data)) return;
    const pageIdentity = currentPageIdentity(host);
    const state = pageIdentity && latestObservation?.pageIdentity === pageIdentity
      ? latestObservation.state
      : { status: 'waiting-for-project-state' as const, observedAtMs: Date.now() };
    postState(host, state);
  };
  host.addEventListener('message', onMessage);

  const wrapper = function observedFetch(
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit
  ): ReturnType<typeof fetch> {
    let observation: Observation | undefined;
    try {
      observation = classifyRequest(host, input, init);
    } catch {
      observation = undefined;
    }

    const originalPromise = Reflect.apply(originalFetch, this, [input, init]) as ReturnType<typeof fetch>;
    if (observation) {
      void originalPromise.then(async (response) => {
        if (!response.ok) return;
        const body = observation.kind === 'get'
          ? await readGetEnvelope(response)
          : await observation.requestBody!;
        const observedAtMs = Date.now();
        if (body.status === 'parse-failed') {
          publish({ status: 'parse-failed', observedAtMs }, observation.pageIdentity);
          return;
        }
        const state = extractProjectState(body.value, observation.kind);
        publish(state
          ? projectStateToBridgeState(state, observedAtMs)
          : { status: 'unsupported-project-shape', observedAtMs }, observation.pageIdentity);
      }, () => undefined).catch(() => undefined);
    }
    return originalPromise;
  } as typeof fetch;

  host.fetch = wrapper;
  const restore = () => {
    const current = installations.get(host);
    if (!current || current.wrapper !== wrapper) return;
    host.removeEventListener('message', onMessage);
    if (host.fetch === wrapper) host.fetch = originalFetch;
    installations.delete(host);
  };
  installations.set(host, { wrapper, restore });
  return restore;
}
