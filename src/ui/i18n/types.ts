import type { en } from './en';

export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type MessageKey = keyof typeof en;
export type MessageValues = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, values?: MessageValues) => string;

export interface LocaleStore {
  load(): Promise<Locale | undefined>;
  save(locale: Locale): Promise<void>;
}
