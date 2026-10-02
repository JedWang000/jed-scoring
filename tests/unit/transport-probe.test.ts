// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSPORT_PROBE_EXPRESSION,
  installTransportProbe
} from '../../src/background/transport-probe';
import { TRANSPORT_BINDING_NAME } from '../../src/background/transport-protocol';

declare global {
  var __sunoVideoSyncTransportV1: ((payload: string) => void) | undefined;
  var __sunoVideoSyncTransportProbeV1: { stop(): void } | undefined;
  var __sunoVideoSyncTransportSequenceV1: number | undefined;
}

function transportMarkup(time = '00:12.500', action = 'Play'): string {
  return `
    <section aria-label="Studio transport">
      <button aria-label="4 / 4">4 / 4</button>
      <button aria-label="120 BPM">120 BPM</button>
      <button aria-label="Go to start">Start</button>
      <button aria-label="${action}"></button>
      <button aria-label="Loop">Loop</button>
      <button aria-label="${time}">${time}</button>
    </section>
  `;
}

function attachReactPlaybackControllers(
  element: Element,
  controllers: readonly Array<{
    readonly playing: boolean;
    readonly getCurrentSeconds: () => number;
  }>
): void {
  const rootFiber: Record<string, unknown> = {
    return: null,
    stateNode: undefined
  };
  rootFiber.stateNode = { current: rootFiber };
  let parent: Record<string, unknown> = rootFiber;
  for (const playbackController of controllers) {
    parent = {
      return: parent,
      memoizedProps: {
        value: {
          [Symbol('context-value')]: {
            current: { playbackController }
          }
        }
      }
    };
  }
  Object.defineProperty(element, '__reactFiber$studio', {
    configurable: true,
    value: { return: parent }
  });
}

