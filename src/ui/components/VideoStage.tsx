import type { RefObject } from 'react';
import { formatTimecode } from '../format';
import { useI18n } from '../i18n';
import { LocalVideoViewer } from './LocalVideoViewer';

export interface VideoStageProps {
  readonly previewURL?: string;
  readonly videoRef: RefObject<HTMLVideoElement>;
  readonly studioTimeSeconds?: number;
}

export function VideoStage({
  previewURL,
  videoRef,
  studioTimeSeconds
}: VideoStageProps) {
  const { t } = useI18n();

  return (
    <section className="video-stage" aria-label={t('video.stageLabel')}>
      {previewURL && (
        <LocalVideoViewer previewURL={previewURL} videoRef={videoRef} />
      )}
      <div className="master-clock-summary">
        <p className="master-clock-statement">{t('video.masterClock')}</p>
        {studioTimeSeconds !== undefined && (
          <p className="studio-time-summary">
            <span>{t('video.studioObservedTime')}</span>
            <span className="numeric">{formatTimecode(studioTimeSeconds)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
