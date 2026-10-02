import { expect, test, type Page } from '@playwright/test';
import {
  createTinyVideoInput,
  TINY_SILENT_REFERENCE_NAME,
  TINY_VIDEO_FILE_NAME
} from '../helpers/tiny-video-fixture';

const localVideoName = TINY_VIDEO_FILE_NAME;
const silentReferenceName = TINY_SILENT_REFERENCE_NAME;
const developerLinkFocusOrder = [
  'link:联系开发者',
  'link:开发者主页'
] as const;
const offsetFocusOrder = [
  'input:Offset 毫秒',
  'button:同步偏移减少 1 帧',
  'button:同步偏移增加 1 帧',
  'button:同步偏移减少 10 毫秒',
  'button:同步偏移增加 10 毫秒',
  'button:同步偏移减少 50 毫秒',
  'button:同步偏移增加 50 毫秒',
  'button:同步偏移减少 100 毫秒',
  'button:同步偏移增加 100 毫秒',
  'button:重置 Offset',
  'button:重新同步'
] as const;

const localeExpectations = {
  'zh-CN': {
    initialLocale: 'en',
    localeLabel: '语言',
    panelLabel: 'JED Scoring 侧边栏',
    tagline: '直接在 Suno 中为视频配乐',
    fontFamily: 'Microsoft YaHei UI'
  },
  'zh-TW': {
    initialLocale: 'zh-CN',
    localeLabel: '語言',
    panelLabel: 'JED Scoring 側邊欄',
    tagline: '直接在 Suno 中為影片配樂',
    fontFamily: 'Microsoft JhengHei UI'
  },
  en: {
    initialLocale: 'zh-TW',
    localeLabel: 'Language',
    panelLabel: 'JED Scoring side panel',
    tagline: 'Score Your Video with Suno',
    fontFamily: 'Segoe UI Variable Text'
  }
} as const;

type SupportedLocale = keyof typeof localeExpectations;

async function installLocaleBeforeApp(
  page: Page,
  storedLocale: SupportedLocale | undefined,
  browserLanguage = 'en-US',
  once = false
) {
  await page.addInitScript(({ locale, language, initializeOnce }) => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => language
    });
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      get: () => [language]
    });

    const marker = '__jedScoringLocaleSeeded';
    if (initializeOnce && window.sessionStorage.getItem(marker) === 'true') return;
    if (locale) window.localStorage.setItem('jedScoring.locale', locale);
    else window.localStorage.removeItem('jedScoring.locale');
    if (initializeOnce) window.sessionStorage.setItem(marker, 'true');
  }, { locale: storedLocale, language: browserLanguage, initializeOnce: once });
}

async function openChineseFlow(page: Page, path = '/src/sidepanel.html') {
  await installLocaleBeforeApp(page, 'zh-CN');
  await page.goto(path);
  await expect(page.getByRole('combobox', { name: '语言' })).toHaveValue('zh-CN');
}

async function prepareBindReference(page: Page, width = 400) {
  await page.setViewportSize({ width, height: 900 });
  await openChineseFlow(page, '/tests/fixtures/sidepanel/bridge-ready.html');
  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));
  await expect(page.getByText(silentReferenceName)).toBeVisible();
}

async function prepareReadyConsole(page: Page, width = 400) {
  await prepareBindReference(page, width);
  await page.getByRole('radio', { name: /对轨参考/ }).check();
  await page.getByRole('button', { name: '确认参考音频块' }).click();
  await expect(page.getByRole('button', { name: '开始同步' })).toBeEnabled();
}

