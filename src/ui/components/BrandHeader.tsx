import { BRAND } from '../brand';
import { SUPPORTED_LOCALES, type Locale, type MessageKey, useI18n } from '../i18n';
import { JedMark } from './JedMark';

const localeMessageKeys: Record<Locale, MessageKey> = {
  'zh-CN': 'locale.zhCN',
  'zh-TW': 'locale.zhTW',
  en: 'locale.en'
};

export function BrandHeader() {
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="panel-header">
      <div className="brand-lockup">
        <JedMark className="brand-mark" />
        <div className="brand-copy">
          <h1>{BRAND.productName}</h1>
          <p>{t('brand.tagline')}</p>
        </div>
      </div>

      <div className="brand-controls">
        <label className="locale-field">
          <span>{t('locale.label')}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.currentTarget.value as Locale)}
          >
            {SUPPORTED_LOCALES.map((supportedLocale) => (
              <option key={supportedLocale} value={supportedLocale}>
                {t(localeMessageKeys[supportedLocale])}
              </option>
            ))}
          </select>
        </label>
        <span className="version-label">
          {t('brand.versionLabel', { version: BRAND.versionLabel })}
        </span>
      </div>
    </header>
  );
}
