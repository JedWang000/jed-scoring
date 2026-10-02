import type { AdapterHealth } from '../content/suno-adapter';

export interface DiagnosticsInput {
  readonly generatedAtMs: number;
  readonly adapterHealth: AdapterHealth;
  readonly projectTimeSeconds?: number;
  readonly videoTimeSeconds?: number;
  readonly driftSeconds?: number;
  readonly bindingState: string;
  readonly selectorStrategyVersion: string;
  readonly errorCodes: readonly string[];
}

export function exportDiagnostics(input: DiagnosticsInput): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAtMs: input.generatedAtMs,
    adapter: {
      health: input.adapterHealth,
      selectorStrategyVersion: input.selectorStrategyVersion,
      projectTimeSeconds: input.projectTimeSeconds
    },
    sync: {
      videoTimeSeconds: input.videoTimeSeconds,
      driftSeconds: input.driftSeconds,
      bindingState: input.bindingState
    },
    errorCodes: [...input.errorCodes]
  }, null, 2);
}
