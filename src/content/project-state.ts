import {
  parseManualTiming,
  secondsFromZero,
  type DerivedTiming
} from './project-timing';
import { NORMAL_SPEED_TOLERANCE } from '../shared/time';

export type BindingEligibility =
  | 'ready'
  | 'warped'
  | 'speed-changed'
  | 'looped'
  | 'reversed'
  | 'analysis-pending'
  | 'unsupported-mapping';

export interface SafeClipCandidate {
  readonly id: string;
  readonly label: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly warped: boolean;
  readonly bindingEligibility: BindingEligibility;
  readonly trimStartSeconds?: number;
  readonly speed?: number;
}

export interface ReadyClipCandidate extends SafeClipCandidate {
  readonly bindingEligibility: 'ready';
  readonly trimStartSeconds: number;
  readonly speed: number;
}

export interface SafeLoop {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly enabled: boolean;
}

export type ProjectBridgeStatus =
  | 'waiting-for-project-state'
  | 'ready'
  | 'unsupported-project-shape'
  | 'unsupported-timing'
  | 'too-many-clips'
  | 'parse-failed';

export type SunoBridgeState =
  | {
    readonly status: 'ready';
    readonly observedAtMs: number;
    readonly clips: readonly SafeClipCandidate[];
    readonly loop?: SafeLoop;
  }
  | {
    readonly status: Exclude<ProjectBridgeStatus, 'ready'>;
    readonly observedAtMs: number;
  };

const MAX_CLIPS = 256;
const MAX_STRING_LENGTH = 512;
const MAX_SECONDS = 24 * 60 * 60;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface ProjectStateRecord extends Record<string, unknown> {
  readonly tracks: readonly unknown[];
}

function isProjectState(value: unknown): value is ProjectStateRecord {
  return isRecord(value) && hasOwn(value, 'timing') && Array.isArray(value.tracks);
}

function decodeStateOnce(value: unknown): Record<string, unknown> | undefined {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return undefined;
    }
  }
  return isProjectState(decoded) ? decoded : undefined;
}

function nestedState(
  envelope: Record<string, unknown>,
  containerKey: 'project' | 'revision' | 'version'
): unknown {
  const container = envelope[containerKey];
  return isRecord(container) && hasOwn(container, 'state')
    ? container.state
    : undefined;
}

export function extractProjectState(
  envelope: unknown,
  source: 'get' | 'save'
): Record<string, unknown> | undefined {
  if (!isRecord(envelope)) return undefined;

  if (source === 'save') {
    return hasOwn(envelope, 'state') ? decodeStateOnce(envelope.state) : undefined;
  }

  const candidates: unknown[] = [];
  if (isProjectState(envelope)) candidates.push(envelope);
  if (hasOwn(envelope, 'state')) candidates.push(envelope.state);
  for (const key of ['project', 'revision', 'version'] as const) {
    const candidate = nestedState(envelope, key);
    if (candidate !== undefined) candidates.push(candidate);
  }

  const decoded = candidates
    .map(decodeStateOnce)
    .filter((candidate): candidate is Record<string, unknown> => candidate !== undefined);
  return decoded.length === 1 ? decoded[0] : undefined;
}

export function isReadyClipCandidate(candidate: SafeClipCandidate): candidate is ReadyClipCandidate {
  return candidate.bindingEligibility === 'ready'
    && isFiniteNumber(candidate.trimStartSeconds)
    && candidate.trimStartSeconds >= 0
    && isFiniteNumber(candidate.speed)
    && candidate.speed > 0;
}

interface WarpMarker {
  readonly seconds: number;
  readonly beats: number;
}

function parseMarkers(value: unknown): readonly WarpMarker[] | undefined {
  if (!isRecord(value)) return undefined;
  const markers: WarpMarker[] = [];
  for (const [secondsText, beatsValue] of Object.entries(value)) {
    const seconds = Number(secondsText);
    if (!Number.isFinite(seconds)
      || seconds < 0
      || !isFiniteNumber(beatsValue)) {
      return undefined;
    }
    markers.push({ seconds, beats: beatsValue });
  }
  markers.sort((left, right) => left.beats - right.beats);
  if (markers.some((marker, index) => index > 0 && marker.beats === markers[index - 1].beats)) {
    return undefined;
  }
  return markers;
}

function resolveMarkers(
  warp: Record<string, unknown>,
  markersRegistry: unknown
): readonly WarpMarker[] | undefined {
  if (hasOwn(warp, 'markers')) return parseMarkers(warp.markers);
  if (typeof warp.markersHash === 'string' && isRecord(markersRegistry)) {
    return parseMarkers(markersRegistry[warp.markersHash]);
  }
  return [];
}

function warpSecondsFromBeats(beats: number, markers: readonly WarpMarker[]): number {
  if (markers.length === 0) return 0.5 * beats;

  let beforePrevious: WarpMarker | undefined;
  let previous: WarpMarker | undefined;
  let next: WarpMarker | undefined;
  let afterNext: WarpMarker | undefined;

  for (const marker of markers) {
    if (marker.beats <= beats) {
      beforePrevious = previous;
      previous = marker;
    } else if (next) {
      afterNext = marker;
      break;
    } else {
      next = marker;
    }
  }

  if (previous && next) {
    const slope = (next.seconds - previous.seconds) / (next.beats - previous.beats);
    return previous.seconds + (beats - previous.beats) * slope;
  }
  if (previous) {
    const slope = beforePrevious
      ? (previous.seconds - beforePrevious.seconds) / (previous.beats - beforePrevious.beats)
      : 0.5;
    return previous.seconds + (beats - previous.beats) * slope;
  }
  if (!next) return 0.5 * beats;

  const slope = afterNext
    ? (afterNext.seconds - next.seconds) / (afterNext.beats - next.beats)
    : 0.5;
  return next.seconds + (beats - next.beats) * slope;
}

