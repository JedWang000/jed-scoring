export type SyncAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'seek'; readonly seconds: number }
  | { readonly kind: 'rate'; readonly playbackRate: number };

export interface SyncLimits {
  readonly smallErrorSeconds: number;
  readonly largeErrorSeconds: number;
}

export interface SyncTickInput {
  readonly isPlaying: boolean;
  readonly targetSeconds: number;
  readonly actualSeconds: number;
}

export class SyncEngine {
  constructor(private readonly limits: SyncLimits) {
  }

  tick(input: SyncTickInput): SyncAction {
    if (!input.isPlaying) return { kind: 'pause' };

    const errorSeconds = input.actualSeconds - input.targetSeconds;
    const absoluteErrorSeconds = Math.abs(errorSeconds);

    if (this.isAligned(input.targetSeconds, input.actualSeconds)) {
      return { kind: 'none' };
    }

    if (absoluteErrorSeconds >= this.limits.largeErrorSeconds) {
      return { kind: 'seek', seconds: input.targetSeconds };
    }

    return {
      kind: 'rate',
      playbackRate: errorSeconds > 0 ? 0.98 : 1.02
    };
  }

  isAligned(targetSeconds: number, actualSeconds: number): boolean {
    return Math.abs(actualSeconds - targetSeconds) <= this.limits.smallErrorSeconds;
  }
}
