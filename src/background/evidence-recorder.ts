import { DiagnosticsBuffer } from './diagnostics-buffer';

export interface ProbeInventory {
  readonly buttonCount: number;
  readonly timeTextCandidateCount: number;
  readonly semanticPlayCandidateCount: number;
  readonly semanticPauseCandidateCount: number;
  readonly accessibilityRoleCount: number;
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
}

export class EvidenceRecorder {
  constructor(private readonly diagnostics: DiagnosticsBuffer) {
  }

  recordProbeInventory(inventory: ProbeInventory): void {
    if (!Object.values(inventory).every(isCount)) {
      throw new Error('Invalid transport probe inventory.');
    }
    this.diagnostics.log('transport', 'inventory', { ...inventory });
  }
}
