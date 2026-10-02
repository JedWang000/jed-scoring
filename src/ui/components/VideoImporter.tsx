import type { ChangeEvent, DragEvent } from 'react';
import type { LocalVideoMetadata } from '../../shared/types';
import { useI18n } from '../i18n';

export interface VideoImporterProps {
  readonly file?: File;
  readonly metadata?: LocalVideoMetadata;
  readonly onFileSelected: (file: File) => void;
}

export function VideoImporter({
  file,
  metadata,
  onFileSelected
}: VideoImporterProps) {
  const { t } = useI18n();
  const selectFirstFile = (files: FileList | null) => {
    const selected = files && files.length > 0 ? files[0] : undefined;
    if (selected) onFileSelected(selected);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFirstFile(event.currentTarget.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    selectFirstFile(event.dataTransfer.files);
  };

  return (
    <section className="panel-card" aria-labelledby="video-import-title">
      <div className="section-heading">
        <span className="step-number">1</span>
        <h2 id="video-import-title">{t('video.import.title')}</h2>
      </div>
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <label className="primary-button" htmlFor="video-file">{t('video.import.select')}</label>
        <input
          id="video-file"
          className="visually-hidden"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleChange}
        />
        <p>{t('video.import.dropHint')}</p>
      </div>
      {file && (
        <>
          <div className="file-summary" aria-live="polite">
            <strong>{file.name}</strong>
            <span>{t('video.fileSize', { size: (file.size / 1024 / 1024).toFixed(1) })}</span>
          </div>
          {metadata && (
            <p className="metadata-summary">
              {t('video.metadata.summary', {
                width: metadata.width,
                height: metadata.height,
                duration: `${metadata.durationSeconds.toFixed(3)}s`
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
