import { inspectBinding, type BindingWarningReason } from '../content/binding-monitor';
import type { SunoSnapshot } from '../content/suno-adapter';
import { computeTargetVideoTime } from '../shared/time';
import type { ReferenceTrackBinding, TimeMapping } from '../shared/types';
import {
  DawSyncStateMachine,
  type DawSyncMode
} from './daw-sync-state-machine';
import { SyncEngine, type SyncAction } from './sync-engine';
import type { VideoControl } from './video-controller';

export type SyncCoordinatorResult =
  | { readonly state: 'adapter-unavailable' }
  | { readonly state: 'warning'; readonly reason: BindingWarningReason }
  | {
    readonly state: 'paused';
    readonly mode: Exclude<DawSyncMode, 'inside-playing'>;
    readonly action: SyncAction;
    readonly targetSeconds: number;
    readonly actualSeconds: number;
  }
  | { readonly state: 'playback-blocked' }
  | {
    readonly state: 'syncing';
    readonly mode: 'inside-playing';
    readonly action: SyncAction;
    readonly targetSeconds: number;
    readonly actualSeconds: number;
  };

export type SyncCoordinatorResyncResult =
  | { readonly state: 'adapter-unavailable' }
  | { readonly state: 'warning'; readonly reason: BindingWarningReason }
  | {
    readonly state: 'aligned';
    readonly targetSeconds: number;
    readonly actualSeconds: number;
  };

export class SyncCoordinator {
  constructor(
    private readonly readSnapshot: () => Promise<SunoSnapshot>,
    private readonly controller: VideoControl,
    private readonly engine: SyncEngine,
    private readonly stateMachine = new DawSyncStateMachine({
      playbackGraceMs: 120,
      discontinuitySeconds: 0.15
    })
  ) {
  }

  async resync(
    binding: ReferenceTrackBinding,
    mapping: TimeMapping
  ): Promise<SyncCoordinatorResyncResult> {
    let snapshot: SunoSnapshot;
    try {
      snapshot = await this.readSnapshot();
    } catch {
      this.controller.pause();
      return { state: 'adapter-unavailable' };
    }
    if (
      snapshot.health !== 'healthy'
      || snapshot.projectTimeSeconds === undefined
    ) {
      this.controller.pause();
      return { state: 'adapter-unavailable' };
    }

    const bindingStatus = inspectBinding(binding, snapshot.clips);
    if (bindingStatus.state === 'warning') {
      this.controller.pause();
      return { state: 'warning', reason: bindingStatus.reason };
    }

    const mappedTargetSeconds = computeTargetVideoTime({
      ...mapping,
      clipStartSeconds: bindingStatus.clip.startSeconds,
      videoInSeconds: bindingStatus.clip.trimStartSeconds
    }, snapshot.projectTimeSeconds);
    const targetSeconds = this.clampTime(mappedTargetSeconds, this.safeDuration());
    const actualSeconds = this.controller.currentTime();
    this.controller.setRate(1);
    this.controller.seek(targetSeconds);
    return { state: 'aligned', targetSeconds, actualSeconds };
  }

  async tick(
    binding: ReferenceTrackBinding,
    mapping: TimeMapping
  ): Promise<SyncCoordinatorResult> {
    const snapshot = await this.readSnapshot();
    if (
      snapshot.health !== 'healthy'
      || snapshot.projectTimeSeconds === undefined
      || snapshot.isPlaying === undefined
    ) {
      this.controller.pause();
      return { state: 'adapter-unavailable' };
    }

    const bindingStatus = inspectBinding(binding, snapshot.clips);
    if (bindingStatus.state === 'warning') {
      this.controller.pause();
      return { state: 'warning', reason: bindingStatus.reason };
    }

    const videoDurationSeconds = this.safeDuration();
    const mappedTargetSeconds = computeTargetVideoTime({
      ...mapping,
      clipStartSeconds: bindingStatus.clip.startSeconds,
      videoInSeconds: bindingStatus.clip.trimStartSeconds
    }, snapshot.projectTimeSeconds);
    const targetSeconds = this.clampTime(mappedTargetSeconds, videoDurationSeconds);
    const actualSeconds = this.controller.currentTime();
    const dawState = this.stateMachine.update({
      projectTimeSeconds: snapshot.projectTimeSeconds,
      isPlaying: snapshot.isPlaying,
      clipStartSeconds: bindingStatus.clip.startSeconds,
      clipDurationSeconds: bindingStatus.clip.durationSeconds,
      observedAtMs: snapshot.observedAtMs
    });

    if (dawState.mode === 'before-range') {
      return this.pauseAt('before-range', 0, actualSeconds);
    }
    if (dawState.mode === 'after-range') {
      return this.pauseAt('after-range', videoDurationSeconds, actualSeconds);
    }
    if (dawState.mode === 'inside-paused') {
      return this.pauseAt('inside-paused', targetSeconds, actualSeconds);
    }

    const action = this.engine.tick({
      isPlaying: true,
      targetSeconds,
      actualSeconds
    });
    let appliedAction = action;

    if (action.kind === 'seek') {
      this.controller.setRate(1);
      if (this.controller.isSeeking()) {
        appliedAction = { kind: 'none' };
      } else {
        this.controller.seek(action.seconds);
      }
    } else if (action.kind === 'rate') {
      this.controller.setRate(action.playbackRate);
    } else {
      this.controller.setRate(1);
    }

    if (this.controller.isPaused()) {
      try {
        await this.controller.play();
      } catch (error) {
        if (error instanceof Error && error.name === 'NotAllowedError') {
          this.controller.pause();
          return { state: 'playback-blocked' };
        }
        throw error;
      }
    }
    return {
      state: 'syncing',
      mode: 'inside-playing',
      action: appliedAction,
      targetSeconds,
      actualSeconds
    };
  }

  private pauseAt(
    mode: Exclude<DawSyncMode, 'inside-playing'>,
    targetSeconds: number,
    actualSeconds: number
  ): Extract<SyncCoordinatorResult, { readonly state: 'paused' }> {
    this.controller.setRate(1);
    if (!this.controller.isPaused()) {
      this.controller.pause();
    }

    let action: SyncAction = { kind: 'pause' };
    if (
      !this.engine.isAligned(targetSeconds, actualSeconds)
      && !this.controller.isSeeking()
    ) {
      this.controller.seek(targetSeconds);
      action = { kind: 'seek', seconds: targetSeconds };
    }

    return { state: 'paused', mode, action, targetSeconds, actualSeconds };
  }

  private safeDuration(): number {
    const durationSeconds = this.controller.duration();
    return Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : 0;
  }

  private clampTime(seconds: number, durationSeconds: number): number {
    const finiteSeconds = Number.isFinite(seconds) ? seconds : 0;
    return Math.max(0, Math.min(finiteSeconds, durationSeconds));
  }
}
