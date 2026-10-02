import { describe, expect, it } from 'vitest';
import {
  derivePresentationPhase,
  type PresentationInput
} from '../../src/ui/model/presentation-state';

const readyInput: PresentationInput = {
  state: 'sync-ready',
  hasStudioActions: true,
  bridgeStatus: 'ready',
  hasFile: true,
  silentReferenceKind: 'ready',
  bindingConfirmed: true
};

function input(overrides: Partial<PresentationInput>): PresentationInput {
  return { ...readyInput, ...overrides };
}

describe('derivePresentationPhase', () => {
  it('advances through preparation in dependency order before showing the console', () => {
    expect(derivePresentationPhase(input({
      bridgeStatus: 'waiting-for-project-state',
      hasFile: false,
      silentReferenceKind: undefined,
      bindingConfirmed: false
    }))).toEqual({
      kind: 'preparation',
      current: 'connect-studio',
      completed: []
    });

    expect(derivePresentationPhase(input({
      hasFile: false,
      silentReferenceKind: undefined,
      bindingConfirmed: false
    }))).toEqual({
      kind: 'preparation',
      current: 'import-video',
      completed: ['connect-studio']
    });

    expect(derivePresentationPhase(input({
      silentReferenceKind: 'preparing',
      bindingConfirmed: false
    }))).toEqual({
      kind: 'preparation',
      current: 'prepare-reference',
      completed: ['connect-studio', 'import-video']
    });

    expect(derivePresentationPhase(input({ bindingConfirmed: false }))).toEqual({
      kind: 'preparation',
      current: 'bind-reference',
      completed: ['connect-studio', 'import-video', 'prepare-reference']
    });

    expect(derivePresentationPhase(readyInput)).toEqual({ kind: 'console' });
  });

  it('selects Studio connection for an unavailable adapter when actions exist', () => {
    expect(derivePresentationPhase(input({ state: 'adapter-unavailable' }))).toEqual({
      kind: 'preparation',
      current: 'connect-studio',
      completed: []
    });
  });

  it('requires video reauthorization before restoring an old mapping summary', () => {
    expect(derivePresentationPhase(input({
      state: 'file-reauthorization-required',
      bridgeStatus: 'waiting-for-project-state'
    }))).toEqual({
      kind: 'preparation',
      current: 'import-video',
      completed: []
    });
  });

  it.each(['warning', 'playback-blocked'] as const)(
    'keeps recovery state %s in the console when its prerequisites remain available',
    (state) => {
      expect(derivePresentationPhase(input({ state }))).toEqual({ kind: 'console' });
    }
  );

  it('returns to reference preparation when silent reference generation failed', () => {
    expect(derivePresentationPhase(input({
      silentReferenceKind: 'failed',
      bindingConfirmed: false
    }))).toEqual({
      kind: 'preparation',
      current: 'prepare-reference',
      completed: ['connect-studio', 'import-video']
    });
  });

  it('requires explicit binding confirmation after the reference file is ready', () => {
    expect(derivePresentationPhase(input({ bindingConfirmed: false }))).toEqual({
      kind: 'preparation',
      current: 'bind-reference',
      completed: ['connect-studio', 'import-video', 'prepare-reference']
    });
  });
});
