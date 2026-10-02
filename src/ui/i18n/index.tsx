import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { en } from './en';
import {
  createChromeLocaleStore,
  isSupportedLocale,
  resolveBrowserLocale
} from './locale';
import type {
  Locale,
  LocaleStore,
  MessageKey,
  MessageValues,
  Translate
} from './types';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en
};

export interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translate;
}

export interface I18nProviderProps {
  readonly children: ReactNode;
  readonly initialLocale?: Locale;
  readonly store?: LocaleStore;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function inferredBrowserLocale(): Locale {
  const language = typeof navigator === 'undefined' ? '' : navigator.language;
  return resolveBrowserLocale(language);
}

function interpolate(message: string, values?: MessageValues): string {
  if (!values) return message;
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : placeholder
  ));
}

export function I18nProvider({ children, initialLocale, store }: I18nProviderProps) {
  const activeStore = useMemo(() => store ?? createChromeLocaleStore(), [store]);
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? inferredBrowserLocale);
  const explicitSelection = useRef(false);

  useEffect(() => {
    if (initialLocale) return undefined;
    let cancelled = false;

    void activeStore.load()
      .then((savedLocale) => {
        if (!cancelled && !explicitSelection.current && isSupportedLocale(savedLocale)) {
          setLocaleState(savedLocale);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeStore, initialLocale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    explicitSelection.current = true;
    setLocaleState(nextLocale);
    void activeStore.save(nextLocale).catch(() => undefined);
  }, [activeStore]);

  const t = useCallback<Translate>((key, values) => (
    interpolate(catalogs[locale][key], values)
  ), [locale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.title = catalogs[locale]['brand.name'];
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider.');
  return context;
}

export { createChromeLocaleStore, resolveBrowserLocale } from './locale';
export { SUPPORTED_LOCALES } from './types';
export type {
  Locale,
  LocaleStore,
  MessageKey,
  MessageValues,
  Translate
} from './types';
