import { useEffect, useState, type DragEvent } from 'react';
import { useI18n, type MessageKey } from '../i18n';

export type PreparationErrorCode =
  | 'metadata-read-failed'
  | 'unsupported-codec'
  | 'wav-too-large'
  | 'wav-allocation-failed'
  | 'wav-generation-failed';

export type SilentReferenceState =
  | { readonly kind: 'preparing' }
  | { readonly kind: 'ready'; readonly file: File; readonly durationSeconds: number }
  | { readonly kind: 'failed'; readonly code: PreparationErrorCode };

const preparationErrorMessageKeys = {
  'metadata-read-failed': 'reference.error.metadataReadFailed',
  'unsupported-codec': 'reference.error.unsupportedCodec',
  'wav-too-large': 'reference.error.wavTooLarge',
  'wav-allocation-failed': 'reference.error.wavAllocationFailed',
  'wav-generation-failed': 'reference.error.wavGenerationFailed'
} satisfies Record<PreparationErrorCode, MessageKey>;

export interface SilentReferenceCardProps {
  readonly state: SilentReferenceState;
  readonly onRetry: () => void;
  readonly downloadFile?: (file: File) => void;
  readonly compact?: boolean;
}

export function attachSilentFile(dataTransfer: DataTransfer, file: File): void {
  if (!dataTransfer.items || typeof dataTransfer.items.add !== 'function') {
    throw new DOMException('File drag payload is unavailable.', 'NotSupportedError');
  }
  const addedItem = dataTransfer.items.add(file);
  if (addedItem === null) {
    throw new DOMException('File drag payload was rejected.', 'NotSupportedError');
  }
  dataTransfer.effectAllowed = 'copy';
}

export function triggerFileDownload(file: File): void {
  const objectURL = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = objectURL;
  anchor.download = file.name;
  try {
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 0);
  }
}

export function SilentReferenceCard({
  state,
  onRetry,
  downloadFile = triggerFileDownload,
  compact = false
}: SilentReferenceCardProps) {
  const { t } = useI18n();
  const [dragFailed, setDragFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const readyFile = state.kind === 'ready' ? state.file : null;

  useEffect(() => {
    setDragFailed(false);
    setDownloadFailed(false);
  }, [readyFile]);

  if (state.kind === 'preparing') {
    return (
      <section className="panel-card" aria-labelledby="silent-reference-title">
        <div className="section-heading">
          <span className="step-number">2</span>
          <h2 id="silent-reference-title">{t('reference.title')}</h2>
        </div>
        <p className="empty-state">{t('reference.preparing.label')}</p>
      </section>
    );
  }

  if (state.kind === 'failed') {
    return (
      <section className="panel-card" aria-labelledby="silent-reference-title">
        <div className="section-heading">
          <span className="step-number">2</span>
          <h2 id="silent-reference-title">{t('reference.title')}</h2>
        </div>
        <p className="inline-error" role="alert">
          <span>{t(preparationErrorMessageKeys[state.code])}</span>
        </p>
        <button type="button" onClick={onRetry}>{t('reference.error.retry')}</button>
      </section>
    );
  }

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    try {
      attachSilentFile(event.dataTransfer, state.file);
      setDragFailed(false);
    } catch {
      event.preventDefault();
      setDragFailed(true);
    }
  };

  const handleDownload = () => {
    try {
      downloadFile(state.file);
      setDownloadFailed(false);
    } catch {
      setDownloadFailed(true);
    }
  };

  const readyHandoff = <>
    <div
      className="silent-reference-file"
      data-testid="silent-reference-file"
      draggable
      onDragStart={handleDragStart}
    >
      <strong>{state.file.name}</strong>
      <span>{t('reference.ready.format', {
        duration: `${state.durationSeconds.toFixed(3)}s`
      })}</span>
      <small>{t('reference.drag.hint')}</small>
    </div>
    <button type="button" onClick={handleDownload}>{t('reference.download.action')}</button>
    {dragFailed && (
      <p className="inline-error" role="alert">
        {t('reference.drag.failed')}
      </p>
    )}
    {downloadFailed && (
      <p className="inline-error" role="alert">
        {t('reference.download.failed')}
      </p>
    )}
  </>;

  if (compact) {
    return (
      <div className="silent-reference-handoff" role="group" aria-label={t('reference.title')}>
        {readyHandoff}
      </div>
    );
  }

  return (
    <section className="panel-card" aria-labelledby="silent-reference-title">
      <div className="section-heading">
        <span className="step-number">2</span>
        <h2 id="silent-reference-title">{t('reference.title')}</h2>
      </div>
      {readyHandoff}
    </section>
  );
}