async function collectNaturalFocusOrder(page: Page): Promise<readonly string[]> {
  const main = page.getByRole('main');
  await main.evaluate((element) => {
    const previousTabIndex = element.getAttribute('tabindex');
    element.setAttribute('tabindex', '-1');
    try {
      (element as HTMLElement).focus();
    } finally {
      if (previousTabIndex === null) element.removeAttribute('tabindex');
      else element.setAttribute('tabindex', previousTabIndex);
    }
  });
  await expect(main).not.toHaveAttribute('tabindex');

  const focusOrder: string[] = [];
  for (let index = 0; index < 64; index += 1) {
    await page.keyboard.press('Tab');
    const descriptor = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || active === document.documentElement) return '';
      const explicitName = active.getAttribute('aria-label')?.trim();

      if (active instanceof HTMLSelectElement) {
        const label = active.labels?.[0]?.querySelector('span')?.textContent?.trim() ?? '';
        return `combobox:${explicitName || label}`;
      }
      if (active instanceof HTMLVideoElement) return `video:${explicitName ?? ''}`;
      if (active instanceof HTMLButtonElement) {
        return `button:${explicitName || active.textContent?.trim() || ''}`;
      }
      if (active instanceof HTMLAnchorElement) {
        return `link:${explicitName || active.textContent?.trim() || ''}`;
      }
      if (active instanceof HTMLInputElement) {
        const label = active.labels?.[0];
        const name = explicitName
          || label?.querySelector('strong')?.textContent?.trim()
          || label?.querySelector('span')?.textContent?.trim()
          || label?.textContent?.trim()
          || '';
        return `${active.type === 'radio'
          ? 'radio'
          : active.type === 'number'
            ? 'spinbutton'
            : 'input'}:${name}`;
      }
      return `${active.tagName.toLowerCase()}:${explicitName || active.textContent?.trim() || ''}`;
    });

    if (!descriptor) break;
    if (descriptor === focusOrder[0] && focusOrder.length > 1) break;
    if (descriptor !== focusOrder.at(-1)) focusOrder.push(descriptor);
  }

  expect(await page.locator('[tabindex]').evaluateAll((elements) => (
    elements
      .map((element) => element.getAttribute('tabindex'))
      .filter((value) => value !== null && Number(value) > 0)
  ))).toEqual([]);
  return focusOrder;
}

test('keeps synchronization unavailable before explicit reference binding', async ({ page }) => {
  await openChineseFlow(page, '/tests/fixtures/sidepanel/bridge-ready.html');
  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));
  await expect(page.getByText(silentReferenceName)).toBeVisible();

  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);
  await page.getByRole('radio', { name: /对轨参考/ }).check();
  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);
});

test('imports the authorized video, creates only a silent drag file, and keeps video docked', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openChineseFlow(page);

  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));

  await expect(page.getByText(localVideoName)).toBeVisible();
  await expect(page.getByText(silentReferenceName)).toBeVisible();
  await expect(page.getByLabel('本地视频预览')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('C:\\');
  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);

  const filenameWrapping = await page.getByText(silentReferenceName).evaluate((element) => {
    const style = getComputedStyle(element);
    return { whiteSpace: style.whiteSpace, wordBreak: style.wordBreak };
  });
  expect(filenameWrapping.whiteSpace).toBe('nowrap');
  expect(filenameWrapping.wordBreak).not.toBe('break-all');

  const dragPayload = await page.getByTestId('silent-reference-file').evaluate((element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer
    }));
    const file = dataTransfer.files.item(0);
    return file
      ? { count: dataTransfer.files.length, name: file.name, type: file.type, size: file.size }
      : { count: dataTransfer.files.length, name: '', type: '', size: 0 };
  });
  expect(dragPayload.count).toBe(1);
  expect(dragPayload.name).toBe(silentReferenceName);
  expect(dragPayload.type).toBe('audio/wav');
  expect(dragPayload.size).toBeGreaterThan(44);

  const mediaState = await page.getByLabel('本地视频预览').evaluate((video) => ({
    muted: (video as HTMLVideoElement).muted,
    objectFit: getComputedStyle(video).objectFit
  }));
  expect(mediaState).toEqual({ muted: false, objectFit: 'contain' });

  const dock = page.getByTestId('video-dock');
  const settingsScroll = page.getByTestId('settings-scroll');
  const initialScroll = await settingsScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));
  expect(initialScroll.scrollHeight).toBeGreaterThan(initialScroll.clientHeight);
  expect(initialScroll.scrollTop).toBe(0);

  const beforeScroll = await dock.boundingBox();
  expect(beforeScroll).not.toBeNull();
  if (!beforeScroll) throw new Error('Expected the video dock to have layout before scrolling.');
  const afterScrollState = await settingsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    };
  });
  expect(afterScrollState.scrollTop).toBeGreaterThan(initialScroll.scrollTop);
  expect(afterScrollState.scrollTop).toBeGreaterThan(0);

  const afterScroll = await dock.boundingBox();
  expect(afterScroll).not.toBeNull();
  if (!afterScroll) throw new Error('Expected the video dock to retain layout after scrolling.');
  expect(afterScroll.y).toBeCloseTo(beforeScroll.y, 1);
});

