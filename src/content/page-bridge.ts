import type {
  BindingEligibility,
  ProjectBridgeStatus,
  SafeClipCandidate,
  SafeLoop,
  SunoBridgeState
} from './project-state';
import { NORMAL_SPEED_TOLERANCE } from '../shared/time';

export const SUNO_PAGE_BRIDGE_SOURCE = 'suno-video-sync.page-bridge';
export const SUNO_PAGE_BRIDGE_VERSION = 1;
export const SUNO_PAGE_BRIDGE_REQUEST = 'snapshot-request';
export const SUNO_PAGE_BRIDGE_STATE = 'bridge-state';

export interface SunoPageBridgeRequest {
  readonly source: typeof SUNO_PAGE_BRIDGE_SOURCE;
  readonly version: typeof SUNO_PAGE_BRIDGE_VERSION;
  readonly type: typeof SUNO_PAGE_BRIDGE_REQUEST;
}

export interface SunoPageBridgeMessage {
  readonly source: typeof SUNO_PAGE_BRIDGE_SOURCE;
  readonly version: typeof SUNO_PAGE_BRIDGE_VERSION;
  readonly type: typeof SUNO_PAGE_BRIDGE_STATE;
  readonly state: SunoBridgeState;
}

const MAX_CLIPS = 256;
const MAX_STRING_LENGTH = 512;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_SPEED = 16;
const requestKeys = new Set(['source', 'version', 'type']);
const messageKeys = new Set(['source', 'version', 'type', 'state']);
const readyStateKeys = new Set(['status', 'observedAtMs', 'clips', 'loop']);
const statusStateKeys = new Set(['status', 'observedAtMs']);
const loopKeys = new Set(['startSeconds', 'endSeconds', 'enabled']);
const clipKeys = new Set([
  'id',
  'label',
  'startSeconds',
  'durationSeconds',
  'trimStartSeconds',
  'speed',
  'warped',
  'bindingEligibility'
]);

const bridgeStatuses = new Set<ProjectBridgeStatus>([
  'waiting-for-project-state',
  'ready',
  'unsupported-project-shape',
  'unsupported-timing',
  'too-many-clips',
  'parse-failed'
]);

const bindingEligibilities = new Set<BindingEligibility>([
  'ready',
  'warped',
  'speed-changed',
  'looped',
  'reversed',
  'analysis-pending',
  'unsupported-mapping'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSeconds(value: unknown): value is number {
  return isTimestamp(value) && value <= MAX_SECONDS;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_STRING_LENGTH;
}

function isLoop(value: unknown): value is SafeLoop {
  return isRecord(value)
    && hasOnlyKeys(value, loopKeys)
    && isSeconds(value.startSeconds)
    && isSeconds(value.endSeconds)
    && value.endSeconds >= value.startSeconds
    && typeof value.enabled === 'boolean';
}

function isOptionalMappingNumber(value: unknown): value is number | undefined {
  return value === undefined || isSeconds(value);
}

function isOptionalSpeed(value: unknown): value is number | undefined {
  return value === undefined
    || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_SPEED);
}

function isClip(value: unknown): value is SafeClipCandidate {
  if (!isRecord(value)
    || !hasOnlyKeys(value, clipKeys)
    || !isBoundedString(value.id)
    || !isBoundedString(value.label)
    || !isSeconds(value.startSeconds)
    || !isSeconds(value.durationSeconds)
    || value.durationSeconds <= 0
    || typeof value.warped !== 'boolean'
    || typeof value.bindingEligibility !== 'string'
    || !bindingEligibilities.has(value.bindingEligibility as BindingEligibility)
    || !isOptionalMappingNumber(value.trimStartSeconds)
    || !isOptionalSpeed(value.speed)) {
    return false;
  }

  if (value.bindingEligibility === 'ready') {
    return value.warped === false
      && isSeconds(value.trimStartSeconds)
      && typeof value.speed === 'number'
      && Math.abs(value.speed - 1) <= NORMAL_SPEED_TOLERANCE;
  }
  if (value.bindingEligibility === 'warped' && value.warped !== true) return false;
  if (value.bindingEligibility === 'speed-changed') {
    return typeof value.speed === 'number'
      && Math.abs(value.speed - 1) > NORMAL_SPEED_TOLERANCE;
  }
  return true;
}

function isBridgeState(value: unknown): value is SunoBridgeState {
  if (!isRecord(value)
    || typeof value.status !== 'string'
    || !bridgeStatuses.has(value.status as ProjectBridgeStatus)
    || !isTimestamp(value.observedAtMs)) {
    return false;
  }

  if (value.status !== 'ready') {
    return hasOnlyKeys(value, statusStateKeys);
  }

  return hasOnlyKeys(value, readyStateKeys)
    && Array.isArray(value.clips)
    && value.clips.length <= MAX_CLIPS
    && value.clips.every(isClip)
    && (value.loop === undefined || isLoop(value.loop));
}

export function isSunoPageBridgeRequest(value: unknown): value is SunoPageBridgeRequest {
  return isRecord(value)
    && hasOnlyKeys(value, requestKeys)
    && value.source === SUNO_PAGE_BRIDGE_SOURCE
    && value.version === SUNO_PAGE_BRIDGE_VERSION
    && value.type === SUNO_PAGE_BRIDGE_REQUEST;
}

export function isSunoPageBridgeMessage(value: unknown): value is SunoPageBridgeMessage {
  return isRecord(value)
    && hasOnlyKeys(value, messageKeys)
    && value.source === SUNO_PAGE_BRIDGE_SOURCE
    && value.version === SUNO_PAGE_BRIDGE_VERSION
    && value.type === SUNO_PAGE_BRIDGE_STATE
    && isBridgeState(value.state);
}

function whitelistClip(clip: SafeClipCandidate): SafeClipCandidate {
  return {
    id: clip.id,
    label: clip.label,
    startSeconds: clip.startSeconds,
    durationSeconds: clip.durationSeconds,
    warped: clip.warped,
    bindingEligibility: clip.bindingEligibility,
    ...(clip.trimStartSeconds !== undefined ? { trimStartSeconds: clip.trimStartSeconds } : {}),
    ...(clip.speed !== undefined ? { speed: clip.speed } : {})
  };
}

function whitelistState(state: SunoBridgeState): SunoBridgeState {
  if (state.status !== 'ready') {
    return { status: state.status, observedAtMs: state.observedAtMs };
  }
  return {
    status: 'ready',
    observedAtMs: state.observedAtMs,
    clips: state.clips.map(whitelistClip),
    ...(state.loop ? {
      loop: {
        startSeconds: state.loop.startSeconds,
        endSeconds: state.loop.endSeconds,
        enabled: state.loop.enabled
      }
    } : {})
  };
}

export function postSunoPageBridgeRequest(target: Window): void {
  target.postMessage({
    source: SUNO_PAGE_BRIDGE_SOURCE,
    version: SUNO_PAGE_BRIDGE_VERSION,
    type: SUNO_PAGE_BRIDGE_REQUEST
  } satisfies SunoPageBridgeRequest, target.location.origin);
}

export function postSunoPageBridgeState(target: Window, state: SunoBridgeState): void {
  target.postMessage({
    source: SUNO_PAGE_BRIDGE_SOURCE,
    version: SUNO_PAGE_BRIDGE_VERSION,
    type: SUNO_PAGE_BRIDGE_STATE,
    state: whitelistState(state)
  } satisfies SunoPageBridgeMessage, target.location.origin);
}
