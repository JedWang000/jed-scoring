// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalVideoViewer } from '../../src/ui/components/LocalVideoViewer';
import type { Locale } from '../../src/ui/i18n';
import { renderWithLocale } from '../helpers/render-with-locale';

const localeMatrix = [
  {
    locale: 'zh-CN' as const,
    windowLabel: '本地视频视窗',
    previewLabel: '本地视频预览',
    mute: '静音本地视频',
    open: '弹出视频画面',
    unsupported: '当前浏览器不支持视频画中画。请继续在侧边栏观看。'
  },
  {
    locale: 'zh-TW' as const,
    windowLabel: '本機影片視窗',
    previewLabel: '本機影片預覽',
    mute: '將本機影片靜音',
    open: '彈出影片畫面',
    unsupported: '目前的瀏覽器不支援影片子母畫面。請繼續在側邊欄觀看。'
  },
  {
    locale: 'en' as const,
    windowLabel: 'Local video window',
    previewLabel: 'Local video preview',
    mute: 'Mute local video',
    open: 'Pop out video',
    unsupported: 'This browser does not support video picture-in-picture. Keep watching in the side panel.'
  }
] as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (document as Document & { pictureInPictureElement?: Element }).pictureInPictureElement;
  delete (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;
  delete (document as Document & {
    exitPictureInPicture?: () => Promise<void>;
  }).exitPictureInPicture;
});

function renderViewer(previewURL = 'blob:local-video', locale: Locale = 'zh-CN') {
  const videoRef = createRef<HTMLVideoElement>();
  const result = renderWithLocale(
    <LocalVideoViewer previewURL={previewURL} videoRef={videoRef} />,
    locale
  );
  const video = result.container.querySelector('video');
  if (!video) throw new Error('LocalVideoViewer did not render a video element.');
  return {
    ...result,
    video,
    videoRef
  };
}

