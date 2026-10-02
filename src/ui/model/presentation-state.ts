import type { SilentReferenceState } from '../components/SilentReferenceCard';
import type { StudioConnectionCardProps } from '../components/StudioConnectionCard';
import type { AppState } from '../components/SyncStatus';

type ProjectBridgeStatus = StudioConnectionCardProps['bridgeStatus'];

export type PreparationStep =
  | 'connect-studio'
  | 'import-video'
  | 'prepare-reference'
  | 'bind-reference';

export type PresentationPhase =
  | {
      readonly kind: 'preparation';
      readonly current: PreparationStep;
      readonly completed: readonly PreparationStep[];
    }
  | { readonly kind: 'console' };

export interface PresentationInput {
  readonly state: AppState;
  readonly hasStudioActions: boolean;
  readonly bridgeStatus: ProjectBridgeStatus;
  readonly hasFile: boolean;
  readonly silentReferenceKind?: SilentReferenceState['kind'];
  readonly bindingConfirmed: boolean;
}

export function derivePresentationPhase(input: PresentationInput): PresentationPhase {
  const connectionSatisfied = !input.hasStudioActions
    || (input.state !== 'adapter-unavailable' && input.bridgeStatus === 'ready');

  if (input.state === 'file-reauthorization-required') {
    return {
      kind: 'preparation',
      current: 'import-video',
      completed: connectionSatisfied ? ['connect-studio'] : []
    };
  }

  if (!connectionSatisfied) {
    return {
      kind: 'preparation',
      current: 'connect-studio',
      completed: []
    };
  }

  if (!input.hasFile) {
    return {
      kind: 'preparation',
      current: 'import-video',
      completed: ['connect-studio']
    };
  }

  if (input.silentReferenceKind !== 'ready') {
    return {
      kind: 'preparation',
      current: 'prepare-reference',
      completed: ['connect-studio', 'import-video']
    };
  }

  if (!input.bindingConfirmed) {
    return {
      kind: 'preparation',
      current: 'bind-reference',
      completed: ['connect-studio', 'import-video', 'prepare-reference']
    };
  }

  return { kind: 'console' };
}
