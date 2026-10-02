import { SUPPORTED_LOCALES, type Locale, type LocaleStore } from './types';

const LOCALE_STORAGE_KEY = 'jedScoring.locale';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string'
    && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveBrowserLocale(language: string): Locale {
  const parts = language.trim().toLowerCase().split('-').filter(Boolean);
  if (parts[0] !== 'zh') return 'en';
  if (parts.includes('hant') || ['tw', 'hk', 'mo'].includes(parts[1] ?? '')) return 'zh-TW';
  return 'zh-CN';
}

function chromeStorageArea(): chrome.storage.StorageArea | undefined {
  if (typeof chrome === 'undefined') return undefined;
  return chrome.storage?.local;
}

export function createChromeLocaleStore(): LocaleStore {
  const storageArea = chromeStorageArea();

  if (storageArea) {
    return {
      async load() {
        try {
          const stored = await storageArea.get(LOCALE_STORAGE_KEY);
          const value: unknown = stored[LOCALE_STORAGE_KEY];
          return isSupportedLocale(value) ? value : undefined;
        } catch {
          return undefined;
        }
      },
      async save(locale) {
        try {
          await storageArea.set({ [LOCALE_STORAGE_KEY]: locale });
        } catch {
          // Locale persistence must never block the side panel.
        }
      }
    };
  }

  return {
    async load() {
      try {
        if (typeof localStorage === 'undefined') return undefined;
        const value = localStorage.getItem(LOCALE_STORAGE_KEY);
        return isSupportedLocale(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    async save(locale) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        }
      } catch {
        // Browser-only previews may deny storage; localization still works in memory.
      }
    }
  };
}
