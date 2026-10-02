import type { BindingWarningReason } from '../../content/binding-monitor';
import { useI18n, type MessageKey } from '../i18n';

export type AppState =
  | 'unconfigured'
  | 'video-ready'
  | 'binding-required'
  | 'sync-ready'
  | 'syncing'
  | 'playback-blocked'
  | 'warning'
  | 'adapter-unavailable'
  | 'file-reauthorization-required';

export type PlaybackErrorCode = 'autoplay-blocked' | 'media-unavailable';

export interface SyncStatusProps {
  readonly state: AppState;
  readonly warningReason?: BindingWarningReason;
  readonly playbackError?: PlaybackErrorCode;
  readonly onRebind: () => void;
  readonly onReselectFile: () => void;
  readonly onResumePlayback: () => void;
  readonly showActions?: boolean;
}

const warningMessageKeys = {
  missing: 'status.warning.missing',
  'identity-ambiguous': 'status.warning.identityAmbiguous',
  warped: 'status.warning.warped',
  'speed-changed': 'status.warning.speedChanged',
  looped: 'status.warning.looped',
  reversed: 'status.warning.reversed',
  'analysis-pending': 'status.warning.analysisPending',
  'unsupported-mapping': 'status.warning.unsupportedMapping'
} satisfies Record<BindingWarningReason, MessageKey>;

const stateMessageKeys = {
  unconfigured: 'status.unconfigured',
  'video-ready': 'status.videoReady',
  'binding-required': 'status.bindingRequired',
  'sync-ready': 'status.ready',
  syncing: 'status.syncing',
  'adapter-unavailable': 'status.adapterUnavailable'
} satisfies Record<
  Exclude<AppState, 'warning' | 'file-reauthorization-required' | 'playback-blocked'>,
  MessageKey
>;

const playbackErrorMessageKeys = {
  'autoplay-blocked': 'status.playbackBlocked',
  'media-unavailable': 'status.playbackUnavailable'
} satisfies Record<PlaybackErrorCode, MessageKey>;

export function SyncStatus({
  state,
  warningReason,
  playbackError,
  onRebind,
  onReselectFile,
  onResumePlayback,
  showActions = true
}: SyncStatusProps) {
  const { t } = useI18n();

  if (state === 'file-reauthorization-required') {
    return (
      <div className="status-banner status-warning" role="alert">
        <span>{t('status.fileReauthorization')}</span>
        {showActions && (
          <button type="button" onClick={onReselectFile}>{t('action.reselect')}</button>
        )}
      </div>
    );
  }

  if (state === 'playback-blocked') {
    return (
      <div className="status-banner status-warning" role="alert">
        <span>{t(playbackErrorMessageKeys[playbackError ?? 'autoplay-blocked'])}</span>
        {showActions && (
          <button type="button" onClick={onResumePlayback}>{t('action.resume')}</button>
        )}
      </div>
    );
  }

  if (state === 'warning') {
    return (
      <div className="status-banner status-warning" role="alert">
        <span>{t(warningReason ? warningMessageKeys[warningReason] : 'status.warningDefault')}</span>
        {showActions && (
          <button type="button" onClick={onRebind}>{t('action.rebind')}</button>
        )}
      </div>
    );
  }

  return (
    <div className={`status-banner status-${state}`} role="status" aria-live="polite">
      <span>{t(stateMessageKeys[state])}</span>
    </div>
  );
}
