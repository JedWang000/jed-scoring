// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readVideoMetadata, type VideoMetadataEnvironment } from '../../src/media/video-metadata';
import { VideoController } from '../../src/sync/video-controller';

function videoElement(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    currentTime: 0,
    duration: 10,
    playbackRate: 1,
    muted: false,
    paused: true,
    seeking: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

function metadataHarness() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'load', { value: vi.fn() });
  const revokeObjectURL = vi.fn();
  const environment: VideoMetadataEnvironment = {
    createVideoElement: () => video,
    createObjectURL: vi.fn(() => 'blob:local-video'),
    revokeObjectURL
  };
  return { environment, revokeObjectURL, video };
}

describe('VideoController', () => {
  it('clamps seek to the configured video range', () => {
    const element = videoElement();

    new VideoController(element).seek(30);

    expect(element.currentTime).toBe(10);
  });

  it('clamps negative seeks to zero', () => {
    const element = videoElement();

    new VideoController(element).seek(-3);

    expect(element.currentTime).toBe(0);
  });

  it('delegates playback, pause, rate, and current time', async () => {
    const element = videoElement({ currentTime: 4 });
    const controller = new VideoController(element);

    await controller.play();
    controller.pause();
    controller.setRate(1.01);
    controller.setMuted(true);

    expect(element.play).toHaveBeenCalledOnce();
    expect(element.pause).toHaveBeenCalledOnce();
    expect(element.playbackRate).toBe(1.01);
    expect(controller.currentTime()).toBe(4);
    expect(element.muted).toBe(true);
    expect(controller.isMuted()).toBe(true);
  });

  it('reports sanitized duration and native playback state', () => {
    const controller = new VideoController(videoElement({
      duration: 12,
      paused: false,
      seeking: true
    }));

    expect(controller.duration()).toBe(12);
    expect(controller.isPaused()).toBe(false);
    expect(controller.isSeeking()).toBe(true);
  });

  it('reports zero for an unavailable duration', () => {
    expect(new VideoController(videoElement({ duration: Number.NaN })).duration())
      .toBe(0);
  });
});

describe('readVideoMetadata', () => {
  it('reads local metadata and revokes the object URL', async () => {
    const { environment, revokeObjectURL, video } = metadataHarness();
    const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' });
    const resultPromise = readVideoMetadata(file, environment);
    Object.defineProperties(video, {
      duration: { value: 12.5 },
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 }
    });

    video.dispatchEvent(new Event('loadedmetadata'));

    await expect(resultPromise).resolves.toEqual({
      kind: 'ready',
      metadata: { durationSeconds: 12.5, width: 1920, height: 1080 }
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-video');
  });

  it('returns codec guidance and revokes the object URL on failure', async () => {
    const { environment, revokeObjectURL, video } = metadataHarness();
    const file = new File(['video'], 'sample.mov', { type: 'video/quicktime' });
    const resultPromise = readVideoMetadata(file, environment);

    video.dispatchEvent(new Event('error'));

    await expect(resultPromise).resolves.toEqual({
      kind: 'unsupported-codec',
      guidance: '请转换为 MP4/H.264 或 WebM 后重试。'
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-video');
  });
});
