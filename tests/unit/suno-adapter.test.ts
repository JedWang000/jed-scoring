// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { SunoBridgeState } from '../../src/content/project-state';
import { SunoAdapter } from '../../src/content/suno-adapter';

const PLAY_ICON = 'M6 18.705V5.294';
const PAUSE_ICON = 'M4 6.667a2.667';
const REWIND_ICON = 'M22 16.83V7.17';
const FORWARD_ICON = 'M2 16.427V7.573';
const LOOP_ICON = 'M2 11q0-2.925';

const candidate = {
  id: 'clip-1',
  label: 'Reference audio',
  startSeconds: 12,
  durationSeconds: 43,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  bindingEligibility: 'ready' as const
};

function readyState(clips = [candidate]): SunoBridgeState {
  return {
    status: 'ready',
    observedAtMs: 10,
    clips,
    loop: { startSeconds: 4, endSeconds: 20, enabled: false }
  };
}

function transportMarkup(time: string, playbackIcon: string): string {
  return `
    <section class="volatile-suno-class">
      <button>4/4</button>
      <button>60 BPM</button>
      <button><svg><path d="${REWIND_ICON} rest"></path></svg></button>
      <button><svg><path d="${playbackIcon} rest"></path></svg></button>
      <button><svg><path d="${FORWARD_ICON} rest"></path></svg></button>
      <button><svg><path d="${LOOP_ICON} rest"></path></svg></button>
      <button>${time}</button>
      <button>013.1.1</button>
    </section>
  `;
}

describe('SunoAdapter', () => {
  it('reports degraded waiting state instead of a false healthy empty project', async () => {
    document.body.innerHTML = transportMarkup('00:48.830', PLAY_ICON);

    expect(await new SunoAdapter(document).readSnapshot()).toMatchObject({
      health: 'degraded',
      bridgeStatus: 'waiting-for-project-state',
      projectTimeSeconds: 48.83,
      isPlaying: false,
      clips: [],
      reason: 'Suno project state has not been observed. Reload the Studio page.'
    });
  });

  it('merges the DOM transport with a ready project bridge', async () => {
    document.body.innerHTML = transportMarkup('00:48.830', PLAY_ICON);
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState());

    expect(await adapter.readSnapshot()).toEqual({
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: 48.83,
      isPlaying: false,
      loop: { startSeconds: 4, endSeconds: 20, enabled: false },
      clips: [candidate],
      observedAtMs: 10
    });
  });

  it('recognizes the official pause icon as actively playing', async () => {
    document.body.innerHTML = transportMarkup('01:02:03.456', PAUSE_ICON);
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState());

    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'healthy',
      projectTimeSeconds: 3723.456,
      isPlaying: true
    });
  });

  it('keeps a valid empty project distinct from bridge failure', async () => {
    document.body.innerHTML = transportMarkup('00:00.000', PLAY_ICON);
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState([]));

    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'healthy',
      bridgeStatus: 'ready',
      clips: []
    });
  });

  it('propagates a fixed unsupported status as degraded health', async () => {
    document.body.innerHTML = transportMarkup('00:00.000', PLAY_ICON);
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState({ status: 'unsupported-timing', observedAtMs: 11 });

    expect(await adapter.readSnapshot()).toEqual({
      health: 'degraded',
      bridgeStatus: 'unsupported-timing',
      projectTimeSeconds: 0,
      isPlaying: false,
      clips: [],
      observedAtMs: 11,
      reason: 'This Suno project timing mode is not supported safely.'
    });
  });

  it('invalidates a project snapshot after SPA path navigation', async () => {
    document.body.innerHTML = transportMarkup('00:00.000', PLAY_ICON);
    let pageIdentity = 'https://suno.com/studio/project-1';
    const adapter = new SunoAdapter(document, () => pageIdentity);
    adapter.observeBridgeState(readyState());
    expect((await adapter.readSnapshot()).health).toBe('healthy');

    pageIdentity = 'https://suno.com/studio/project-2';
    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'degraded',
      bridgeStatus: 'waiting-for-project-state',
      clips: []
    });

    adapter.observeBridgeState(readyState([{ ...candidate, id: 'clip-2' }]));
    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'healthy',
      clips: [{ id: 'clip-2' }]
    });
  });

  it('fails closed when a time-shaped label lacks the transport signature', async () => {
    document.body.innerHTML = '<button>00:48.830</button>';
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState());

    const snapshot = await adapter.readSnapshot();
    expect(snapshot).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      reason: 'Suno Studio transport could not be identified reliably.'
    });
    expect(snapshot).not.toHaveProperty('projectTimeSeconds');
    expect(snapshot).not.toHaveProperty('isPlaying');
  });

  it('preserves observed project clips when only the transport is unavailable', async () => {
    document.body.innerHTML = '<button>00:48.830</button>';
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState());

    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'unavailable',
      bridgeStatus: 'ready',
      clips: [candidate],
      loop: { startSeconds: 4, endSeconds: 20, enabled: false },
      reason: 'Suno Studio transport could not be identified reliably.'
    });
  });

  it('fails closed when more than one complete transport signature exists', async () => {
    document.body.innerHTML = [
      transportMarkup('00:12.000', PLAY_ICON),
      transportMarkup('00:48.830', PLAY_ICON)
    ].join('');
    const adapter = new SunoAdapter(document);
    adapter.observeBridgeState(readyState());

    expect(await adapter.readSnapshot()).toMatchObject({
      health: 'unavailable',
      reason: 'Suno Studio transport could not be identified reliably.'
    });
  });
});
