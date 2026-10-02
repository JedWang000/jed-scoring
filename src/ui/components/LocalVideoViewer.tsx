import { useEffect, useRef, useState, type RefObject } from 'react';
import { useI18n, type MessageKey } from '../i18n';

export interface LocalVideoViewerProps {
  readonly previewURL: string;
  readonly videoRef: RefObject<HTMLVideoElement>;
}

export function LocalVideoViewer({ previewURL, videoRef }: LocalVideoViewerProps) {
  const { t } = useI18n();
  const [muted, setMuted] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [pictureInPictureError, setPictureInPictureError] = useState<MessageKey>();
  const pictureInPictureGeneration = useRef(0);

  useEffect(() => {
    setMuted(false);
    setIsFloating(false);
    setPictureInPictureError(undefined);
  }, [previewURL]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const handleEnter = () => setIsFloating(true);
    const handleLeave = () => setIsFloating(false);
    video.addEventListener('enterpictureinpicture', handleEnter);
    video.addEventListener('leavepictureinpicture', handleLeave);

    return () => {
      pictureInPictureGeneration.current += 1;
      video.removeEventListener('enterpictureinpicture', handleEnter);
      video.removeEventListener('leavepictureinpicture', handleLeave);
      if (document.pictureInPictureElement === video && document.exitPictureInPicture) {
        void document.exitPictureInPicture().catch(() => undefined);
      }
    };
  }, [previewURL, videoRef]);

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const openPictureInPicture = async () => {
    const video = videoRef.current;
    const requestGeneration = pictureInPictureGeneration.current;
    setPictureInPictureError(undefined);
    if (!video || document.pictureInPictureEnabled === false || !video.requestPictureInPicture) {
      setPictureInPictureError('video.pip.unsupported');
      return;
    }
    try {
      await video.requestPictureInPicture();
      if (requestGeneration !== pictureInPictureGeneration.current) {
        if (document.pictureInPictureElement === video && document.exitPictureInPicture) {
          await document.exitPictureInPicture().catch(() => undefined);
        }
        return;
      }
      setIsFloating(true);
    } catch {
      if (requestGeneration === pictureInPictureGeneration.current) {
        setPictureInPictureError('video.pip.openFailed');
      }
    }
  };

  const closePictureInPicture = async () => {
    const video = videoRef.current;
    if (video && document.pictureInPictureElement === video && document.exitPictureInPicture) {
      try {
        await document.exitPictureInPicture();
      } catch {
        setPictureInPictureError('video.pip.closeFailed');
      }
      return;
    }
    setIsFloating(false);
  };

  return (
    <section
      className={isFloating ? 'video-dock video-dock--floating' : 'video-dock'}
      data-testid="video-dock"
      aria-label={t('video.windowLabel')}
    >
      <div className="video-frame">
        <video
          ref={videoRef}
          className="video-preview"
          aria-label={t('video.previewLabel')}
          src={previewURL}
          controls
          muted={muted}
          playsInline
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        />
        {!isFloating && (
          <div className="video-viewer-actions">
            <button type="button" onClick={toggleMuted}>
              {t(muted ? 'video.unmute' : 'video.mute')}
            </button>
            <button type="button" onClick={() => void openPictureInPicture()}>
              {t('video.pip.open')}
            </button>
          </div>
        )}
      </div>
      {isFloating && (
        <button
          className="video-return-banner"
          type="button"
          aria-label={t('video.pip.returnLabel')}
          onClick={() => void closePictureInPicture()}
        >
          {t('video.pip.return')}
        </button>
      )}
      {pictureInPictureError && (
        <p className="inline-error picture-in-picture-error" role="alert">
          {t(pictureInPictureError)}
        </p>
      )}
    </section>
  );
}
