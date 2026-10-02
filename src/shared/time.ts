import type { TimeMapping } from './types';

export const NORMAL_SPEED_TOLERANCE = 1e-9;

export function computeTargetVideoTime(mapping: TimeMapping, sunoTime: number): number {
  return sunoTime
    - mapping.clipStartSeconds
    + mapping.videoInSeconds
    + mapping.offsetSeconds;
}

export function isReliableBinding(input: { readonly speed: number; readonly warped: boolean }): boolean {
  return Math.abs(input.speed - 1) <= NORMAL_SPEED_TOLERANCE && input.warped === false;
}
