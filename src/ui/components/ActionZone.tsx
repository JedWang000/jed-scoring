import { useI18n, type MessageKey } from '../i18n';
import type { AppState } from './SyncStatus';

export interface ActionZoneProps {
  readonly state: AppState;
  readonly canSync: boolean;
  readonly onStart: () => void;
  readonly onRebind: () => void;
  readonly onReselectFile: () => void;
  readonly onResumePlayback: () => void;
}

interface PrimaryAction {
  readonly labelKey: MessageKey;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly progress?: boolean;
}

export function ActionZone({
  state,
  canSync,
  onStart,
  onRebind,
  onReselectFile
}: ActionZoneProps) {
  const { t } = useI18n();
  let action: PrimaryAction | undefined;

  if (state === 'sync-ready') {
    action = { labelKey: 'action.start', disabled: !canSync, onClick: onStart };
  } else if (state === 'syncing') {
    action = { labelKey: 'action.syncing', disabled: true, progress: true };
  } else if (state === 'file-reauthorization-required') {
    action = { labelKey: 'action.reselect', onClick: onReselectFile };
  } else if (state === 'warning' || state === 'adapter-unavailable') {
    action = { labelKey: 'action.rebind', onClick: onRebind };
  }

  if (!action) return null;
  const showReselect = state === 'sync-ready' || state === 'syncing';

  return (
    <section className="action-zone" data-testid="action-zone" aria-labelledby="action-zone-title">
      <h2 id="action-zone-title" className="visually-hidden">{t('action.title')}</h2>
      <button
        className="sync-button"
        type="button"
        disabled={action.disabled}
        aria-busy={action.progress || undefined}
        onClick={action.onClick}
      >
        {t(action.labelKey)}
      </button>
      {showReselect && (
        <button type="button" onClick={onReselectFile}>{t('action.reselect')}</button>
      )}
      <div className="action-privacy">
        <strong>{t('privacy.short')}</strong>
        <span>{t('privacy.silentWav')}</span>
      </div>
    </section>
  );
}
