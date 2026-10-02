import {
  extractProjectState,
  projectStateToBridgeState,
  type SunoBridgeState
} from '../content/project-state';
import type { CdpEvent } from './cdp-api';

export type StudioEndpointKind = 'project' | 'revision' | 'version' | 'save';

export type ProjectCollectorRejection =
  | 'http-status'
  | 'response-too-large'
  | 'non-json'
  | 'generation-mismatch'
  | 'base64-body'
  | 'body-too-large'
  | 'body-unavailable'
  | 'invalid-json'
  | 'invalid-result'
  | 'save-body-missing';

export interface ProjectObservation {
  readonly generation: number;
  readonly source: StudioEndpointKind;
  readonly state: SunoBridgeState;
}

export interface ProjectSchemaEvidence {
  readonly generation: number;
  readonly source: StudioEndpointKind;
  readonly stateFieldCount: number;
  readonly timingFieldCount: number;
  readonly trackCount: number;
  readonly audioTrackCount: number;
  readonly clipCount: number;
  readonly audioClipCount: number;
  readonly timingKind: string;
  readonly trackKinds: string;
  readonly clipKinds: string;
  readonly stateFields: string;
  readonly timingFields: string;
  readonly trackFields: string;
  readonly clipFields: string;
}

export type CdpCommandSender = (
  tabId: number,
  method: string,
  params?: object
) => Promise<unknown>;

interface PendingRequest {
  readonly kind: Exclude<StudioEndpointKind, 'save'>;
  readonly generation: number;
  readonly responseReady: boolean;
}

const STUDIO_API_HOST = 'studio-api-prod.suno.com';
const MAX_RESPONSE_SIZE = 8 * 1024 * 1024;
const GET_ENDPOINTS = [
  ['project', /^\/api\/studio\/project\/[^/]+$/],
  ['revision', /^\/api\/studio\/project_revision\/[^/]+$/],
  ['version', /^\/api\/studio\/[^/]+\/version\/[^/]+$/]
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeSchemaToken(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value)
    ? value
    : value === undefined
      ? 'missing'
      : 'nonstandard';
}

function boundedSignature(values: Iterable<string>): string {
  const result: string[] = [];
  let length = 0;
  for (const value of [...new Set(values)].sort()) {
    const nextLength = length + (result.length > 0 ? 1 : 0) + value.length;
    if (nextLength > 128) break;
    result.push(value);
    length = nextLength;
  }
  return result.join(',');
}

function fieldSignature(records: readonly Record<string, unknown>[]): string {
  return boundedSignature(records.flatMap((record) => (
    Object.keys(record).filter((key) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key))
  )));
}

function describeProjectSchema(
  state: Record<string, unknown>,
  generation: number,
  source: StudioEndpointKind
): ProjectSchemaEvidence {
  const timing = isRecord(state.timing) ? state.timing : undefined;
  const tracks = Array.isArray(state.tracks) ? state.tracks : [];
  const trackRecords = tracks.filter(isRecord);
  const clipRecords = trackRecords.flatMap((track) => (
    Array.isArray(track.clips) ? track.clips.filter(isRecord) : []
  ));
  return {
    generation,
    source,
    stateFieldCount: Object.keys(state).length,
    timingFieldCount: timing ? Object.keys(timing).length : 0,
    trackCount: tracks.length,
    audioTrackCount: trackRecords.filter((track) => track.type === 'audio').length,
    clipCount: clipRecords.length,
    audioClipCount: clipRecords.filter((clip) => clip.type === 'audio').length,
    timingKind: safeSchemaToken(timing?.type),
    trackKinds: boundedSignature(trackRecords.map((track) => safeSchemaToken(track.type))),
    clipKinds: boundedSignature(clipRecords.map((clip) => safeSchemaToken(clip.type))),
    stateFields: fieldSignature([state]),
    timingFields: fieldSignature(timing ? [timing] : []),
    trackFields: fieldSignature(trackRecords),
    clipFields: fieldSignature(clipRecords)
  };
}

export function classifyStudioEndpoint(
  urlValue: string,
  methodValue: string
): StudioEndpointKind | undefined {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.hostname !== STUDIO_API_HOST) return undefined;

  const method = methodValue.toUpperCase();
  if (method === 'POST' && url.pathname === '/api/studio/save-project') return 'save';
  if (method !== 'GET') return undefined;
  return GET_ENDPOINTS.find(([, pattern]) => pattern.test(url.pathname))?.[0];
}

function parseRequest(event: CdpEvent): {
  readonly requestId: string;
  readonly method: string;
  readonly url: string;
  readonly postData?: string;
} | undefined {
  if (!isRecord(event.params)
    || typeof event.params.requestId !== 'string'
    || !isRecord(event.params.request)
    || typeof event.params.request.method !== 'string'
    || typeof event.params.request.url !== 'string') return undefined;
  const postData = event.params.request.postData;
  if (postData !== undefined && typeof postData !== 'string') return undefined;
  return {
    requestId: event.params.requestId,
    method: event.params.request.method,
    url: event.params.request.url,
    ...(postData !== undefined ? { postData } : {})
  };
}

function parseResponse(event: CdpEvent): {
  readonly requestId: string;
  readonly status: number;
  readonly mimeType: string;
  readonly encodedDataLength?: number;
} | undefined {
  if (!isRecord(event.params)
    || typeof event.params.requestId !== 'string'
    || !isRecord(event.params.response)
    || typeof event.params.response.status !== 'number'
    || !Number.isFinite(event.params.response.status)
    || typeof event.params.response.mimeType !== 'string') return undefined;
  const length = event.params.response.encodedDataLength;
  if (length !== undefined && (typeof length !== 'number' || !Number.isFinite(length))) {
    return undefined;
  }
  return {
    requestId: event.params.requestId,
    status: event.params.response.status,
    mimeType: event.params.response.mimeType,
    ...(typeof length === 'number' ? { encodedDataLength: length } : {})
  };
}

