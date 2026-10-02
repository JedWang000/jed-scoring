export interface BpsAutomationPoint {
  readonly beats: number;
  readonly value: number;
  readonly curve: number;
}

export interface DerivedTiming {
  readonly bps: number;
  readonly bpsAutomation: readonly BpsAutomationPoint[];
  readonly firstBeatSeconds: number;
}

export type TimingParseResult =
  | { readonly status: 'ready'; readonly timing: DerivedTiming }
  | { readonly status: 'unsupported-timing' }
  | { readonly status: 'parse-failed' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseAutomation(value: unknown): readonly BpsAutomationPoint[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const points: BpsAutomationPoint[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)
      || !isFiniteNumber(candidate.beats)
      || !isFiniteNumber(candidate.value)
      || candidate.value <= 0
      || !isFiniteNumber(candidate.curve)) {
      return undefined;
    }
    points.push({
      beats: candidate.beats,
      value: candidate.value,
      curve: candidate.curve
    });
  }

  points.sort((left, right) => left.beats - right.beats);
  if (points.some((point, index) => index > 0 && point.beats === points[index - 1].beats)) {
    return undefined;
  }
  return points;
}

export function parseManualTiming(value: unknown): TimingParseResult {
  if (!isRecord(value)) return { status: 'parse-failed' };
  if (value.type !== 'manual') {
    return typeof value.type === 'string'
      ? { status: 'unsupported-timing' }
      : { status: 'parse-failed' };
  }
  if (!isFiniteNumber(value.bps) || value.bps <= 0) {
    return { status: 'parse-failed' };
  }

  const automation = value.lockBPS === true ? [] : parseAutomation(value.bpsAutomation);
  if (!automation) return { status: 'parse-failed' };

  return {
    status: 'ready',
    timing: {
      bps: value.bps,
      bpsAutomation: automation,
      firstBeatSeconds: 0
    }
  };
}

function upperBound(points: readonly BpsAutomationPoint[], beats: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].beats <= beats) low = middle + 1;
    else high = middle;
  }
  return low;
}

function valueAtBeats(
  beats: number,
  points: readonly BpsAutomationPoint[]
): readonly [left: number, right: number] {
  if (points.length === 0) return [0, 0];

  const nextIndex = Math.min(points.length - 1, upperBound(points, beats));
  const previousIndex = Math.max(0, nextIndex - 1);
  const next = points[nextIndex];
  const previous = points[previousIndex];

  if (beats === next.beats && previous.curve === 0) {
    return [previous.value, next.value];
  }
  if (beats >= next.beats) return [next.value, next.value];
  if (beats <= previous.beats) return [previous.value, previous.value];

  const width = next.beats - previous.beats;
  if (width === 0) return [previous.value, next.value];
  if (next.value === previous.value || previous.curve === 0) {
    return [previous.value, previous.value];
  }

  const exponent = 2 ** previous.curve;
  const progress = (beats - previous.beats) / width;
  const change = exponent === 0
    ? 0
    : (next.value - previous.value) * (1 - (1 - progress) ** exponent);
  const value = previous.value + change;
  return [value, value];
}

function integrateLinearBps(beats: number, startBps: number, endBps: number): number {
  const delta = endBps - startBps;
  if (delta === 0) return beats / startBps;
  const slope = delta / beats;
  return Math.log(endBps / startBps) / slope;
}

function positiveSecondsFromZero(beats: number, timing: DerivedTiming): number {
  const automation = timing.bpsAutomation;
  if (automation.length === 0) return beats / timing.bps + timing.firstBeatSeconds;
  if (automation.length === 1) {
    return beats / automation[0].value + timing.firstBeatSeconds;
  }

  const boundaries = [0];
  for (const point of automation) {
    if (point.beats > 0 && point.beats < beats) boundaries.push(point.beats);
  }
  boundaries.push(beats);

  let seconds = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const startBps = valueAtBeats(start, automation)[1];
    const endBps = valueAtBeats(end, automation)[0];
    seconds += integrateLinearBps(end - start, startBps, endBps);
  }
  return seconds + timing.firstBeatSeconds;
}

export function secondsFromZero(beats: number, timing: DerivedTiming): number {
  if (beats === 0) return timing.firstBeatSeconds;
  if (beats > 0) return positiveSecondsFromZero(beats, timing);

  const reversed: DerivedTiming = {
    bps: timing.bps,
    bpsAutomation: timing.bpsAutomation
      .map((point) => ({ ...point, beats: -point.beats }))
      .reverse(),
    firstBeatSeconds: -timing.firstBeatSeconds
  };
  return -positiveSecondsFromZero(-beats, reversed);
}

export function secondsBetween(
  startBeats: number,
  endBeats: number,
  timing: DerivedTiming
): number {
  return secondsFromZero(endBeats, timing) - secondsFromZero(startBeats, timing);
}
