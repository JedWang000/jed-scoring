import {
  isBindableSunoClip,
  type SunoClip
} from '../../content/suno-adapter';
import type { BindingEligibility, ProjectBridgeStatus } from '../../content/project-state';
import { useI18n, type MessageKey } from '../i18n';

export interface BindingPickerProps {
  readonly clips: readonly SunoClip[];
  readonly bridgeStatus: ProjectBridgeStatus;
  readonly selectedClipId?: string;
  readonly confirmedClipId?: string;
  readonly onSelect: (clipId: string) => void;
  readonly onConfirm: () => void;
}

const emptyMessageKeys = {
  'waiting-for-project-state': 'binding.empty.waitingProject',
  ready: 'binding.empty.ready',
  'unsupported-project-shape': 'binding.empty.unsupportedProject',
  'unsupported-timing': 'binding.empty.unsupportedTiming',
  'too-many-clips': 'binding.empty.tooManyClips',
  'parse-failed': 'binding.empty.parseFailed'
} satisfies Record<ProjectBridgeStatus, MessageKey>;

const eligibilityMessageKeys = {
  warped: 'binding.eligibility.warped',
  'speed-changed': 'binding.eligibility.speedChanged',
  looped: 'binding.eligibility.looped',
  reversed: 'binding.eligibility.reversed',
  'analysis-pending': 'binding.eligibility.analysisPending',
  'unsupported-mapping': 'binding.eligibility.unsupportedMapping'
} satisfies Record<Exclude<BindingEligibility, 'ready'>, MessageKey>;

export function BindingPicker({
  clips,
  bridgeStatus,
  selectedClipId,
  confirmedClipId,
  onSelect,
  onConfirm
}: BindingPickerProps) {
  const { t } = useI18n();
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  const canConfirm = Boolean(selectedClip && isBindableSunoClip(selectedClip));

  return (
    <section className="panel-card" aria-labelledby="binding-title">
      <div className="section-heading">
        <span className="step-number">3</span>
        <h2 id="binding-title">{t('binding.title')}</h2>
      </div>
      {clips.length === 0 ? (
        <p className="empty-state">
          {t(emptyMessageKeys[bridgeStatus])}
        </p>
      ) : (
        <fieldset className="clip-list">
          <legend className="visually-hidden">{t('binding.selectLegend')}</legend>
          {clips.map((clip) => (
            <label className="clip-option" key={clip.id}>
              <input
                type="radio"
                name="reference-clip"
                value={clip.id}
                checked={selectedClipId === clip.id}
                disabled={!isBindableSunoClip(clip)}
                onChange={() => {
                  if (isBindableSunoClip(clip)) onSelect(clip.id);
                }}
              />
              <span>
                <strong>{clip.label}</strong>
                <small>{t('binding.clipSummary', {
                  start: `${clip.startSeconds.toFixed(3)}s`,
                  duration: `${clip.durationSeconds.toFixed(3)}s`
                })}</small>
                {clip.bindingEligibility !== 'ready' && (
                  <small>{t(eligibilityMessageKeys[clip.bindingEligibility])}</small>
                )}
              </span>
              {confirmedClipId === clip.id && <em>{t('binding.confirmed')}</em>}
            </label>
          ))}
        </fieldset>
      )}
      <button
        className="secondary-button"
        type="button"
        disabled={!canConfirm}
        onClick={onConfirm}
      >
        {t('binding.confirm')}
      </button>
    </section>
  );
}