export class ProjectCollector {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly send: CdpCommandSender,
    private readonly observe: (observation: ProjectObservation) => void,
    private readonly now: () => number = Date.now,
    private readonly reject: (code: ProjectCollectorRejection) => void = () => undefined,
    private readonly recordSchema: (evidence: ProjectSchemaEvidence) => void = () => undefined
  ) {
  }

  reset(): void {
    this.pending.clear();
  }

  async handle(event: CdpEvent, generation: number): Promise<void> {
    if (event.method === 'Network.requestWillBeSent') {
      await this.handleRequest(event, generation);
      return;
    }
    if (event.method === 'Network.responseReceived') {
      this.handleResponse(event, generation);
      return;
    }
    if (event.method === 'Network.loadingFinished') {
      await this.handleLoadingFinished(event, generation);
      return;
    }
    if (event.method === 'Network.loadingFailed' && isRecord(event.params)) {
      const requestId = event.params.requestId;
      if (typeof requestId === 'string') this.pending.delete(requestId);
    }
  }

  private async handleRequest(event: CdpEvent, generation: number): Promise<void> {
    const request = parseRequest(event);
    if (!request) return;
    const kind = classifyStudioEndpoint(request.url, request.method);
    if (!kind) return;

    if (kind === 'save') {
      let postData = request.postData;
      if (!postData) {
        try {
          const result = await this.send(event.tabId, 'Network.getRequestPostData', {
            requestId: request.requestId
          });
          postData = isRecord(result) && typeof result.postData === 'string'
            ? result.postData
            : undefined;
        } catch {
          postData = undefined;
        }
      }
      this.projectSaveBody(postData, generation);
      return;
    }
    this.pending.set(request.requestId, { kind, generation, responseReady: false });
  }

  private projectSaveBody(postData: string | undefined, generation: number): void {
    if (!postData) {
      this.reject('save-body-missing');
      return;
    }
    if (postData.length > MAX_RESPONSE_SIZE) {
      this.reject('body-too-large');
      this.emitFailure(generation, 'save', 'parse-failed');
      return;
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(postData) as unknown;
    } catch {
      this.reject('invalid-json');
      this.emitFailure(generation, 'save', 'parse-failed');
      return;
    }
    this.projectEnvelope(envelope, generation, 'save', 'save');
  }

  private handleResponse(event: CdpEvent, generation: number): void {
    const response = parseResponse(event);
    if (!response) return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;

    if (pending.generation !== generation) {
      this.pending.delete(response.requestId);
      this.reject('generation-mismatch');
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      this.pending.delete(response.requestId);
      this.reject('http-status');
      return;
    }
    if (response.encodedDataLength !== undefined
      && response.encodedDataLength > MAX_RESPONSE_SIZE) {
      this.pending.delete(response.requestId);
      this.reject('response-too-large');
      return;
    }
    if (!response.mimeType.toLowerCase().includes('json')) {
      this.pending.delete(response.requestId);
      this.reject('non-json');
      return;
    }

    this.pending.set(response.requestId, { ...pending, responseReady: true });
  }

  private async handleLoadingFinished(event: CdpEvent, generation: number): Promise<void> {
    if (!isRecord(event.params) || typeof event.params.requestId !== 'string') return;
    const pending = this.pending.get(event.params.requestId);
    if (!pending || !pending.responseReady) return;
    this.pending.delete(event.params.requestId);

    if (pending.generation !== generation) {
      this.reject('generation-mismatch');
      return;
    }
    const encodedDataLength = event.params.encodedDataLength;
    if (typeof encodedDataLength === 'number'
      && Number.isFinite(encodedDataLength)
      && encodedDataLength > MAX_RESPONSE_SIZE) {
      this.reject('response-too-large');
      return;
    }

    let result: unknown;
    try {
      result = await this.send(event.tabId, 'Network.getResponseBody', {
        requestId: event.params.requestId
      });
    } catch {
      this.reject('body-unavailable');
      return;
    }

    if (!isRecord(result) || typeof result.body !== 'string') {
      this.reject('body-unavailable');
      return;
    }
    if (result.base64Encoded !== false) {
      this.reject('base64-body');
      this.emitFailure(generation, pending.kind, 'parse-failed');
      return;
    }
    if (result.body.length > MAX_RESPONSE_SIZE) {
      this.reject('body-too-large');
      this.emitFailure(generation, pending.kind, 'parse-failed');
      return;
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(result.body) as unknown;
    } catch {
      this.reject('invalid-json');
      this.emitFailure(generation, pending.kind, 'parse-failed');
      return;
    }
    this.projectEnvelope(envelope, generation, pending.kind, 'get');
  }

  private projectEnvelope(
    envelope: unknown,
    generation: number,
    source: StudioEndpointKind,
    extractionSource: 'get' | 'save'
  ): void {
    const state = extractProjectState(envelope, extractionSource);
    if (!state) {
      this.reject('invalid-result');
      this.emitFailure(generation, source, 'unsupported-project-shape');
      return;
    }
    this.recordSchema(describeProjectSchema(state, generation, source));
    this.observe({
      generation,
      source,
      state: projectStateToBridgeState(state, this.now())
    });
  }

  private emitFailure(
    generation: number,
    source: StudioEndpointKind,
    status: 'parse-failed' | 'unsupported-project-shape'
  ): void {
    this.observe({
      generation,
      source,
      state: { status, observedAtMs: this.now() }
    });
  }
}
