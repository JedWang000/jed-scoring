import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../../src/sync/sync-engine';

const engine = () => new SyncEngine({
  smallErrorSeconds: 0.02,
  largeErrorSeconds: 0.15
});

describe('SyncEngine', () => {
  it('pauses when the Suno transport is not playing', () => {
    expect(engine().tick({
      isPlaying: false,
      targetSeconds: 4,
      actualSeconds: 4
    })).toEqual({ kind: 'pause' });
  });

  it('does nothing inside the small-error window', () => {
    expect(engine().tick({
      isPlaying: true,
      targetSeconds: 4,
      actualSeconds: 4.02
    })).toEqual({ kind: 'none' });
  });

  it('seeks for a large drift', () => {
    expect(engine().tick({
      isPlaying: true,
      targetSeconds: 4,
      actualSeconds: 3.5
    })).toEqual({ kind: 'seek', seconds: 4 });
  });

  it('speeds up slightly when video is behind', () => {
    expect(engine().tick({
      isPlaying: true,
      targetSeconds: 4,
      actualSeconds: 3.9
    })).toEqual({ kind: 'rate', playbackRate: 1.02 });
  });

  it('slows down slightly when video is ahead', () => {
    expect(engine().tick({
      isPlaying: true,
      targetSeconds: 4,
      actualSeconds: 4.1
    })).toEqual({ kind: 'rate', playbackRate: 0.98 });
  });

  it('seeks at the exact large-error boundary', () => {
    expect(engine().tick({
      isPlaying: true,
      targetSeconds: 4,
      actualSeconds: 4.15
    })).toEqual({ kind: 'seek', seconds: 4 });
  });

  it('reports alignment using the small-error window', () => {
    expect(engine().isAligned(4, 4.02)).toBe(true);
    expect(engine().isAligned(4, 4.021)).toBe(false);
  });
});