test('binds a safe observed reference candidate after local video import', async ({ page }) => {
  await prepareReadyConsole(page);

  await expect(page.getByText('已连接，可开始同步')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始同步' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText('C:\\');
});

test('falls back to English before app startup for an unsupported browser language', async ({ page }) => {
  await installLocaleBeforeApp(page, undefined, 'fr-CA');
  await page.goto('/src/sidepanel.html');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  await expect(page.getByRole('main', { name: 'JED Scoring side panel' })).toBeVisible();
  await expect(page.getByText('Score Your Video with Suno')).toBeVisible();
});

for (const targetLocale of Object.keys(localeExpectations) as SupportedLocale[]) {
  const expected = localeExpectations[targetLocale];
  test(`switches to ${targetLocale}, updates accessible locale styling, and persists after reload`, async ({ page }) => {
    await installLocaleBeforeApp(page, expected.initialLocale, 'fr-CA', true);
    await page.goto('/src/sidepanel.html');

    await page.getByRole('combobox').selectOption(targetLocale);

    await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
    await expect(page.getByRole('combobox', { name: expected.localeLabel })).toHaveValue(targetLocale);
    await expect(page.getByRole('main', { name: expected.panelLabel })).toBeVisible();
    await expect(page.getByText(expected.tagline)).toBeVisible();
    await expect.poll(() => page.locator('html').evaluate((element) => (
      getComputedStyle(element).fontFamily
    ))).toContain(expected.fontFamily);
    await expect.poll(() => page.evaluate(() => (
      window.localStorage.getItem('jedScoring.locale')
    ))).toBe(targetLocale);

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
    await expect(page.getByRole('combobox', { name: expected.localeLabel })).toHaveValue(targetLocale);
    await expect(page.getByRole('main', { name: expected.panelLabel })).toBeVisible();
  });
}

test('keeps the ready console responsive and touchable across side-panel widths and locales', async ({ page }) => {
  await prepareReadyConsole(page, 480);

  for (const locale of Object.keys(localeExpectations) as SupportedLocale[]) {
    const expected = localeExpectations[locale];
    await page.getByRole('combobox').selectOption(locale);
    await expect(page.getByRole('combobox', { name: expected.localeLabel })).toHaveValue(locale);

    let referenceTypeSizes: readonly string[] | undefined;
    for (const width of [160, 240, 320, 360, 400, 480]) {
      await page.setViewportSize({ width, height: 900 });

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }));
      expect(layout.scrollWidth, `${locale} at ${width}px overflows horizontally`).toBeLessThanOrEqual(layout.clientWidth);

      const shortTargets = await page.locator('button, select, input, a[href]').evaluateAll((elements) => (
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
              height: rect.height,
              visible: rect.width > 0 && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
            };
          })
          .filter((target) => target.visible && target.height < 44)
      ));
      expect(shortTargets, `${locale} at ${width}px has undersized controls`).toEqual([]);

      const typeSizes = await Promise.all([
        page.getByRole('heading', { name: 'JED Scoring' }).evaluate((element) => getComputedStyle(element).fontSize),
        page.getByRole('combobox', { name: expected.localeLabel }).evaluate((element) => getComputedStyle(element).fontSize),
        page.getByRole('button', { name: locale === 'en' ? 'Start sync' : locale === 'zh-TW' ? '開始同步' : '开始同步' })
          .evaluate((element) => getComputedStyle(element).fontSize)
      ]);
      referenceTypeSizes ??= typeSizes;
      expect(typeSizes, `${locale} product type must not scale with viewport width`).toEqual(referenceTypeSizes);

      const mappingColumnCount = await page.locator('.mapping-grid').evaluate((element) => (
        getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
      ));
      expect(
        mappingColumnCount,
        `${locale} at ${width}px should use ${width < 360 ? 'one' : 'two'} mapping columns`
      ).toBe(width < 360 ? 1 : 2);

      if (width === 320) {
        const mappingGeometry = await page.locator('.mapping-grid > div').evaluateAll((elements) => (
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom };
          })
        ));
        expect(mappingGeometry.every((item, index) => (
          index === 0 || item.top >= mappingGeometry[index - 1].bottom
        ))).toBe(true);

        const timecodes = await page.locator('.mapping-grid dd.numeric').evaluateAll((elements) => (
          elements.map((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            whiteSpace: getComputedStyle(element).whiteSpace,
            wordBreak: getComputedStyle(element).wordBreak
          }))
        ));
        expect(timecodes.length).toBeGreaterThan(0);
        expect(timecodes.every((timecode) => (
          timecode.scrollWidth <= timecode.clientWidth
          && timecode.whiteSpace === 'nowrap'
          && timecode.wordBreak !== 'break-all'
        ))).toBe(true);
      }
    }
  }
});

