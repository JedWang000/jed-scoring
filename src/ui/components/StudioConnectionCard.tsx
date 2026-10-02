import { useState } from 'react';
import type { ProjectBridgeStatus } from '../../content/project-state';
import { useI18n, type MessageKey } from '../i18n';

export interface StudioConnectionCardProps {
  readonly bridgeStatus: ProjectBridgeStatus;
  readonly reason?: string;
  readonly onConnect: () => Promise<void>;
  readonly onReload: () => Promise<void>;
  readonly onCopyDiagnostics: () => Promise<boolean>;
  readonly confirmReload?: (message: string) => boolean;
}

const reasonMessageKeys = {
  'No active Suno Studio tab is available.': 'studio.connection.notConnected',
  'Active browser tab could not be queried.': 'studio.connection.tabQueryFailed',
  'The Studio debugging target is already in use.': 'studio.connection.debuggerBusy',
  'Connected to Studio; waiting for project state.': 'studio.connection.waitingProject',
  'Studio transport has not been observed.': 'studio.connection.transportPending'
} satisfies Record<string, MessageKey>;

const bridgeStatusMessageKeys = {
  'waiting-for-project-state': 'studio.connection.notReady',
  ready: 'studio.connection.ready',
  'unsupported-project-shape': 'studio.connection.notReady',
  'unsupported-timing': 'studio.connection.notReady',
  'too-many-clips': 'studio.connection.notReady',
  'parse-failed': 'studio.connection.notReady'
} satisfies Record<ProjectBridgeStatus, MessageKey>;

interface OperationState {
  readonly key: MessageKey;
  readonly role: 'status' | 'alert';
}

function statusMessageKey(bridgeStatus: ProjectBridgeStatus, reason?: string): MessageKey {
  if (bridgeStatus === 'ready') return bridgeStatusMessageKeys.ready;
  if (reason) {
    const reasonKey = reasonMessageKeys[reason as keyof typeof reasonMessageKeys];
    if (reasonKey) return reasonKey;
    return 'studio.connection.projectReadFailed';
  }
  return bridgeStatusMessageKeys[bridgeStatus];
}

export function StudioConnectionCard({
  bridgeStatus,
  reason,
  onConnect,
  onReload,
  onCopyDiagnostics,
  confirmReload = (message) => window.confirm(message)
}: StudioConnectionCardProps) {
  const { t } = useI18n();
  const [operation, setOperation] = useState<OperationState>();
  const showReload = bridgeStatus === 'waiting-for-project-state'
    && reason === 'Connected to Studio; waiting for project state.';

  const connect = () => {
    setOperation(undefined);
    void onConnect().catch(() => setOperation({
      key: 'studio.connection.failed',
      role: 'alert'
    }));
  };

  const reload = () => {
    if (!confirmReload(t('studio.connection.reloadWarning'))) return;
    setOperation(undefined);
    void onReload().catch(() => setOperation({
      key: 'studio.reload.failed',
      role: 'alert'
    }));
  };

  const copyDiagnostics = () => {
    setOperation(undefined);
    void onCopyDiagnostics()
      .then((copied) => setOperation({
        key: copied ? 'studio.diagnostics.copied' : 'studio.diagnostics.copyFailed',
        role: copied ? 'status' : 'alert'
      }))
      .catch(() => setOperation({
        key: 'studio.diagnostics.copyFailed',
        role: 'alert'
      }));
  };

  return (
    <section className="panel-card studio-connection-card" aria-labelledby="studio-connection-title">
      <div className="section-heading">
        <h2 id="studio-connection-title">{t('studio.connection.title')}</h2>
      </div>
      <p className="connection-state">{t(statusMessageKey(bridgeStatus, reason))}</p>
      <div className="connection-actions">
        <button type="button" onClick={connect}>{t('studio.connection.connect')}</button>
        {showReload && (
          <button type="button" onClick={reload}>{t('studio.connection.reload')}</button>
        )}
        <button type="button" onClick={copyDiagnostics}>{t('studio.diagnostics.copy')}</button>
      </div>
      {operation && (
        <p className="connection-operation" role={operation.role}>{t(operation.key)}</p>
      )}
    </section>
  );
}
