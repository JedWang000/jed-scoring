import { render, type RenderOptions } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  I18nProvider,
  type Locale,
  type LocaleStore
} from '../../src/ui/i18n';

export function renderWithLocale(
  node: ReactNode,
  locale: Locale,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  let savedLocale: Locale | undefined;
  const store: LocaleStore = {
    async load() {
      return savedLocale;
    },
    async save(nextLocale) {
      savedLocale = nextLocale;
    }
  };

  const withLocale = (child: ReactNode) => (
    <I18nProvider initialLocale={locale} store={store}>
      {child}
    </I18nProvider>
  );
  const result = render(withLocale(node), options);

  return {
    ...result,
    rerender(nextNode: ReactNode) {
      result.rerender(withLocale(nextNode));
    }
  };
}