test('tabs through compact silent handoff, binding, and configured developer links', async ({ page }) => {
  await prepareBindReference(page, 400);
  await page.getByRole('radio', { name: /对轨参考/ }).check();

  expect(await collectNaturalFocusOrder(page)).toEqual([
    'combobox:语言',
    'video:本地视频预览',
    'button:静音本地视频',
    'button:弹出视频画面',
    'button:下载静音 WAV',
    'radio:对轨参考',
    'button:确认参考音频块',
    ...developerLinkFocusOrder
  ]);
});

test('tabs through every ready-console control before configured developer links', async ({ page }) => {
  await prepareReadyConsole(page, 400);

  expect(await collectNaturalFocusOrder(page)).toEqual([
    'combobox:语言',
    'video:本地视频预览',
    'button:静音本地视频',
    'button:弹出视频画面',
    ...offsetFocusOrder,
    'button:开始同步',
    'button:重新选择文件',
    ...developerLinkFocusOrder
  ]);
});

test('tabs through the real playback recovery action before configured developer links', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: () => Promise.reject(new DOMException('Playback requires a gesture.', 'NotAllowedError'))
    });
  });
  await prepareReadyConsole(page, 400);
  await page.getByRole('button', { name: '开始同步' }).click();

  await expect(page.getByRole('button', { name: '允许视频声音并继续' })).toBeEnabled();
  await expect(page.getByRole('alert')).not.toHaveAttribute('aria-live');
  expect(await collectNaturalFocusOrder(page)).toEqual([
    'combobox:语言',
    'video:本地视频预览',
    'button:静音本地视频',
    'button:弹出视频画面',
    'button:允许视频声音并继续',
    ...offsetFocusOrder.slice(0, -1),
    ...developerLinkFocusOrder
  ]);
});

test('announces normal status politely without making the Studio timecode live', async ({ page }) => {
  await openChineseFlow(page, '/tests/fixtures/sidepanel/bridge-ready.html');

  await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByText('最近读取的 Studio 时间').locator('..')).not.toHaveAttribute('aria-live');
});

test('removes nonessential transition and animation time for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openChineseFlow(page);

  const motion = await page.getByRole('combobox', { name: '语言' }).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount
    };
  });
  expect(motion).toEqual({
    transitionDuration: '0s',
    animationDuration: '0s',
    animationIterationCount: '1'
  });
});
