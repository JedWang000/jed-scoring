import type { ReferenceTrackBinding } from '../../shared/types';
import { formatTimecode } from '../format';
import { useI18n } from '../i18n';

export interface TimeMappingProps {
  readonly binding?: ReferenceTrackBinding;
  readonly offsetMs: number;
  readonly locked: boolean;
}

export function TimeMapping({ binding, offsetMs, locked }: TimeMappingProps) {
  const { t } = useI18n();

  return (
    <section className="time-mapping" aria-labelledby="time-mapping-title">
      <div className="section-heading">
        <h2 id="time-mapping-title">{t('mapping.title')}</h2>
      </div>
      <dl className="mapping-grid">
        <div>
          <dt>{t('mapping.videoStart')}</dt>
          <dd className="numeric">{formatTimecode(0)}</dd>
        </div>
        <div>
          <dt>{t('mapping.studioPosition')}</dt>
          <dd className="numeric">
            {binding ? formatTimecode(binding.clipStartSeconds) : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('mapping.offset')}</dt>
          <dd className="numeric">
            {t('offset.milliseconds', { amount: offsetMs.toFixed(3) })}
          </dd>
        </div>
        <div>
          <dt>{t('mapping.lockState')}</dt>
          <dd className={locked ? 'mapping-lock mapping-lock--locked' : 'mapping-lock'}>
            {t(locked ? 'mapping.locked' : 'mapping.unlocked')}
          </dd>
        </div>
      </dl>
      {!binding && <p className="mapping-unavailable">{t('mapping.unavailable')}</p>}
    </section>
  );
}
