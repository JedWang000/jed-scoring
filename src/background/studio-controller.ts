import type { SunoSnapshot } from '../content/suno-adapter';
import type { CdpApi, CdpEvent } from './cdp-api';
import { DiagnosticsBuffer, type DiagnosticEntry } from './diagnostics-buffer';
import { EvidenceRecorder, type ProbeInventory } from './evidence-recorder';
import {
  ProjectCollector,
  type ProjectObservation
} from './project-collector';
import { SnapshotFusion } from './snapshot-fusion';
import { CdpSessionManager, type SessionSnapshot } from './session-manager';
import { evaluateTransportProbe, installTransportProbe } from './transport-probe';
import {
  TRANSPORT_BINDING_NAME,
  isNewerTransport,
  parseTransportBinding,
  type TransportObservation
} from './transport-protocol';

export interface StudioTab {
  readonly id?: number;
  readonly url?: string;
}

export interface StudioTabsApi {
  query(queryInfo: {
    readonly active: true;
    readonly currentWindow: true;
  }): Promise<readonly StudioTab[]>;
}

const INVENTORY_EXPRESSION = String.raw`(() => {
  const controls = Array.from(document.querySelectorAll('button,[role="button"]'));
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const names = controls.map((element) => [
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.getAttribute('data-testid') || '',
    element.textContent || ''
  ].join(' ').trim()).filter((_, index) => visible(controls[index]));
  const timePattern = /^(?:-?\d+:)?-?\d{1,2}:-?[0-5]\d(?:\.-?\d{1,3})?$/;
  return {
    buttonCount: controls.length,
    timeTextCandidateCount: names.filter((name) => timePattern.test(name)).length,
    semanticPlayCandidateCount: names.filter((name) => /(?:^|\s)(play|播放)(?:\s|$)/i.test(name)).length,
    semanticPauseCandidateCount: names.filter((name) => /(?:^|\s)(pause|暂停)(?:\s|$)/i.test(name)).length
  };
})()`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 100_000
    ? value
    : undefined;
}

function parseRuntimeInventory(value: unknown): Omit<ProbeInventory, 'accessibilityRoleCount'> | undefined {
  if (!isRecord(value) || !isRecord(value.result) || !isRecord(value.result.value)) return undefined;
  const candidate = value.result.value;
  const buttonCount = readCount(candidate.buttonCount);
  const timeTextCandidateCount = readCount(candidate.timeTextCandidateCount);
  const semanticPlayCandidateCount = readCount(candidate.semanticPlayCandidateCount);
  const semanticPauseCandidateCount = readCount(candidate.semanticPauseCandidateCount);
  if (buttonCount === undefined
    || timeTextCandidateCount === undefined
    || semanticPlayCandidateCount === undefined
    || semanticPauseCandidateCount === undefined) return undefined;
  return {
    buttonCount,
    timeTextCandidateCount,
    semanticPlayCandidateCount,
    semanticPauseCandidateCount
  };
}

interface TransportProbeResult {
  readonly status: 'ready' | 'time-candidate-count' | 'local-cluster-not-unique';
  readonly timeCandidateCount: number;
  readonly localActionCandidateCount: number;
  readonly reactFiberPropertyCount: number;
  readonly reactFiberAlternatePresent: boolean;
  readonly reactCurrentTreeResolved: boolean;
  readonly reactFiberAncestorCount: number;
  readonly reactFiberTraversalComplete: boolean;
  readonly reactProviderValueCount: number;
  readonly reactOwnerDepth0Count: number;
  readonly reactOwnerDepth1Count: number;
  readonly reactOwnerDepth2Count: number;
  readonly reactOwnerDepth3Count: number;
  readonly reactOwnerDepth4Count: number;
  readonly reactEvidenceTruncated: boolean;
}

