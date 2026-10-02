import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useI18n, type MessageKey } from '../i18n';

export interface OffsetControlProps {
  readonly canResync: boolean;
  readonly offsetMs: number;
  readonly onOffsetChange: (offsetMs: number) => void;
  readonly onResync: () => void;
}

const adjustmentGroups = [
  { labelKey: 'offset.frame', value: 33.333 },
  { labelKey: 'offset.milliseconds', value: 10 },
  { labelKey: 'offset.milliseconds', value: 50 },
  { labelKey: 'offset.milliseconds', value: 100 }
] as const satisfies readonly {
  readonly labelKey: MessageKey;
  readonly value: number;
}[];

export function OffsetControl({
  canResync,
  offsetMs,
  onOffsetChange,
  onResync
}: OffsetControlProps) {
  const { t } = useI18n();
  const errorId = useId();
  const [draft, setDraft] = useState(() => offsetMs.toFixed(3));
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(offsetMs.toFixed(3));
  }, [editing, offsetMs]);

  const commitDraft = () => {
    const normalizedDraft = draft.trim();
    const isCompleteDecimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizedDraft);
    const parsed = Number(normalizedDraft);
    if (!isCompleteDecimal || !Number.isFinite(parsed)) {
      setDraft(offsetMs.toFixed(3));
      setInvalid(true);
      setEditing(false);
      return;
    }
    setDraft(parsed.toFixed(3));
    setInvalid(false);
    setEditing(false);
    onOffsetChange(parsed);
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitDraft();
  };

  return (
    <section className="offset-control" aria-labelledby="offset-control-title">
      <div className="section-heading">
        <h2 id="offset-control-title">{t('offset.title')}</h2>
      </div>
      <label className="offset-field">
        <span>{t('offset.label')}</span>
        <input
          className="numeric"
          aria-label={t('offset.label')}
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid || undefined}
          inputMode="decimal"
          type="text"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setInvalid(false);
          }}
          onFocus={() => setEditing(true)}
          onKeyDown={handleDraftKeyDown}
        />
      </label>
      {invalid && (
        <p id={errorId} className="inline-error" role="alert">{t('offset.invalid')}</p>
      )}
      <div className="offset-grid">
        {adjustmentGroups.map((adjustment) => {
          const label = adjustment.labelKey === 'offset.frame'
            ? t(adjustment.labelKey)
            : t(adjustment.labelKey, { amount: adjustment.value });
          return (
            <div className="adjustment-pair" key={adjustment.value}>
              <button
                type="button"
                aria-label={t('offset.decrease', { amount: label })}
                onClick={() => onOffsetChange(offsetMs - adjustment.value)}
              >−</button>
              <span className="numeric">{label}</span>
              <button
                type="button"
                aria-label={t('offset.increase', { amount: label })}
                onClick={() => onOffsetChange(offsetMs + adjustment.value)}
              >+</button>
            </div>
          );
        })}
      </div>
      <div className="button-row">
        <button type="button" onClick={() => onOffsetChange(0)}>{t('offset.reset')}</button>
        <button type="button" disabled={!canResync} onClick={onResync}>{t('action.resync')}</button>
      </div>
    </section>
  );
}
