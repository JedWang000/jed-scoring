import { BRAND, isSafeDeveloperUrl } from '../brand';
import { useI18n, type MessageKey } from '../i18n';

export interface DeveloperFooterProps {
  readonly developerName?: string;
  readonly contactUrl?: string;
  readonly homepageUrl?: string;
}

interface DeveloperDestinationProps {
  readonly labelKey: MessageKey;
  readonly testId: string;
  readonly url: string | undefined;
}

function DeveloperDestination({ labelKey, testId, url }: DeveloperDestinationProps) {
  const { t } = useI18n();
  const label = t(labelKey);

  if (!isSafeDeveloperUrl(url)) {
    return (
      <span className="developer-detail" data-testid={testId}>
        {label}: {t('developer.unconfigured')}
      </span>
    );
  }

  return (
    <a
      className="developer-link"
      data-testid={testId}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}

export function DeveloperFooter({
  developerName = BRAND.developerName,
  contactUrl = BRAND.contactUrl,
  homepageUrl = BRAND.homepageUrl
}: DeveloperFooterProps) {
  const { t } = useI18n();

  return (
    <footer className="developer-footer">
      <p>{t('developer.byline', { developer: developerName })}</p>
      <div className="developer-destinations">
        <DeveloperDestination
          labelKey="developer.contact"
          testId="developer-contact"
          url={contactUrl}
        />
        <DeveloperDestination
          labelKey="developer.homepage"
          testId="developer-homepage"
          url={homepageUrl}
        />
      </div>
    </footer>
  );
}
