import {
  MAX_PROJECT_TIME_SECONDS,
  MIN_PROJECT_TIME_SECONDS,
  TRANSPORT_BINDING_NAME
} from './transport-protocol';

export type TransportProbeCommandSender = (
  method: string,
  params?: object
) => Promise<unknown>;

function bootstrapTransportProbe(
  bindingName: string,
  minProjectTimeSeconds: number,
  maxProjectTimeSeconds: number
): {
  readonly status: string;
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
} {
  const host = globalThis as unknown as Record<string, unknown>;
  const existing = host.__sunoVideoSyncTransportProbeV1 as { stop?: unknown } | undefined;
  if (typeof existing?.stop === 'function') existing.stop();
  const sequenceKey = '__sunoVideoSyncTransportSequenceV1';
  const persistedSequence = host[sequenceKey];

  const timePattern = /^-?(?:\d+:)?\d{1,2}:[0-5]\d(?:\.\d{1,3})?$/;
  // Suno renders negative pre-roll with a sign on more than one component
  // (for example "-01:-08.000" or "-01:-05.-605"). Treat that as a transport anchor, while
  // continuing to use only the runtime controller for its authoritative time.
  const timeCandidatePattern = /^(?:-?\d+:)?-?\d{1,2}:-?[0-5]\d(?:\.-?\d{1,3})?$/;
  const tempoPattern = /^\d+(?:\.\d+)?\s*BPM$/i;
  const signaturePattern = /^\d+\s*\/\s*\d+$/;
  const maxFiberAncestors = 2048;
  const actionPlayPattern = /(?:^|[\s_-])(play|播放)(?:[\s_-]|$)/i;
  const actionPausePattern = /(?:^|[\s_-])(pause|暂停)(?:[\s_-]|$)/i;
  const corroboratorPatterns = [
    /(?:^|[\s_-])(loop|循环)(?:[\s_-]|$)/i,
    /(?:^|[\s_-])(rewind|previous|back|start|倒退|上一|开头)(?:[\s_-]|$)/i,
    /(?:^|[\s_-])(forward|next|end|快进|下一|结尾)(?:[\s_-]|$)/i
  ];
  const controlSelector = 'button,[role="button"]';
  let sequence = typeof persistedSequence === 'number'
    && Number.isSafeInteger(persistedSequence)
    && persistedSequence >= 0
    ? persistedSequence
    : 0;
  let scrubbing = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let cached: {
    timeControl: Element;
    actionControl?: Element;
    runtimeController?: {
      readonly playing: boolean;
      readonly getCurrentSeconds: () => number;
    };
    strategyId: string;
  } | undefined;
  const emptyReactEvidence = {
    reactFiberPropertyCount: 0,
    reactFiberAlternatePresent: false,
    reactCurrentTreeResolved: false,
    reactFiberAncestorCount: 0,
    reactFiberTraversalComplete: false,
    reactProviderValueCount: 0,
    reactOwnerDepth0Count: 0,
    reactOwnerDepth1Count: 0,
    reactOwnerDepth2Count: 0,
    reactOwnerDepth3Count: 0,
    reactOwnerDepth4Count: 0,
    reactEvidenceTruncated: false
  };
  let discoveryStatus = {
    status: 'not-inspected',
    timeCandidateCount: 0,
    localActionCandidateCount: 0,
    ...emptyReactEvidence
  };

  const visible = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  const names = (element: Element): readonly string[] => [
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.getAttribute('data-testid') || '',
    element.textContent || ''
  ].map((value) => value.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const matchingName = (element: Element, pattern: RegExp): string | undefined => (
    names(element).find((value) => pattern.test(value))
  );
  const actionState = (element: Element): boolean | undefined => {
    const values = names(element);
    const hasPause = values.some((value) => actionPausePattern.test(value));
    const hasPlay = values.some((value) => actionPlayPattern.test(value));
    if (hasPause === hasPlay) return undefined;
    if (hasPause) return true;
    return element.getAttribute('aria-pressed') === 'true';
  };
  const parseTime = (text: string): number | undefined => {
    if (!timePattern.test(text)) return undefined;
    const negative = text.startsWith('-');
    const unsignedText = negative ? text.slice(1) : text;
    const parts = unsignedText.split(':').map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return undefined;
    const seconds = parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
    const signedSeconds = negative ? -seconds : seconds;
    return Number.isFinite(signedSeconds)
      && signedSeconds >= minProjectTimeSeconds
      && signedSeconds <= maxProjectTimeSeconds
      ? signedSeconds
      : undefined;
  };
  const ownValue = (value: object, key: PropertyKey): unknown => (
    Object.getOwnPropertyDescriptor(value, key)?.value
  );
  const isObject = (value: unknown): value is Record<PropertyKey, unknown> => (
    typeof value === 'object' && value !== null
  );
  const isPlaybackController = (value: unknown): value is {
    readonly playing: boolean;
    readonly getCurrentSeconds: () => number;
  } => (
    isObject(value)
    && typeof ownValue(value, 'playing') === 'boolean'
    && typeof ownValue(value, 'getCurrentSeconds') === 'function'
  );
  const currentReactFiber = (element: Element): {
    readonly fiber?: Record<PropertyKey, unknown>;
    readonly propertyCount: number;
    readonly alternatePresent: boolean;
    readonly currentTreeResolved: boolean;
  } => {
    const fiberKeys = Object.getOwnPropertyNames(element).filter((key) => (
      key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    ));
    const fiberKey = fiberKeys[0];
    const initial = fiberKey ? ownValue(element, fiberKey) : undefined;
    if (!isObject(initial)) {
      return {
        propertyCount: fiberKeys.length,
        alternatePresent: false,
        currentTreeResolved: false
      };
    }
    const rootOf = (fiber: Record<PropertyKey, unknown>): Record<PropertyKey, unknown> | undefined => {
      let current = fiber;
      const visited = new Set<Record<PropertyKey, unknown>>();
      for (let depth = 0; depth < maxFiberAncestors; depth += 1) {
        if (visited.has(current)) return undefined;
        visited.add(current);
        const parent = ownValue(current, 'return');
        if (!isObject(parent)) return current;
        current = parent;
      }
      return undefined;
    };
    const initialRoot = rootOf(initial);
    const initialStateNode = initialRoot && ownValue(initialRoot, 'stateNode');
    if (isObject(initialStateNode) && ownValue(initialStateNode, 'current') === initialRoot) {
      return {
        fiber: initial,
        propertyCount: fiberKeys.length,
        alternatePresent: isObject(ownValue(initial, 'alternate')),
        currentTreeResolved: true
      };
    }
    const alternate = ownValue(initial, 'alternate');
    if (isObject(alternate)) {
      const alternateRoot = rootOf(alternate);
      const alternateStateNode = alternateRoot && ownValue(alternateRoot, 'stateNode');
      if (isObject(alternateStateNode)
        && ownValue(alternateStateNode, 'current') === alternateRoot) {
        return {
          fiber: alternate,
          propertyCount: fiberKeys.length,
          alternatePresent: true,
          currentTreeResolved: true
        };
      }
    }
    return {
      fiber: initial,
      propertyCount: fiberKeys.length,
      alternatePresent: isObject(alternate),
      currentTreeResolved: false
    };
  };
  const runtimeControllersFrom = (root: unknown): readonly {
    readonly playing: boolean;
    readonly getCurrentSeconds: () => number;
  }[] => {
    if (!isObject(root)) return [];
    const found = new Set<{
      readonly playing: boolean;
      readonly getCurrentSeconds: () => number;
    }>();
    const collectDirectController = (value: unknown): void => {
      if (!isObject(value)) return;
      const controller = ownValue(value, 'playbackController');
      if (isPlaybackController(controller)) found.add(controller);
    };
    collectDirectController(root);
    for (const key of Reflect.ownKeys(root)) {
      if (typeof key !== 'symbol') continue;
      const contextSlot = ownValue(root, key);
      if (!isObject(contextSlot)) continue;
      collectDirectController(ownValue(contextSlot, 'current'));
      const valueRef = ownValue(contextSlot, 'v');
      if (isObject(valueRef)) collectDirectController(ownValue(valueRef, 'current'));
    }
    return [...found];
  };
  const discoverRuntimeController = (timeControl: Element): {
    readonly playing: boolean;
    readonly getCurrentSeconds: () => number;
  } | undefined => {
    let fiber = currentReactFiber(timeControl).fiber;
    const found = new Set<{
      readonly playing: boolean;
      readonly getCurrentSeconds: () => number;
    }>();
    const visited = new Set<Record<PropertyKey, unknown>>();
    for (let depth = 0; fiber && depth < maxFiberAncestors; depth += 1) {
      if (visited.has(fiber)) return undefined;
      visited.add(fiber);
      const props = ownValue(fiber, 'memoizedProps');
      if (isObject(props)) {
        for (const controller of runtimeControllersFrom(ownValue(props, 'value'))) {
          found.add(controller);
        }
      }
      const parent = ownValue(fiber, 'return');
      fiber = isObject(parent) ? parent : undefined;
    }
    if (fiber) return undefined;
    return found.size === 1 ? [...found][0] : undefined;
  };
  const collectReactEvidence = (timeControl: Element): typeof emptyReactEvidence => {
    const selected = currentReactFiber(timeControl);
    let fiber = selected.fiber;
    let ancestorCount = 0;
    let providerValueCount = 0;
    const ownerCounts = [0, 0, 0, 0, 0];
    let evidenceTruncated = false;
    const visited = new Set<Record<PropertyKey, unknown>>();
    let visitedObjectCount = 0;
    const collectOwners = (root: Record<PropertyKey, unknown>): void => {
      const pending: Array<{
        readonly value: Record<PropertyKey, unknown>;
        readonly depth: number;
      }> = [{ value: root, depth: 0 }];
      while (pending.length > 0) {
        const item = pending.shift();
        if (!item || visited.has(item.value)) continue;
        if (visitedObjectCount >= 512) {
          evidenceTruncated = true;
          return;
        }
        visited.add(item.value);
        visitedObjectCount += 1;
        const playbackController = ownValue(item.value, 'playbackController');
        if (isPlaybackController(playbackController)) {
          ownerCounts[item.depth] += 1;
          continue;
        }
        let keys: readonly PropertyKey[];
        try {
          keys = Reflect.ownKeys(item.value);
        } catch {
          evidenceTruncated = true;
          continue;
        }
        if (keys.length > 256) evidenceTruncated = true;
        for (const key of keys.slice(0, 256)) {
          let child: unknown;
          try {
            child = ownValue(item.value, key);
          } catch {
            evidenceTruncated = true;
            continue;
          }
          if (!isObject(child)) continue;
          if (item.depth >= 4) {
            evidenceTruncated = true;
          } else {
            pending.push({ value: child, depth: item.depth + 1 });
          }
        }
      }
    };
    const visitedFibers = new Set<Record<PropertyKey, unknown>>();
    for (; fiber && ancestorCount < maxFiberAncestors; ancestorCount += 1) {
      if (visitedFibers.has(fiber)) break;
      visitedFibers.add(fiber);
      const props = ownValue(fiber, 'memoizedProps');
      const providerValue = isObject(props) ? ownValue(props, 'value') : undefined;
      if (isObject(providerValue)) {
        providerValueCount += 1;
        collectOwners(providerValue);
      }
      const parent = ownValue(fiber, 'return');
      fiber = isObject(parent) ? parent : undefined;
    }
    return {
      reactFiberPropertyCount: selected.propertyCount,
      reactFiberAlternatePresent: selected.alternatePresent,
      reactCurrentTreeResolved: selected.currentTreeResolved,
      reactFiberAncestorCount: ancestorCount,
      reactFiberTraversalComplete: fiber === undefined,
      reactProviderValueCount: providerValueCount,
      reactOwnerDepth0Count: ownerCounts[0],
      reactOwnerDepth1Count: ownerCounts[1],
      reactOwnerDepth2Count: ownerCounts[2],
      reactOwnerDepth3Count: ownerCounts[3],
      reactOwnerDepth4Count: ownerCounts[4],
      reactEvidenceTruncated: evidenceTruncated
    };
  };
  const corroboratorCount = (controls: readonly Element[]): number => {
    const controlNames = controls.flatMap((control) => [...names(control)]);
    let count = 0;
    if (controlNames.some((value) => tempoPattern.test(value))) count += 1;
    if (controlNames.some((value) => signaturePattern.test(value))) count += 1;
    count += corroboratorPatterns.filter((pattern) => (
      controlNames.some((value) => pattern.test(value))
    )).length;
    return count;
  };
  const discover = (): typeof cached => {
    const controls = Array.from(document.querySelectorAll(controlSelector)).filter(visible);
    const timeControls = controls.filter((control) => (
      names(control).some((value) => timeCandidatePattern.test(value))
    ));
    if (timeControls.length !== 1) {
      discoveryStatus = {
        status: 'time-candidate-count',
        timeCandidateCount: timeControls.length,
        localActionCandidateCount: 0,
        ...emptyReactEvidence
      };
      return undefined;
    }
    const timeControl = timeControls[0];
    const reactEvidence = collectReactEvidence(timeControl);
    const runtimeController = discoverRuntimeController(timeControl);
    if (runtimeController) {
      discoveryStatus = {
        status: 'ready',
        timeCandidateCount: 1,
        localActionCandidateCount: 0,
        ...reactEvidence
      };
      return {
        timeControl,
        runtimeController,
        strategyId: 'react-studio-controller-v1'
      };
    }
    let container = timeControl.parentElement;
    let depth = 0;
    let nearestActionCandidateCount = 0;
    while (container && container !== document.documentElement && depth < 10) {
      const localControls = Array.from(container.querySelectorAll(controlSelector)).filter(visible);
      const actions = localControls.filter((control) => actionState(control) !== undefined);
      if (nearestActionCandidateCount === 0 && actions.length > 0) {
        nearestActionCandidateCount = actions.length;
      }
      if (actions.length === 1 && corroboratorCount(localControls) >= 2) {
        discoveryStatus = {
          status: 'ready',
          timeCandidateCount: 1,
          localActionCandidateCount: 1,
          ...reactEvidence
        };
        return {
          timeControl,
          actionControl: actions[0],
          strategyId: 'semantic-time-cluster-v1'
        };
      }
      container = container.parentElement;
      depth += 1;
    }
    discoveryStatus = {
      status: 'local-cluster-not-unique',
      timeCandidateCount: 1,
      localActionCandidateCount: nearestActionCandidateCount,
      ...reactEvidence
    };
    return undefined;
  };
  const read = (): {
    readonly projectTimeSeconds: number;
    readonly isPlaying: boolean;
    readonly strategyId: string;
  } | undefined => {
    if (!cached
      || !cached.timeControl.isConnected
      || !visible(cached.timeControl)
      || (cached.actionControl && (
        !cached.actionControl.isConnected || !visible(cached.actionControl)
      ))) cached = discover();
    if (!cached) return undefined;
    const runtimeController = cached.runtimeController
      ? discoverRuntimeController(cached.timeControl)
      : undefined;
    const runtimeSeconds = runtimeController?.getCurrentSeconds();
    const timeText = runtimeController ? undefined : matchingName(cached.timeControl, timePattern);
    const projectTimeSeconds = runtimeController
      ? (Number.isFinite(runtimeSeconds)
        && Number(runtimeSeconds) >= minProjectTimeSeconds
        && Number(runtimeSeconds) <= maxProjectTimeSeconds
        ? Number(runtimeSeconds)
        : undefined)
      : (timeText ? parseTime(timeText) : undefined);
    const isPlaying = runtimeController?.playing
      ?? (cached.actionControl ? actionState(cached.actionControl) : undefined);
    if (projectTimeSeconds === undefined || isPlaying === undefined) return undefined;
    return { projectTimeSeconds, isPlaying, strategyId: cached.strategyId };
  };
  const publish = (): boolean => {
    if (stopped) return false;
    try {
      const value = read();
      const binding = host[bindingName];
      if (!value || typeof binding !== 'function') return false;
      sequence += 1;
      host[sequenceKey] = sequence;
      const payload = JSON.stringify({
        v: 1,
        sequence,
        pageTimestampMs: performance.now(),
        projectTimeSeconds: value.projectTimeSeconds,
        isPlaying: value.isPlaying,
        isScrubbing: scrubbing,
        strategyId: value.strategyId
      });
      (binding as (payload: string) => void)(payload);
      return value.isPlaying;
    } catch {
      // A seek can replace Suno's playback controller during the pointer event.
      // Retain the verified DOM anchor so the next tick can discover its new
      // controller even while the visible negative label is non-standard.
      return false;
    }
  };
  const schedule = (): void => {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    const playing = publish();
    timer = setTimeout(schedule, playing || scrubbing ? 33 : 250);
  };
  const onPointerDown = (): void => {
    scrubbing = true;
    schedule();
  };
  const onPointerUp = (): void => {
    scrubbing = false;
    schedule();
  };
  const onActivity = (): void => schedule();
  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    observer?.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerUp, true);
    document.removeEventListener('click', onActivity, true);
    document.removeEventListener('keydown', onActivity, true);
    window.removeEventListener('pagehide', stop);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('click', onActivity, true);
  document.addEventListener('keydown', onActivity, true);
  window.addEventListener('pagehide', stop, { once: true });
  if (document.body) {
    observer = new MutationObserver(onActivity);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-pressed', 'title', 'hidden']
    });
  }
  host.__sunoVideoSyncTransportProbeV1 = { stop };
  schedule();
  return discoveryStatus;
}

export const TRANSPORT_PROBE_EXPRESSION = `(${bootstrapTransportProbe.toString()})(${[
  JSON.stringify(TRANSPORT_BINDING_NAME),
  String(MIN_PROJECT_TIME_SECONDS),
  String(MAX_PROJECT_TIME_SECONDS)
].join(',')})`;

export async function evaluateTransportProbe(send: TransportProbeCommandSender): Promise<unknown> {
  return send('Runtime.evaluate', {
    expression: TRANSPORT_PROBE_EXPRESSION,
    awaitPromise: false,
    returnByValue: true
  });
}

export async function installTransportProbe(send: TransportProbeCommandSender): Promise<unknown> {
  await send('Runtime.addBinding', { name: TRANSPORT_BINDING_NAME });
  return evaluateTransportProbe(send);
}
