import type { SunoSnapshot } from '../content/suno-adapter';

export const BACKGROUND_REQUEST_TYPE = 'suno-video-sync:background-request/v1';
export const BACKGROUND_RESPONSE_TYPE = 'suno-video-sync:background-response/v1';

export type BackgroundAction = 'snapshot' | 'connect' | 'reload' | 'diagnostics';
export type DiagnosticCategory = 'session' | 'network' | 'project' | 'transport' | 'fusion';
export type SafeDiagnosticValue = number | string | boolean | null;

export interface DiagnosticEntry {
  readonly atMs: number;
  readonly category: DiagnosticCategory;
  readonly code: string;
  readonly data?: Readonly<Record<string, SafeDiagnosticValue>>;
}

export interface BackgroundRequest {
  readonly type: typeof BACKGROUND_REQUEST_TYPE;
  readonly action: BackgroundAction;
}

export type BackgroundResponse =
  | {
    readonly type: typeof BACKGROUND_RESPONSE_TYPE;
    readonly action: 'snapshot' | 'connect' | 'reload';
    readonly snapshot: SunoSnapshot;
  }
  | {
    readonly type: typeof BACKGROUND_RESPONSE_TYPE;
    readonly action: 'diagnostics';
    readonly entries: readonly DiagnosticEntry[];
  };

const actions = new Set<BackgroundAction>([
  'snapshot',
  'connect',
  'reload',
  'diagnostics'
]);

export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2
    && record.type === BACKGROUND_REQUEST_TYPE
    && typeof record.action === 'string'
    && actions.has(record.action as BackgroundAction);
}