function parseTransportProbeResult(value: unknown): TransportProbeResult | undefined {
  if (!isRecord(value) || !isRecord(value.result) || !isRecord(value.result.value)) return undefined;
  const candidate = value.result.value;
  const status = candidate.status;
  const timeCandidateCount = readCount(candidate.timeCandidateCount);
  const localActionCandidateCount = readCount(candidate.localActionCandidateCount);
  const reactFiberPropertyCount = readCount(candidate.reactFiberPropertyCount);
  const reactFiberAlternatePresent = candidate.reactFiberAlternatePresent;
  const reactCurrentTreeResolved = candidate.reactCurrentTreeResolved;
  const reactFiberAncestorCount = readCount(candidate.reactFiberAncestorCount);
  const reactFiberTraversalComplete = candidate.reactFiberTraversalComplete;
  const reactProviderValueCount = readCount(candidate.reactProviderValueCount);
  const reactOwnerDepth0Count = readCount(candidate.reactOwnerDepth0Count);
  const reactOwnerDepth1Count = readCount(candidate.reactOwnerDepth1Count);
  const reactOwnerDepth2Count = readCount(candidate.reactOwnerDepth2Count);
  const reactOwnerDepth3Count = readCount(candidate.reactOwnerDepth3Count);
  const reactOwnerDepth4Count = readCount(candidate.reactOwnerDepth4Count);
  const reactEvidenceTruncated = candidate.reactEvidenceTruncated;
  if ((status !== 'ready'
      && status !== 'time-candidate-count'
      && status !== 'local-cluster-not-unique')
    || timeCandidateCount === undefined
    || localActionCandidateCount === undefined
    || reactFiberPropertyCount === undefined
    || typeof reactFiberAlternatePresent !== 'boolean'
    || typeof reactCurrentTreeResolved !== 'boolean'
    || reactFiberAncestorCount === undefined
    || typeof reactFiberTraversalComplete !== 'boolean'
    || reactProviderValueCount === undefined
    || reactOwnerDepth0Count === undefined
    || reactOwnerDepth1Count === undefined
    || reactOwnerDepth2Count === undefined
    || reactOwnerDepth3Count === undefined
    || reactOwnerDepth4Count === undefined
    || typeof reactEvidenceTruncated !== 'boolean') return undefined;
  return {
    status,
    timeCandidateCount,
    localActionCandidateCount,
    reactFiberPropertyCount,
    reactFiberAlternatePresent,
    reactCurrentTreeResolved,
    reactFiberAncestorCount,
    reactFiberTraversalComplete,
    reactProviderValueCount,
    reactOwnerDepth0Count,
    reactOwnerDepth1Count,
    reactOwnerDepth2Count,
    reactOwnerDepth3Count,
    reactOwnerDepth4Count,
    reactEvidenceTruncated
  };
}

function countAccessibilityRoles(value: unknown): number | undefined {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return undefined;
  const count = value.nodes.filter((node) => (
    isRecord(node)
    && isRecord(node.role)
    && typeof node.role.value === 'string'
  )).length;
  return readCount(count);
}

function isStudioUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://suno.com'
      && (url.pathname === '/studio' || url.pathname.startsWith('/studio/'));
  } catch {
    return false;
  }
}

function sessionReason(snapshot: SessionSnapshot): string {
  if (snapshot.state === 'attached' || snapshot.state === 'reloading') {
    return 'Connected to Studio; waiting for project state.';
  }
  if (snapshot.state === 'failed') {
    return snapshot.reason?.toLowerCase().includes('debugger')
      ? 'The Studio debugging target is already in use.'
      : 'Could not attach to the Suno Studio tab.';
  }
  if (snapshot.state === 'attaching') return 'Connecting to the Suno Studio tab.';
  return 'No active Suno Studio tab is available.';
}

export class StudioController {
  private readonly recorder: EvidenceRecorder;
  private readonly projectCollector: ProjectCollector;
  private readonly fusion = new SnapshotFusion();
  private availabilityReason = 'No active Suno Studio tab is available.';
  private lastSessionGeneration = 0;
  private transportObservation: TransportObservation | undefined;
  private bindingTabId: number | undefined;
  private transportSetup: Promise<void> | undefined;