function clipEligibility(input: {
  readonly analysisPending: boolean;
  readonly reversed: boolean;
  readonly looped: boolean;
  readonly warped: boolean;
  readonly speed?: number;
  readonly mappingValid: boolean;
}): BindingEligibility {
  if (input.analysisPending) return 'analysis-pending';
  if (input.reversed) return 'reversed';
  if (input.looped) return 'looped';
  if (input.warped) return 'warped';
  if (input.speed !== undefined && Math.abs(input.speed - 1) > NORMAL_SPEED_TOLERANCE) {
    return 'speed-changed';
  }
  return input.mappingValid ? 'ready' : 'unsupported-mapping';
}

function projectSeconds(beats: number, timing: DerivedTiming): number | undefined {
  const seconds = secondsFromZero(beats, timing);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_SECONDS
    ? seconds
    : undefined;
}

function parseClip(
  value: unknown,
  timing: DerivedTiming,
  markersRegistry: unknown
): SafeClipCandidate | undefined {
  if (!isRecord(value)
    || value.type !== 'audio'
    || typeof value.id !== 'string'
    || value.id.length === 0
    || value.id.length > MAX_STRING_LENGTH
    || typeof value.name !== 'string'
    || value.name.length === 0
    || value.name.length > MAX_STRING_LENGTH
    || !isFiniteNumber(value.startBeats)
    || !isFiniteNumber(value.endBeats)
    || value.endBeats <= value.startBeats) {
    return undefined;
  }

  const startSeconds = projectSeconds(value.startBeats, timing);
  const endSeconds = projectSeconds(value.endBeats, timing);
  if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) {
    return undefined;
  }

  const warp = isRecord(value.warp) ? value.warp : undefined;
  const markers = warp ? resolveMarkers(warp, markersRegistry) : undefined;
  const readStartBeats = isFiniteNumber(value.readStartBeats) ? value.readStartBeats : undefined;
  const transposition = value.transposition === undefined ? 0 : value.transposition;
  const speed = isFiniteNumber(transposition) ? 2 ** (transposition / 12) : undefined;
  const trimStartSeconds = markers && readStartBeats !== undefined
    ? warpSecondsFromBeats(readStartBeats, markers)
    : undefined;
  const mappingValid = trimStartSeconds !== undefined
    && Number.isFinite(trimStartSeconds)
    && trimStartSeconds >= 0
    && speed !== undefined
    && Number.isFinite(speed)
    && speed > 0
    && speed <= 16;
  const warped = warp?.enabled === true;
  const bindingEligibility = clipEligibility({
    analysisPending: warp?.awaitingAnalysis === true,
    reversed: value.reversed === true,
    looped: isRecord(value.loop) && value.loop.enabled === true,
    warped,
    speed,
    mappingValid
  });

  return {
    id: value.id,
    label: value.name,
    startSeconds,
    durationSeconds: endSeconds - startSeconds,
    warped,
    bindingEligibility,
    ...(mappingValid ? { trimStartSeconds, speed } : {})
  };
}

function parseProjectLoop(value: unknown, timing: DerivedTiming): SafeLoop | 'invalid' | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return 'invalid';
  if (!isFiniteNumber(value.startBeats) || !isFiniteNumber(value.endBeats)) {
    return value.enabled ? 'invalid' : undefined;
  }

  const startSeconds = projectSeconds(value.startBeats, timing);
  const endSeconds = projectSeconds(value.endBeats, timing);
  if (startSeconds === undefined || endSeconds === undefined || endSeconds < startSeconds) {
    return value.enabled ? 'invalid' : undefined;
  }
  return { startSeconds, endSeconds, enabled: value.enabled };
}

export function projectStateToBridgeState(
  state: unknown,
  observedAtMs: number
): SunoBridgeState {
  if (!isProjectState(state)) {
    return { status: 'unsupported-project-shape', observedAtMs };
  }

  const parsedTiming = parseManualTiming(state.timing);
  if (parsedTiming.status !== 'ready') {
    return { status: parsedTiming.status, observedAtMs };
  }

  const clips: SafeClipCandidate[] = [];
  let audioCount = 0;
  for (const track of state.tracks) {
    if (!isRecord(track)
      || (track.type !== 'audio' && track.type !== 'midi' && track.type !== 'video')
      || !Array.isArray(track.clips)) {
      return { status: 'unsupported-project-shape', observedAtMs };
    }
    if (track.type !== 'audio') continue;

    for (const value of track.clips) {
      if (!isRecord(value)
        || (value.type !== 'audio' && value.type !== 'midi' && value.type !== 'video')) {
        return { status: 'parse-failed', observedAtMs };
      }
      if (value.type !== 'audio') continue;
      audioCount += 1;
      if (audioCount > MAX_CLIPS) {
        return { status: 'too-many-clips', observedAtMs };
      }
      const clip = parseClip(value, parsedTiming.timing, state.markersRegistry);
      if (!clip) return { status: 'parse-failed', observedAtMs };
      clips.push(clip);
    }
  }
  const loop = parseProjectLoop(state.loop, parsedTiming.timing);
  if (loop === 'invalid') return { status: 'parse-failed', observedAtMs };

  return {
    status: 'ready',
    observedAtMs,
    clips,
    ...(loop ? { loop } : {})
  };
}