describe('LocalVideoViewer', () => {
  it.each(localeMatrix)(
    'localizes window/preview ARIA labels, primary actions, and unsupported recovery in $locale',
    async ({ locale, windowLabel, previewLabel, mute, open, unsupported }) => {
      const { video } = renderViewer('blob:local-video', locale);

      expect(screen.getByLabelText(windowLabel)).toBeInTheDocument();
      expect(video).toHaveAccessibleName(previewLabel);
      expect(screen.getByRole('button', { name: mute })).toBeEnabled();
      Object.defineProperty(document, 'pictureInPictureEnabled', {
        configurable: true,
        value: false
      });
      fireEvent.click(screen.getByRole('button', { name: open }));

      expect(await screen.findByRole('alert')).toHaveTextContent(unsupported);
      expect(screen.getByRole('button', { name: open })).toBeEnabled();
    }
  );

  it('starts with local video audio enabled and toggles mute', () => {
    const { video } = renderViewer();
    expect(video.muted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '静音本地视频' }));
    expect(video.muted).toBe(true);
    expect(screen.getByRole('button', { name: '恢复本地视频声音' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '恢复本地视频声音' }));
    expect(video.muted).toBe(false);
  });

  it('tracks mute changes made through the native video controls', () => {
    const { video } = renderViewer();

    video.muted = true;
    fireEvent.volumeChange(video);
    expect(screen.getByRole('button', { name: '恢复本地视频声音' })).toBeEnabled();

    video.muted = false;
    fireEvent.volumeChange(video);
    expect(screen.getByRole('button', { name: '静音本地视频' })).toBeEnabled();
  });

  it('uses the same element in picture-in-picture and preserves media state', async () => {
    const { video, videoRef, container } = renderViewer();
    video.currentTime = 7.5;
    video.playbackRate = 1.02;
    const play = vi.spyOn(video, 'play');
    const pause = vi.spyOn(video, 'pause');
    const requestPictureInPicture = vi.fn().mockResolvedValue({});
    Object.defineProperty(video, 'requestPictureInPicture', {
      configurable: true,
      value: requestPictureInPicture
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true
    });

    fireEvent.click(screen.getByRole('button', { name: '弹出视频画面' }));

    expect(await screen.findByRole('button', { name: '视频已弹出，点击收回' })).toBeEnabled();
    expect(requestPictureInPicture).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(videoRef.current).toBe(video);
    expect(video.currentTime).toBe(7.5);
    expect(video.playbackRate).toBe(1.02);
    expect(video.muted).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();

    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get: () => video
    });
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: vi.fn(async () => {
        video.dispatchEvent(new Event('leavepictureinpicture'));
      })
    });
    fireEvent.click(screen.getByRole('button', { name: '视频已弹出，点击收回' }));
    expect(await screen.findByRole('button', { name: '弹出视频画面' })).toBeEnabled();
    expect(video.currentTime).toBe(7.5);
    expect(video.playbackRate).toBe(1.02);
    expect(video.muted).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('follows picture-in-picture entered through the browser', async () => {
    const { video } = renderViewer();

    fireEvent(video, new Event('enterpictureinpicture'));

    expect(await screen.findByRole('button', { name: '视频已弹出，点击收回' })).toBeEnabled();
  });

  it('returns to docked state when the browser closes picture-in-picture', async () => {
    const { video } = renderViewer();
    Object.defineProperty(video, 'requestPictureInPicture', {
      configurable: true,
      value: vi.fn().mockResolvedValue({})
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true
    });
    fireEvent.click(screen.getByRole('button', { name: '弹出视频画面' }));
    await screen.findByRole('button', { name: '视频已弹出，点击收回' });

    fireEvent(video, new Event('leavepictureinpicture'));

    expect(await screen.findByRole('button', { name: '弹出视频画面' })).toBeEnabled();
  });

  it('keeps the video docked and reports a rejected PiP request', async () => {
    const { video } = renderViewer();
    Object.defineProperty(video, 'requestPictureInPicture', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true
    });

    fireEvent.click(screen.getByRole('button', { name: '弹出视频画面' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法弹出视频');
    expect(screen.getByRole('button', { name: '弹出视频画面' })).toBeEnabled();
  });

  it('exits active picture-in-picture when the preview URL changes', async () => {
    const { video, videoRef, rerender } = renderViewer();
    const exitPictureInPicture = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get: () => video
    });
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: exitPictureInPicture
    });

    rerender(<LocalVideoViewer previewURL="blob:replacement-video" videoRef={videoRef} />);

    await waitFor(() => expect(exitPictureInPicture).toHaveBeenCalledOnce());
    expect(videoRef.current).toBe(video);
    expect(video).toHaveAttribute('src', 'blob:replacement-video');
  });

  it('exits picture-in-picture when a stale request resolves after the preview changes', async () => {
    const { video, videoRef, rerender } = renderViewer();
    let resolveRequest!: (window: PictureInPictureWindow) => void;
    const pendingRequest = new Promise<PictureInPictureWindow>((resolve) => {
      resolveRequest = resolve;
    });
    let activePictureInPictureElement: Element | undefined;
    const exitPictureInPicture = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'requestPictureInPicture', {
      configurable: true,
      value: vi.fn(() => pendingRequest)
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true
    });
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get: () => activePictureInPictureElement
    });
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: exitPictureInPicture
    });

    fireEvent.click(screen.getByRole('button', { name: '弹出视频画面' }));
    rerender(<LocalVideoViewer previewURL="blob:replacement-video" videoRef={videoRef} />);
    activePictureInPictureElement = video;
    await act(async () => {
      resolveRequest({} as PictureInPictureWindow);
      await pendingRequest;
    });

    expect(exitPictureInPicture).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '视频已弹出，点击收回' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '弹出视频画面' })).toBeEnabled();
  });

  it('exits active picture-in-picture during unmount cleanup', async () => {
    const { video } = renderViewer();
    const exitPictureInPicture = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get: () => video
    });
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: exitPictureInPicture
    });

    cleanup();
    await waitFor(() => expect(exitPictureInPicture).toHaveBeenCalledOnce());
  });
});
