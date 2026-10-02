import { cloneElement, isValidElement, type ReactNode } from 'react';
import {
  SilentReferenceCard,
  type SilentReferenceCardProps
} from './SilentReferenceCard';
import { useI18n, type MessageKey } from '../i18n';
import type { PreparationStep, PresentationPhase } from '../model/presentation-state';

export interface PreparationFlowProps {
  readonly phase: Extract<PresentationPhase, { kind: 'preparation' }>;
  readonly steps: Readonly<Record<PreparationStep, ReactNode>>;
}

const stepMessageKeys = {
  'connect-studio': 'studio.connection.title',
  'import-video': 'preparation.video',
  'prepare-reference': 'preparation.reference',
  'bind-reference': 'preparation.binding'
} satisfies Record<PreparationStep, MessageKey>;

function summaryDetail(step: PreparationStep, node: ReactNode): string | undefined {
  if (step === 'import-video' && isValidElement<{ readonly file?: File }>(node)) {
    return node.props.file?.name;
  }
  return undefined;
}

function compactSilentHandoff(step: PreparationStep, node: ReactNode): ReactNode {
  if (step !== 'prepare-reference'
    || !isValidElement<SilentReferenceCardProps>(node)
    || node.type !== SilentReferenceCard
    || node.props.state.kind !== 'ready') {
    return null;
  }
  return cloneElement(node, { compact: true });
}

export function PreparationFlow({ phase, steps }: PreparationFlowProps) {
  const { t } = useI18n();

  return (
    <section
      className="preparation-flow"
      data-testid="preparation-flow"
      aria-labelledby="preparation-title"
    >
      <h2 id="preparation-title">{t('preparation.title')}</h2>
      <ol className="preparation-list">
        {phase.completed.map((step) => {
          const detail = summaryDetail(step, steps[step]);
          const handoff = compactSilentHandoff(step, steps[step]);
          return (
            <li
              key={step}
              className={handoff
                ? 'preparation-summary preparation-summary--handoff'
                : 'preparation-summary'}
              data-state="complete"
            >
              <span aria-hidden="true">✓</span>
              <div className={handoff
                ? 'preparation-summary-copy preparation-summary-copy--handoff'
                : 'preparation-summary-copy'}>
                <span>{t(stepMessageKeys[step])}</span>
                {detail && <small>{detail}</small>}
                {handoff}
              </div>
            </li>
          );
        })}
        <li className="preparation-current" data-state="current">
          {steps[phase.current]}
        </li>
      </ol>
    </section>
  );
}