  constructor(
    private readonly tabs: StudioTabsApi,
    private readonly session: CdpSessionManager,
    private readonly cdp: CdpApi,
    private readonly diagnosticBuffer: DiagnosticsBuffer,
    private readonly now: () => number = Date.now
  ) {
    this.recorder = new EvidenceRecorder(diagnosticBuffer);
    this.projectCollector = new ProjectCollector(
      (tabId, method, params) => this.cdp.send(tabId, method, params),
      (observation) => this.observeProject(observation),
      now,
      (code) => diagnosticBuffer.log('network', code),
      (evidence) => diagnosticBuffer.log('project', 'shape', { ...evidence })
    );
    this.session.onEvent((event, generation) => this.handleSessionEvent(event, generation));
    this.session.onStateChange((snapshot) => {
      if (snapshot.generation !== this.lastSessionGeneration || snapshot.state === 'reloading') {
        this.lastSessionGeneration = snapshot.generation;
        this.transportObservation = undefined;
        this.projectCollector.reset();
      }
      this.fusion.updateSession(snapshot);
      if (snapshot.state !== 'attached') {
        if (snapshot.state === 'detached' || snapshot.state === 'failed') {
          this.bindingTabId = undefined;
          this.transportSetup = undefined;
        }
      } else if (snapshot.tabId !== undefined) {
        this.transportSetup = this.prepareTransportProbe(snapshot.tabId);
      }
      const knownDetachReasons = new Set([
        'target_closed',
        'canceled_by_user',
        'replaced_with_devtools'
      ]);
      const reasonCode = snapshot.reason && knownDetachReasons.has(snapshot.reason)
        ? snapshot.reason
        : undefined;
      diagnosticBuffer.log('session', snapshot.state, {
        generation: snapshot.generation,
        ...(reasonCode ? { reasonCode } : {})
      });
      this.availabilityReason = sessionReason(snapshot);
    });
  }

  async connect(): Promise<SunoSnapshot> {
    let tabs: readonly StudioTab[];
    try {
      tabs = await this.tabs.query({ active: true, currentWindow: true });
    } catch {
      this.availabilityReason = 'Active browser tab could not be queried.';
      this.diagnosticBuffer.log('session', 'studio-tab-query-failed');
      return this.snapshot();
    }

    const tab = tabs.find((candidate) => candidate.id !== undefined && isStudioUrl(candidate.url));
    if (tab?.id === undefined) {
      this.availabilityReason = 'No active Suno Studio tab is available.';
      this.diagnosticBuffer.log('session', 'studio-tab-unavailable');
      return this.snapshot();
    }

    const beforeConnect = this.session.snapshot();
    const reconnectingAttachedTab = beforeConnect.state === 'attached'
      && beforeConnect.tabId === tab.id;
    const session = await this.session.connect(tab.id);
    if (session.state === 'attached') {
      if (reconnectingAttachedTab || !this.transportSetup) {
        this.transportSetup = this.prepareTransportProbe(tab.id);
      }
      await this.transportSetup;
      await this.captureEvidence(tab.id);
    }
    return this.snapshot();
  }

  async reload(): Promise<SunoSnapshot> {
    await this.session.reload();
    await this.transportSetup;
    const tabId = this.session.snapshot().tabId;
    if (tabId !== undefined) await this.captureEvidence(tabId);
    return this.snapshot();
  }

  snapshot(): SunoSnapshot {
    const session = this.session.snapshot();
    const snapshot = this.fusion.snapshot(this.now());
    return session.state === 'attached'
      ? snapshot
      : {
          ...snapshot,
          reason: session.state === 'detached' ? this.availabilityReason : sessionReason(session)
        };
  }

  diagnostics(): readonly DiagnosticEntry[] {
    return this.diagnosticBuffer.entries();
  }

  private observeProject(observation: ProjectObservation): void {
    const session = this.session.snapshot();
    if ((session.state !== 'attached' && session.state !== 'reloading')
      || observation.generation !== session.generation) return;
    this.fusion.updateProject(observation);
    this.diagnosticBuffer.log('project', 'projection', {
      generation: observation.generation,
      source: observation.source,
      status: observation.state.status,
      clipCount: observation.state.status === 'ready' ? observation.state.clips.length : 0
    });
  }

