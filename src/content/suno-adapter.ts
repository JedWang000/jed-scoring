import {
  isReadyClipCandidate,
  type ProjectBridgeStatus,
  type ReadyClipCandidate,
  type SafeClipCandidate,
  type SunoBridgeState
} from './project-state';

export type AdapterHealth = 'healthy' | 'degraded' | 'unavailable';
export type SunoClip = SafeClipCandidate;
export type BindableSunoClip = ReadyClipCandidate;
export { isReadyClipCandidate as isBindableSunoClip };

export interface SunoSnapshot {
  health: AdapterHealth;
  bridgeStatus: ProjectBridgeStatus;
  projectTimeSeconds?: number;
  isPlaying?: boolean;
  loop?: { startSeconds: number; endSeconds: number; enabled: boolean };
  clips: readonly SunoClip[];
  observedAtMs: number;
  reason?: string;
}

const TRANSPORT_NOT_FOUND_REASON = 'Suno Studio transport could not be identified reliably.';
const BRIDGE_REASONS: Record<Exclude<ProjectBridgeStatus, 'ready'>, string> = {
  'waiting-for-project-state': 'Suno project state has not been observed. Reload the Studio page.',
  'unsupported-project-shape': 'This Suno project structure is not supported safely.',
  'unsupported-timing': 'This Suno project timing mode is not supported safely.',
  'too-many-clips': 'This Suno project has too many audio blocks to inspect safely.',
  'parse-failed': 'Suno project state could not be validated safely.'
};

const ICON_PREFIX = {
  play: 'M6 18.705V5.294',
  pause: 'M4 6.667a2.667',
  rewind: 'M22 16.83V7.17',
  forward: 'M2 16.427V7.573',
  loop: 'M2 11q0-2.925'
} as const;

interface TransportObservation {
  projectTimeSeconds: number;
  isPlaying: boolean;
}

function pathStartsWith(path: Element, prefix: string): boolean {
  return path.getAttribute('d')?.startsWith(prefix) ?? false;
}

function hasIcon(container: Element, prefix: string): boolean {
  return Array.from(container.querySelectorAll('path[d]')).some((path) => pathStartsWith(path, prefix));
}

function parseProjectTime(text: string): number | undefined {
  const hourMatch = /^(\d+):([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(text);
  if (hourMatch) {
    return Number(hourMatch[1]) * 3600
      + Number(hourMatch[2]) * 60
      + Number(hourMatch[3])
      + Number(hourMatch[4]) / 1000;
  }

  const minuteMatch = /^(\d+):([0-5]\d)\.(\d{3})$/.exec(text);
  if (!minuteMatch) return undefined;

  return Number(minuteMatch[1]) * 60
    + Number(minuteMatch[2])
    + Number(minuteMatch[3]) / 1000;
}

function buttonTexts(container: Element): string[] {
  return Array.from(container.querySelectorAll('button'))
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean);
}

function inspectTransportCandidate(
  container: Element,
  isPlaying: boolean
): TransportObservation | undefined {
  const texts = buttonTexts(container);
  const times = texts.map(parseProjectTime).filter((value): value is number => value !== undefined);
  const hasTempo = texts.some((text) => /^\d+(?:\.\d+)?\s*BPM$/i.test(text));
  const hasSignature = texts.some((text) => /^\d+\s*\/\s*\d+$/.test(text));

  if (
    times.length !== 1
    || !hasTempo
    || !hasSignature
    || !hasIcon(container, ICON_PREFIX.rewind)
    || !hasIcon(container, ICON_PREFIX.forward)
    || !hasIcon(container, ICON_PREFIX.loop)
  ) {
    return undefined;
  }

  return { projectTimeSeconds: times[0], isPlaying };
}

function readTransport(root: Document): TransportObservation | undefined {
  const playbackPaths = Array.from(root.querySelectorAll('path[d]')).filter(
    (path) => pathStartsWith(path, ICON_PREFIX.play) || pathStartsWith(path, ICON_PREFIX.pause)
  );
  const observations: TransportObservation[] = [];

  for (const path of playbackPaths) {
    const isPlaying = pathStartsWith(path, ICON_PREFIX.pause);
    let candidate = path.closest('button')?.parentElement;

    while (candidate && candidate !== root.documentElement) {
      const observation = inspectTransportCandidate(candidate, isPlaying);
      if (observation) {
        observations.push(observation);
        break;
      }
      candidate = candidate.parentElement;
    }
  }

  return observations.length === 1 ? observations[0] : undefined;
}

/**
 * A fail-closed boundary around Suno's user-visible UI. It identifies the
 * transport through a local structural signature and official icon paths,
 * never through build-specific CSS class names.
 */
export class SunoAdapter {
  private lastBridgeObservation: {
    readonly state: SunoBridgeState;
    readonly pageIdentity: string;
  } | undefined;

  constructor(
    private readonly root: Document,
    private readonly readPageIdentity: () => string = () => (
      `${root.location.origin}${root.location.pathname}`
    )
  ) {
  }

  health(): AdapterHealth {
    if (!readTransport(this.root)) return 'unavailable';
    return this.currentBridgeState()?.status === 'ready' ? 'healthy' : 'degraded';
  }

  observeBridgeState(state: SunoBridgeState): void {
    this.lastBridgeObservation = {
      state,
      pageIdentity: this.readPageIdentity()
    };
  }

  private currentBridgeState(): SunoBridgeState | undefined {
    if (this.lastBridgeObservation?.pageIdentity !== this.readPageIdentity()) {
      return undefined;
    }
    return this.lastBridgeObservation.state;
  }

  async readSnapshot(): Promise<SunoSnapshot> {
    const transport = readTransport(this.root);
    const bridge = this.currentBridgeState();
    const bridgeStatus = bridge?.status ?? 'waiting-for-project-state';

    if (!transport) {
      const readyBridge = bridge?.status === 'ready' ? bridge : undefined;
      return {
        health: 'unavailable',
        bridgeStatus,
        ...(readyBridge?.loop ? { loop: readyBridge.loop } : {}),
        clips: readyBridge?.clips ?? [],
        observedAtMs: bridge?.observedAtMs ?? Date.now(),
        reason: TRANSPORT_NOT_FOUND_REASON
      };
    }

    if (!bridge || bridge.status !== 'ready') {
      const status = bridge?.status ?? 'waiting-for-project-state';
      return {
        health: 'degraded',
        bridgeStatus: status,
        projectTimeSeconds: transport.projectTimeSeconds,
        isPlaying: transport.isPlaying,
        clips: [],
        observedAtMs: bridge?.observedAtMs ?? Date.now(),
        reason: BRIDGE_REASONS[status]
      };
    }

    return {
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: transport.projectTimeSeconds,
      isPlaying: transport.isPlaying,
      ...(bridge.loop ? { loop: bridge.loop } : {}),
      clips: bridge.clips,
      observedAtMs: bridge.observedAtMs
    };
  }
}
