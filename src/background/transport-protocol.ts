export const TRANSPORT_BINDING_NAME = '__sunoVideoSyncTransportV1';
export const MIN_PROJECT_TIME_SECONDS = -(24 * 60 * 60);
export const MAX_PROJECT_TIME_SECONDS = 24 * 60 * 60;

export interface TransportObservation {
  readonly sequence: number;
  readonly pageTimestampMs: number;
  readonly receivedAtMs: number;
  readonly projectTimeSeconds: number;
  readonly isPlaying: boolean;
  readonly isScrubbing: boolean;
  readonly strategyId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function parseTransportBinding(
  payload: string,
  receivedAtMs: number
): TransportObservation | undefined {
  if (!Number.isFinite(receivedAtMs) || receivedAtMs < 0) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value) || !hasExactKeys(value, [
    'v',
    'sequence',
    'pageTimestampMs',
    'projectTimeSeconds',
    'isPlaying',
    'isScrubbing',
    'strategyId'
  ])) return undefined;
  if (value.v !== 1
    || !Number.isSafeInteger(value.sequence)
    || (value.sequence as number) <= 0
    || typeof value.pageTimestampMs !== 'number'
    || !Number.isFinite(value.pageTimestampMs)
    || value.pageTimestampMs < 0
    || typeof value.projectTimeSeconds !== 'number'
    || !Number.isFinite(value.projectTimeSeconds)
    || value.projectTimeSeconds < MIN_PROJECT_TIME_SECONDS
    || value.projectTimeSeconds > MAX_PROJECT_TIME_SECONDS
    || typeof value.isPlaying !== 'boolean'
    || typeof value.isScrubbing !== 'boolean'
    || typeof value.strategyId !== 'string'
    || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(value.strategyId)) return undefined;

  return {
    sequence: value.sequence as number,
    pageTimestampMs: value.pageTimestampMs,
    receivedAtMs,
    projectTimeSeconds: value.projectTimeSeconds,
    isPlaying: value.isPlaying,
    isScrubbing: value.isScrubbing,
    strategyId: value.strategyId
  };
}

export function isNewerTransport(
  previous: TransportObservation | undefined,
  next: TransportObservation
): boolean {
  return !previous || (
    next.sequence > previous.sequence
    && next.pageTimestampMs >= previous.pageTimestampMs
  );
}