  private handleSessionEvent(event: CdpEvent, generation: number): void {
    void this.projectCollector.handle(event, generation);
    if (event.method !== 'Runtime.bindingCalled' || !isRecord(event.params)) return;
    if (event.params.name !== TRANSPORT_BINDING_NAME) return;
    if (typeof event.params.payload !== 'string') {
      this.diagnosticBuffer.log('transport', 'payload-invalid', { generation });
      return;
    }
    const session = this.session.snapshot();
    if (session.state !== 'attached' || session.generation !== generation) return;
    const observation = parseTransportBinding(event.params.payload, this.now());
    if (!observation) {
      this.diagnosticBuffer.log('transport', 'payload-invalid', { generation });
      return;
    }
    if (!isNewerTransport(this.transportObservation, observation)) {
      this.diagnosticBuffer.log('transport', 'payload-out-of-order', {
        generation,
        sequence: observation.sequence
      });
      return;
    }
    const previous = this.transportObservation;
    this.transportObservation = observation;
    this.fusion.updateTransport({ generation, observation });
    if (!previous
      || previous.strategyId !== observation.strategyId
      || previous.isPlaying !== observation.isPlaying
      || previous.isScrubbing !== observation.isScrubbing) {
      this.diagnosticBuffer.log('transport', 'accepted', {
        generation,
        sequence: observation.sequence,
        strategyId: observation.strategyId,
        isPlaying: observation.isPlaying,
        isScrubbing: observation.isScrubbing
      });
    }
  }

  private async prepareTransportProbe(tabId: number): Promise<void> {
    const alreadyBound = this.bindingTabId === tabId;
    if (!alreadyBound) this.bindingTabId = tabId;
    try {
      const send = (method: string, params?: object) => this.cdp.send(tabId, method, params);
      const runtimeResult = alreadyBound
        ? await evaluateTransportProbe(send)
        : await installTransportProbe(send);
      const probe = parseTransportProbeResult(runtimeResult);
      if (probe) {
        this.diagnosticBuffer.log(
          'transport',
          probe.status === 'ready' ? 'probe-ready' : 'probe-rejected',
          {
            generation: this.session.snapshot().generation,
            probeStatus: probe.status,
            timeCandidateCount: probe.timeCandidateCount,
            localActionCandidateCount: probe.localActionCandidateCount,
            reactFiberPropertyCount: probe.reactFiberPropertyCount,
            reactFiberAlternatePresent: probe.reactFiberAlternatePresent,
            reactCurrentTreeResolved: probe.reactCurrentTreeResolved,
            reactFiberAncestorCount: probe.reactFiberAncestorCount,
            reactFiberTraversalComplete: probe.reactFiberTraversalComplete,
            reactProviderValueCount: probe.reactProviderValueCount,
            reactOwnerDepth0Count: probe.reactOwnerDepth0Count,
            reactOwnerDepth1Count: probe.reactOwnerDepth1Count,
            reactOwnerDepth2Count: probe.reactOwnerDepth2Count,
            reactOwnerDepth3Count: probe.reactOwnerDepth3Count,
            reactOwnerDepth4Count: probe.reactOwnerDepth4Count,
            reactEvidenceTruncated: probe.reactEvidenceTruncated,
            reinstalled: alreadyBound
          }
        );
      } else {
        this.diagnosticBuffer.log('transport', alreadyBound ? 'probe-reinstalled' : 'probe-installed', {
          generation: this.session.snapshot().generation
        });
      }
    } catch {
      if (!alreadyBound && this.bindingTabId === tabId) this.bindingTabId = undefined;
      this.diagnosticBuffer.log('transport', 'probe-install-failed', {
        generation: this.session.snapshot().generation
      });
    }
  }

  private async captureEvidence(tabId: number): Promise<void> {
    try {
      const [runtime, accessibility] = await Promise.all([
        this.cdp.send(tabId, 'Runtime.evaluate', {
          expression: INVENTORY_EXPRESSION,
          returnByValue: true,
          awaitPromise: false
        }),
        this.cdp.send(tabId, 'Accessibility.getFullAXTree')
      ]);
      const runtimeInventory = parseRuntimeInventory(runtime);
      const accessibilityRoleCount = countAccessibilityRoles(accessibility);
      if (!runtimeInventory || accessibilityRoleCount === undefined) {
        this.diagnosticBuffer.log('transport', 'inventory-invalid');
        return;
      }
      this.recorder.recordProbeInventory({
        ...runtimeInventory,
        accessibilityRoleCount
      });
    } catch {
      this.diagnosticBuffer.log('transport', 'inventory-capture-failed');
    }
  }
}
