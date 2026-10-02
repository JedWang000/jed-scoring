import {
  BACKGROUND_REQUEST_TYPE,
  BACKGROUND_RESPONSE_TYPE,
  type BackgroundAction,
  type DiagnosticEntry
} from '../background/protocol';
import type { SunoClip, SunoSnapshot } from '../content/suno-adapter';
import type { BindingEligibility, ProjectBridgeStatus } from '../content/project-state';
import { NORMAL_SPEED_TOLERANCE } from '../shared/time';

export interface RuntimeMessenger {
  sendMessage(message: unknown): Promise<unknown>;
}

function unavailable(reason: string): SunoSnapshot {
  return {
    health: 'unavailable',
    bridgeStatus: 'waiting-for-project-state',
    clips: [],
    observedAtMs: Date.now(),
    reason
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function isSeconds(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 24 * 60 * 60;
}

function isClip(value: unknown): value is SunoClip {
  if (typeof value !== 'object' || value === null) return false;
  const clip = value as Partial<SunoClip>;
  return typeof clip.id === 'string'
    && clip.id.length > 0
    && clip.id.length <= 512
    && typeof clip.label === 'string'
    && clip.label.length > 0
    && clip.label.length <= 512
    && isSeconds(clip.startSeconds)
    && isSeconds(clip.durationSeconds)
    && clip.durationSeconds > 0
    && typeof clip.warped === 'boolean'
    && typeof clip.bindingEligibility === 'string'
    && bindingEligibilities.has(clip.bindingEligibility as BindingEligibility)
    && (clip.trimStartSeconds === undefined || isSeconds(clip.trimStartSeconds))
    && (clip.speed === undefined || (
      isFiniteNumber(clip.speed) && clip.speed > 0 && clip.speed <= 16
    ))
    && (clip.bindingEligibility !== 'ready' || (
      clip.warped === false
      && isSeconds(clip.trimStartSeconds)
      && typeof clip.speed === 'number'
      && Math.abs(clip.speed - 1) <= NORMAL_SPEED_TOLERANCE
    ));
}

function isLoop(value: unknown): value is NonNullable<SunoSnapshot['loop']> {
  if (typeof value !== 'object' || value === null) return false;
  const loop = value as Partial<NonNullable<SunoSnapshot['loop']>>;
  return isSeconds(loop.startSeconds)
    && isSeconds(loop.endSeconds)
    && loop.endSeconds >= loop.startSeconds
    && typeof loop.enabled === 'boolean';
}

function isSnapshot(value: unknown): value is SunoSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<SunoSnapshot>;
  return (snapshot.health === 'healthy' || snapshot.health === 'degraded' || snapshot.health === 'unavailable')
    && typeof snapshot.bridgeStatus === 'string'
    && bridgeStatuses.has(snapshot.bridgeStatus as ProjectBridgeStatus)
    && (snapshot.health !== 'healthy' || snapshot.bridgeStatus === 'ready')
    && Array.isArray(snapshot.clips)
    && snapshot.clips.every(isClip)
    && isFiniteNumber(snapshot.observedAtMs)
    && snapshot.observedAtMs >= 0
    && (snapshot.projectTimeSeconds === undefined || isSeconds(snapshot.projectTimeSeconds))
    && (snapshot.isPlaying === undefined || typeof snapshot.isPlaying === 'boolean')
    && (snapshot.loop === undefined || isLoop(snapshot.loop))
    && (snapshot.reason === undefined || typeof snapshot.reason === 'string');
}

function isSnapshotResponse(
  value: unknown,
  action: Exclude<BackgroundAction, 'diagnostics'>
): value is { readonly type: string; readonly action: string; readonly snapshot: SunoSnapshot } {
  if (!isRecord(value)) return false;
  return value.type === BACKGROUND_RESPONSE_TYPE
    && value.action === action
    && isSnapshot(value.snapshot);
}

const diagnosticCategories = new Set([
  'session',
  'network',
  'project',
  'transport',
  'fusion'
]);
const sensitiveDiagnosticKey = /authorization|cookie|token|body|html|url|project.?id|revision.?id|version.?id|path|filename|prompt|lyric/i;
const sensitiveDiagnosticValue = /https?:\/\/|\/api\/|[a-z]:\\|\\users\\|eyj[a-z0-9_-]{12,}/i;

function isDiagnosticEntry(value: unknown): value is DiagnosticEntry {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set(['atMs', 'category', 'code', 'data']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (!isFiniteNumber(value.atMs) || value.atMs < 0
    || typeof value.category !== 'string'
    || !diagnosticCategories.has(value.category)
    || typeof value.code !== 'string'
    || value.code.length === 0
    || value.code.length > 80) return false;
  if (value.data === undefined) return true;
  if (!isRecord(value.data)) return false;
  return Object.entries(value.data).every(([key, entry]) => {
    if (sensitiveDiagnosticKey.test(key)) return false;
    if (entry === null || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    return typeof entry === 'string'
      && entry.length <= 128
      && !sensitiveDiagnosticValue.test(entry);
  });
}

export class SunoClient {
  constructor(private readonly runtime: RuntimeMessenger = chrome.runtime) {
  }

  readSnapshot(): Promise<SunoSnapshot> {
    return this.requestSnapshot('snapshot');
  }

  connect(): Promise<SunoSnapshot> {
    return this.requestSnapshot('connect');
  }

  reloadStudio(): Promise<SunoSnapshot> {
    return this.requestSnapshot('reload');
  }

  async readDiagnostics(): Promise<readonly DiagnosticEntry[]> {
    try {
      const response = await this.runtime.sendMessage({
        type: BACKGROUND_REQUEST_TYPE,
        action: 'diagnostics'
      });
      if (!isRecord(response)
        || response.type !== BACKGROUND_RESPONSE_TYPE
        || response.action !== 'diagnostics'
        || !Array.isArray(response.entries)
        || !response.entries.every(isDiagnosticEntry)) return [];
      return response.entries;
    } catch {
      return [];
    }
  }

  private async requestSnapshot(
    action: Exclude<BackgroundAction, 'diagnostics'>
  ): Promise<SunoSnapshot> {
    try {
      const response = await this.runtime.sendMessage({
        type: BACKGROUND_REQUEST_TYPE,
        action
      });
      return isSnapshotResponse(response, action)
        ? response.snapshot
        : unavailable('CDP background returned an invalid snapshot.');
    } catch {
      return unavailable('CDP background service worker is not available.');
    }
  }
}
