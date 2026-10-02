import type { SunoBridgeState } from '../content/project-state';
import type { SunoSnapshot } from '../content/suno-adapter';
import type { SessionSnapshot } from './session-manager';
import type { TransportObservation } from './transport-protocol';

export const TRANSPORT_STALE_MS = 1500;
export const PAUSED_TRANSPORT_STALE_MS = 3000;

const BRIDGE_REASONS = {
  'waiting-for-project-state': 'Suno project state has not been observed. Reload the Studio page.',
  'unsupported-project-shape': 'This Suno project structure is not supported safely.',
  'unsupported-timing': 'This Suno project timing mode is not supported safely.',
  'too-many-clips': 'This Suno project has too many audio blocks to inspect safely.',
  'parse-failed': 'Suno project state could not be validated safely.'
} as const;

interface ProjectRecord {
  readonly generation: number;
  readonly state: SunoBridgeState;
}

interface TransportRecord {
  readonly generation: number;
  readonly observation: TransportObservation;
}

function sessionUnavailableReason(session: SessionSnapshot): string {
  switch (session.state) {
    case 'attaching':
      return 'Connecting to the Suno Studio tab.';
    case 'reloading':
      return 'The Suno Studio page is reloading.';
    case 'failed':
      return 'Could not attach to the Suno Studio tab.';
    case 'detached':
      return 'No active Suno Studio tab is available.';
    default:
      return 'Studio session is unavailable.';
  }
}

export class SnapshotFusion {
  private session: SessionSnapshot = {
    state: 'detached',
    generation: 0,
    changedAtMs: 0
  };
  private project: ProjectRecord | undefined;
  private transport: TransportRecord | undefined;

  updateSession(session: SessionSnapshot): void {
    const generationChanged = session.generation !== this.session.generation;
    this.session = { ...session };
    if (generationChanged
      || session.state === 'reloading'
      || session.state === 'detached'
      || session.state === 'failed') {
      this.invalidate();
    }
  }

  updateProject(project: ProjectRecord): void {
    if (this.session.state !== 'attached' || project.generation !== this.session.generation) return;
    this.project = project;
  }

  updateTransport(transport: TransportRecord): void {
    if (this.session.state !== 'attached' || transport.generation !== this.session.generation) return;
    this.transport = transport;
  }

  invalidate(): void {
    this.project = undefined;
    this.transport = undefined;
  }

  snapshot(nowMs: number): SunoSnapshot {
    if (this.session.state !== 'attached') {
      return {
        health: 'unavailable',
        bridgeStatus: 'waiting-for-project-state',
        clips: [],
        observedAtMs: nowMs,
        reason: sessionUnavailableReason(this.session)
      };
    }

    const project = this.project?.generation === this.session.generation
      ? this.project.state
      : undefined;
    const transport = this.transport?.generation === this.session.generation
      ? this.transport.observation
      : undefined;
    const readyProject = project?.status === 'ready' ? project : undefined;

    if (!transport) {
      return {
        health: 'unavailable',
        bridgeStatus: project?.status ?? 'waiting-for-project-state',
        ...(readyProject?.loop ? { loop: readyProject.loop } : {}),
        clips: readyProject?.clips ?? [],
        observedAtMs: project?.observedAtMs ?? nowMs,
        reason: project
          ? 'Studio transport has not been observed.'
          : 'Connected to Studio; waiting for project state.'
      };
    }

    const staleAfterMs = transport.isPlaying || transport.isScrubbing
      ? TRANSPORT_STALE_MS
      : PAUSED_TRANSPORT_STALE_MS;
    if (nowMs - transport.receivedAtMs > staleAfterMs) {
      return {
        health: 'unavailable',
        bridgeStatus: project?.status ?? 'waiting-for-project-state',
        ...(readyProject?.loop ? { loop: readyProject.loop } : {}),
        clips: readyProject?.clips ?? [],
        observedAtMs: transport.receivedAtMs,
        reason: 'Studio transport observation is stale.'
      };
    }

    if (!project || project.status !== 'ready') {
      const bridgeStatus = project?.status ?? 'waiting-for-project-state';
      return {
        health: 'degraded',
        bridgeStatus,
        projectTimeSeconds: transport.projectTimeSeconds,
        isPlaying: transport.isPlaying,
        clips: [],
        observedAtMs: Math.max(project?.observedAtMs ?? 0, transport.receivedAtMs),
        reason: BRIDGE_REASONS[bridgeStatus]
      };
    }

    return {
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: transport.projectTimeSeconds,
      isPlaying: transport.isPlaying,
      ...(project.loop ? { loop: project.loop } : {}),
      clips: project.clips,
      observedAtMs: Math.max(project.observedAtMs, transport.receivedAtMs)
    };
  }
}
