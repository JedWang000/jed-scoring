import { describe, expect, it } from 'vitest';
import { DiagnosticsBuffer } from '../../src/background/diagnostics-buffer';
import { EvidenceRecorder } from '../../src/background/evidence-recorder';

describe('EvidenceRecorder', () => {
  it('records only aggregate DOM and accessibility evidence', () => {
    const buffer = new DiagnosticsBuffer(20, () => 10);
    const recorder = new EvidenceRecorder(buffer);

    recorder.recordProbeInventory({
      buttonCount: 18,
      timeTextCandidateCount: 2,
      semanticPlayCandidateCount: 1,
      semanticPauseCandidateCount: 0,
      accessibilityRoleCount: 31
    });

    expect(buffer.entries()).toEqual([{
      atMs: 10,
      category: 'transport',
      code: 'inventory',
      data: {
        buttonCount: 18,
        timeTextCandidateCount: 2,
        semanticPlayCandidateCount: 1,
        semanticPauseCandidateCount: 0,
        accessibilityRoleCount: 31
      }
    }]);
    expect(JSON.stringify(buffer.entries())).not.toMatch(/innerHTML|outerHTML|projectId|filename/i);
  });

  it('rejects non-integer and unbounded counts', () => {
    const recorder = new EvidenceRecorder(new DiagnosticsBuffer());
    expect(() => recorder.recordProbeInventory({
      buttonCount: -1,
      timeTextCandidateCount: 0,
      semanticPlayCandidateCount: 0,
      semanticPauseCandidateCount: 0,
      accessibilityRoleCount: 0
    })).toThrow(/inventory/i);
  });
});