describe('transport probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      top: 0,
      right: 100,
      bottom: 24,
      left: 0,
      toJSON: () => ({})
    });
  });

  afterEach(() => {
    globalThis.__sunoVideoSyncTransportProbeV1?.stop();
    delete globalThis.__sunoVideoSyncTransportProbeV1;
    delete globalThis.__sunoVideoSyncTransportSequenceV1;
    delete globalThis.__sunoVideoSyncTransportV1;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('installs one Runtime binding and a self-contained semantic probe', async () => {
    const send = vi.fn(async () => ({}));

    await installTransportProbe(send);

    expect(send).toHaveBeenNthCalledWith(1, 'Runtime.addBinding', {
      name: TRANSPORT_BINDING_NAME
    });
    expect(send).toHaveBeenNthCalledWith(2, 'Runtime.evaluate', expect.objectContaining({
      awaitPromise: false,
      returnByValue: true
    }));
    const expression = String(vi.mocked(send).mock.calls[1][1]?.expression);
    expect(expression).not.toMatch(/import\(|chrome\.|#[A-Za-z0-9_-]+|path\[d\]|getAttribute\(['"]d['"]\)/);
    expect(expression).toContain('semantic-time-cluster-v1');
  });

  it('reports the unique local semantic transport cluster despite unrelated global play controls', () => {
    document.body.innerHTML = `${transportMarkup()}${Array.from({ length: 12 }, (_, index) => (
      `<button aria-label="Play preview ${index}">Preview</button>`
    )).join('')}`;
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({
      status: 'ready',
      timeCandidateCount: 1,
      localActionCandidateCount: 1
    });
    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      v: 1,
      sequence: 1,
      projectTimeSeconds: 12.5,
      isPlaying: false,
      strategyId: 'semantic-time-cluster-v1'
    });
  });

  it('keeps transport sequence increasing when the probe is reinstalled on the same page', () => {
    document.body.innerHTML = transportMarkup();
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);
    const first = JSON.parse(String(binding.mock.calls.at(-1)?.[0])) as {
      sequence: number;
      pageTimestampMs: number;
    };

    (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);
    const second = JSON.parse(String(binding.mock.calls.at(-1)?.[0])) as {
      sequence: number;
      pageTimestampMs: number;
    };

    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(second.pageTimestampMs).toBeGreaterThanOrEqual(first.pageTimestampMs);
  });

  it('reads the unique Studio playback controller when the transport action is icon-only', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button aria-label="4 / 4">4 / 4</button>
        <button aria-label="120 BPM">120 BPM</button>
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const playbackController = {
      playing: true,
      getCurrentSeconds: vi.fn(() => 42.25)
    };
    attachReactPlaybackControllers(timeControl, [playbackController]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({
      status: 'ready',
      timeCandidateCount: 1,
      localActionCandidateCount: 0
    });
    expect(playbackController.getCurrentSeconds).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: 42.25,
      isPlaying: true,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('publishes bounded negative time from the Studio playback controller', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button aria-label="4 / 4">4 / 4</button>
        <button aria-label="120 BPM">120 BPM</button>
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="-00:00.750">-00:00.750</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="-00:00.750"]') as HTMLElement;
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds: () => -0.75
    }]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(600);

    expect(result).toMatchObject({ status: 'ready', timeCandidateCount: 1 });
    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls.at(-1)?.[0]))).toMatchObject({
      projectTimeSeconds: -0.75,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('discovers the Studio playback controller from its real negative pre-roll label', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button aria-label="4 / 4">4 / 4</button>
        <button aria-label="120 BPM">120 BPM</button>
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="-01:-08.000">-01:-08.000</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="-01:-08.000"]') as HTMLElement;
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds: () => -8
    }]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({ status: 'ready', timeCandidateCount: 1 });
    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: -8,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('discovers the Studio playback controller when every negative time component is signed', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button aria-label="4 / 4">4 / 4</button>
        <button aria-label="120 BPM">120 BPM</button>
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="-01:-05.-605">-01:-05.-605</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="-01:-05.-605"]') as HTMLElement;
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds: () => -5.605
    }]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({ status: 'ready', timeCandidateCount: 1 });
    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: -5.605,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('parses a negative semantic transport label during pre-roll', () => {
    document.body.innerHTML = transportMarkup('-00:00.500');
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({
      status: 'ready',
      timeCandidateCount: 1,
      localActionCandidateCount: 1
    });
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: -0.5,
      isPlaying: false,
      strategyId: 'semantic-time-cluster-v1'
    });
  });

  it('recovers after a transient runtime-controller read failure', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const getCurrentSeconds = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('controller is replacing its audio graph');
      })
      .mockReturnValue(12.75);
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds
    }]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    expect(() => (0, eval)(TRANSPORT_PROBE_EXPRESSION)).not.toThrow();
    expect(binding).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);

    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: 12.75,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('rediscovers a replaced controller while Studio shows its real negative label', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds: () => {
        throw new Error('controller replaced during pre-roll seek');
      }
    }]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    expect(result).toMatchObject({ status: 'ready', timeCandidateCount: 1 });
    expect(binding).not.toHaveBeenCalled();

    timeControl.setAttribute('aria-label', '-01:-08.000');
    timeControl.textContent = '-01:-08.000';
    attachReactPlaybackControllers(timeControl, [{
      playing: false,
      getCurrentSeconds: () => -8
    }]);
    vi.advanceTimersByTime(300);

    expect(binding).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: -8,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('fails closed when more than one Studio playback controller is reachable', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    attachReactPlaybackControllers(timeControl, [
      { playing: false, getCurrentSeconds: () => 12.5 },
      { playing: true, getCurrentSeconds: () => 48 }
    ]);
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1000);

    expect(binding).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'local-cluster-not-unique',
      timeCandidateCount: 1,
      localActionCandidateCount: 0
    });
  });

  it('rejects an unsupported context-slot-direct controller shape', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const rootFiber: Record<string, unknown> = { return: null, stateNode: undefined };
    rootFiber.stateNode = { current: rootFiber };
    const providerFiber = {
      return: rootFiber,
      memoizedProps: {
        value: {
          [Symbol('unsupported-slot')]: {
            playbackController: {
              playing: true,
              getCurrentSeconds: () => 12.5
            }
          }
        }
      }
    };
    Object.defineProperty(timeControl, '__reactFiber$studio', {
      configurable: true,
      value: { return: providerFiber }
    });
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1000);

    expect(binding).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'local-cluster-not-unique' });
  });

  it('reads a Studio playback controller wrapped by use-context-selector', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const rootFiber: Record<string, unknown> = { return: null, stateNode: undefined };
    rootFiber.stateNode = { current: rootFiber };
    const playbackController = {
      playing: true,
      getCurrentSeconds: vi.fn(() => 36.75)
    };
    const providerFiber = {
      return: rootFiber,
      memoizedProps: {
        value: {
          [Symbol('context-value')]: {
            v: {
              current: {
                playbackController
              }
            }
          }
        }
      }
    };
    Object.defineProperty(timeControl, '__reactFiber$studio', {
      configurable: true,
      value: { return: providerFiber }
    });
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({
      status: 'ready',
      reactFiberPropertyCount: 1,
      reactFiberAlternatePresent: false,
      reactCurrentTreeResolved: true,
      reactFiberAncestorCount: 3,
      reactFiberTraversalComplete: true,
      reactProviderValueCount: 1,
      reactOwnerDepth0Count: 0,
      reactOwnerDepth1Count: 0,
      reactOwnerDepth2Count: 0,
      reactOwnerDepth3Count: 1,
      reactOwnerDepth4Count: 0,
      reactEvidenceTruncated: false
    });
    expect(playbackController.getCurrentSeconds).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: 36.75,
      isPlaying: true,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('reads a unique Studio controller beyond the former Fiber depth limit', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const rootFiber: Record<string, unknown> = { return: null, stateNode: undefined };
    rootFiber.stateNode = { current: rootFiber };
    let parent: Record<string, unknown> = rootFiber;
    for (let index = 0; index < 240; index += 1) parent = { return: parent };
    const playbackController = {
      playing: false,
      getCurrentSeconds: vi.fn(() => 84.25)
    };
    const providerFiber = {
      return: parent,
      memoizedProps: {
        value: {
          [Symbol('context-value')]: {
            current: { playbackController }
          }
        }
      }
    };
    Object.defineProperty(timeControl, '__reactFiber$studio', {
      configurable: true,
      value: { return: providerFiber }
    });
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1);

    expect(result).toMatchObject({
      status: 'ready',
      reactCurrentTreeResolved: true,
      reactFiberTraversalComplete: true,
      reactOwnerDepth2Count: 1
    });
    expect(playbackController.getCurrentSeconds).toHaveBeenCalled();
    expect(JSON.parse(String(binding.mock.calls[0][0]))).toMatchObject({
      projectTimeSeconds: 84.25,
      isPlaying: false,
      strategyId: 'react-studio-controller-v1'
    });
  });

  it('fails closed when runtime-controller ancestor discovery is incomplete', () => {
    document.body.innerHTML = `
      <section aria-label="Studio transport">
        <button><svg aria-hidden="true"></svg></button>
        <button aria-label="00:12.500">00:12.500</button>
      </section>
    `;
    const timeControl = document.querySelector('[aria-label="00:12.500"]') as HTMLElement;
    const rootFiber: Record<string, unknown> = { return: null, stateNode: undefined };
    rootFiber.stateNode = { current: rootFiber };
    let parent: Record<string, unknown> = rootFiber;
    for (let index = 0; index < 2050; index += 1) parent = { return: parent };
    parent = {
      return: parent,
      memoizedProps: {
        value: {
          playbackController: {
            playing: true,
            getCurrentSeconds: () => 12.5
          }
        }
      }
    };
    Object.defineProperty(timeControl, '__reactFiber$studio', {
      configurable: true,
      value: { return: parent }
    });
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1000);

    expect(binding).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'local-cluster-not-unique' });
  });

  it('fails closed when two complete transport clusters are visible', () => {
    document.body.innerHTML = `${transportMarkup('00:12.500')}${transportMarkup('00:48.000')}`;
    const binding = vi.fn();
    globalThis.__sunoVideoSyncTransportV1 = binding;

    const result = (0, eval)(TRANSPORT_PROBE_EXPRESSION);
    vi.advanceTimersByTime(1000);

    expect(binding).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'time-candidate-count',
      timeCandidateCount: 2,
      localActionCandidateCount: 0
    });
  });
});
