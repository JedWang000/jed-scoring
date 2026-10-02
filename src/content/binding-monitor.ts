import { isReliableBinding } from '../shared/time';
import type { ReferenceTrackBinding } from '../shared/types';
import {
  isBindableSunoClip,
  type BindableSunoClip,
  type SunoClip
} from './suno-adapter';

export type BindingWarningReason =
  | 'missing'
  | 'identity-ambiguous'
  | 'warped'
  | 'speed-changed'
  | 'looped'
  | 'reversed'
  | 'analysis-pending'
  | 'unsupported-mapping';

export type BindingStatus =
  | {
    readonly state: 'ready';
    readonly clip: BindableSunoClip;
    readonly mappingChanged: boolean;
  }
  | {
    readonly state: 'warning';
    readonly reason: BindingWarningReason;
  };

export function createBinding(
  clip: BindableSunoClip,
  confirmedAtMs = Date.now()
): ReferenceTrackBinding {
  return {
    clipId: clip.id,
    clipStartSeconds: clip.startSeconds,
    clipDurationSeconds: clip.durationSeconds,
    trimStartSeconds: clip.trimStartSeconds,
    speed: clip.speed,
    warped: clip.warped,
    confirmedAtMs
  };
}

export function inspectBinding(
  binding: ReferenceTrackBinding,
  clips: readonly SunoClip[]
): BindingStatus {
  const matches = clips.filter((clip) => clip.id === binding.clipId);
  if (matches.length === 0) return { state: 'warning', reason: 'missing' };
  if (matches.length > 1) return { state: 'warning', reason: 'identity-ambiguous' };

  const clip = matches[0];
  if (clip.bindingEligibility !== 'ready') {
    return { state: 'warning', reason: clip.bindingEligibility };
  }
  if (!isBindableSunoClip(clip)) {
    return { state: 'warning', reason: 'unsupported-mapping' };
  }
  if (clip.warped || binding.warped) return { state: 'warning', reason: 'warped' };
  if (!isReliableBinding(clip) || !isReliableBinding(binding)) {
    return { state: 'warning', reason: 'speed-changed' };
  }

  const mappingChanged = clip.startSeconds !== binding.clipStartSeconds
    || clip.durationSeconds !== binding.clipDurationSeconds
    || clip.trimStartSeconds !== binding.trimStartSeconds;

  return { state: 'ready', clip, mappingChanged };
}
