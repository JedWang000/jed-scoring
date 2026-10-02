export type DawSyncMode =
  | 'before-range'
  | 'inside-paused'
  | 'inside-playing'
  | 'after-range';

export interface DawSyncObservation {
  readonly projectTimeSeconds: number;
  readonly isPlaying: boolean;
  readonly clipStartSeconds: number;
  readonly clipDurationSeconds: number;
  readonly observedAtMs: number;
}

export interface DawSyncState {
  readonly mode: DawSyncMode;
  readonly effectiveIsPlaying: boolean;
  readonly discontinuity: boolean;
  readonly transitioned: boolean;
}

export interface DawSyncStateMachineOptions {
  readonly playbackGraceMs: number;
  readonly discontinuitySeconds: number;
}

interface PreviousObservation {
  readonly projectTimeSeconds: number;
  readonly observedAtMs: number;
  readonly rawIsPlaying: boolean;
  readonly effectiveIsPlaying: boolean;
}

export class DawSyncStateMachine {
  private previous?: PreviousObservation;
  private previousMode?: DawSyncMode;
  private graceUntilMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: DawSyncStateMachineOptions) {
  }

  update(input: DawSyncObservation): DawSyncState {
    const elapsedSeconds = this.previous
      ? Math.max(0, input.observedAtMs - this.previous.observedAtMs) / 1000
      : 0;
    const expectedDelta = this.previous?.effectiveIsPlaying ? elapsedSeconds : 0;
    const actualDelta = this.previous
      ? input.projectTimeSeconds - this.previous.projectTimeSeconds
      : 0;
    const discontinuity = Boolean(this.previous)
      && Math.abs(actualDelta - expectedDelta) >= this.options.discontinuitySeconds;

    if (input.isPlaying) {
      this.graceUntilMs = Number.NEGATIVE_INFINITY;
    } else if (this.previous?.rawIsPlaying && discontinuity) {
      this.graceUntilMs = input.observedAtMs + this.options.playbackGraceMs;
    }

    const effectiveIsPlaying = input.isPlaying
      || Boolean(
        this.previous?.effectiveIsPlaying
        && input.observedAtMs <= this.graceUntilMs
      );
    const clipEndSeconds = input.clipStartSeconds
      + Math.max(0, input.clipDurationSeconds);
    const mode: DawSyncMode = input.projectTimeSeconds < input.clipStartSeconds
      ? 'before-range'
      : input.projectTimeSeconds >= clipEndSeconds
        ? 'after-range'
        : effectiveIsPlaying
          ? 'inside-playing'
          : 'inside-paused';
    const transitioned = mode !== this.previousMode;

    this.previous = {
      projectTimeSeconds: input.projectTimeSeconds,
      observedAtMs: input.observedAtMs,
      rawIsPlaying: input.isPlaying,
      effectiveIsPlaying
    };
    this.previousMode = mode;

    return { mode, effectiveIsPlaying, discontinuity, transitioned };
  }
}
