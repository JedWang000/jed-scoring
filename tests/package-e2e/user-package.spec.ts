import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import {
  createTinyVideoInput,
  TINY_SILENT_REFERENCE_NAME,
  TINY_VIDEO_FILE_NAME
} from '../helpers/tiny-video-fixture';

const videoFileName = TINY_VIDEO_FILE_NAME;
const silentFileName = TINY_SILENT_REFERENCE_NAME;
const shippedLocales = {
  'zh-CN': {
    chromeLocale: 'zh_CN',
    localeLabel: '语言',
    panelLabel: 'JED Scoring 侧边栏',
    tagline: '直接在 Suno 中为视频配乐',
    byline: '开发者：达子 Jed_Wang',
    description: '直接在 Suno 中为视频配乐 — 达子 Jed_Wang',
    fileSelect: '选择本地视频',
    videoPreview: '本地视频预览',
    mute: '静音本地视频',
    pipOpen: '弹出视频画面',
    pipReturn: '视频已弹出，点击收回',
    download: '下载静音 WAV',
    confirm: '确认参考音频块',
    start: '开始同步',
    syncing: '正在与 Suno Studio 同步',
    statusSyncing: '正在跟随 Suno Studio'
  },
  'zh-TW': {
    chromeLocale: 'zh_TW',
    localeLabel: '語言',
    panelLabel: 'JED Scoring 側邊欄',
    tagline: '直接在 Suno 中為影片配樂',
    byline: '開發者：达子 Jed_Wang',
    description: '直接在 Suno 中為影片配樂 — 达子 Jed_Wang',
    fileSelect: '選擇本機影片',
    videoPreview: '本機影片預覽',
    mute: '將本機影片靜音',
    pipOpen: '彈出影片畫面',
    pipReturn: '影片已彈出，點擊收回',
    download: '下載靜音 WAV',
    confirm: '確認參考音訊片段',
    start: '開始同步',
    syncing: '正在與 Suno Studio 同步',
    statusSyncing: '正在跟隨 Suno Studio'
  },
  en: {
    chromeLocale: 'en',
    localeLabel: 'Language',
    panelLabel: 'JED Scoring side panel',
    tagline: 'Score Your Video with Suno',
    byline: 'Developed by 达子 Jed_Wang',
    description: 'Score Your Video with Suno — by 达子 Jed_Wang',
    fileSelect: 'Choose local video',
    videoPreview: 'Local video preview',
    mute: 'Mute local video',
    pipOpen: 'Pop out video',
    pipReturn: 'Video is popped out; click to return it',
    download: 'Download silent WAV',
    confirm: 'Confirm reference audio clip',
    start: 'Start sync',
    syncing: 'Syncing with Suno Studio',
    statusSyncing: 'Following Suno Studio'
  }
} as const;

type ShippedLocale = keyof typeof shippedLocales;

interface DeveloperConfig {
  readonly contactUrl: string | null;
  readonly homepageUrl: string | null;
}

interface DeveloperPackageBuild extends DeveloperConfig {
  readonly baseURL: string;
}

interface InvalidPackageBuild extends DeveloperPackageBuild {
  readonly contactKind: 'http' | 'malformed';
  readonly homepageKind: 'javascript' | 'malformed';
}

const validDeveloperConfig = {
  contactUrl: 'https://example.com/jed/contact',
  homepageUrl: 'https://example.com/jed'
} as const;

const defaultDeveloperConfig = {
  contactUrl: 'https://b23.tv/iNOah8D',
  homepageUrl: 'https://b23.tv/iNOah8D'
} as const;

function extensionBrowserLaunchOptions(): { channel: 'chromium' } | { executablePath: string } {
  if (existsSync(chromium.executablePath())) return { channel: 'chromium' };
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executable) {
    throw new Error(
      'No Chromium executable is available for the unpacked-extension test. '
      + 'Install Playwright Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE.'
    );
  }
  if (!existsSync(executable)) {
    throw new Error(`PLAYWRIGHT_CHROMIUM_EXECUTABLE does not exist: ${executable}`);
  }
  return { executablePath: executable };
}

const readyClip = {
  id: 'clip-ready',
  label: '时间轴静音参考',
  startSeconds: 0,
  durationSeconds: 12.5,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  bindingEligibility: 'ready'
};

const unsafeClip = {
  id: 'clip-warped',
  label: 'Warp 音频块',
  startSeconds: 4,
  durationSeconds: 8,
  speed: 1,
  warped: true,
  bindingEligibility: 'warped'
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    health: 'healthy',
    bridgeStatus: 'ready',
    projectTimeSeconds: 0,
    isPlaying: false,
    clips: [readyClip],
    observedAtMs: 1,
    ...overrides
  };
}

async function installSnapshot(page: Page, value: unknown): Promise<void> {
  await page.addInitScript((controlledSnapshot) => {
    const packageState = globalThis as typeof globalThis & {
      __jedScoringPackageSnapshot?: unknown;
    };
    packageState.__jedScoringPackageSnapshot = controlledSnapshot;
    Object.defineProperty(globalThis.chrome, 'tabs', {
      configurable: true,
      value: {
        query: async () => [{ id: 1, url: 'https://suno.com/studio' }]
      }
    });
    Object.defineProperty(globalThis.chrome, 'runtime', {
      configurable: true,
      value: {
        sendMessage: async (message: { action?: string }) => (
          message.action === 'diagnostics'
            ? {
              type: 'suno-video-sync:background-response/v1',
              action: 'diagnostics',
              entries: []
            }
            : {
              type: 'suno-video-sync:background-response/v1',
              action: message.action,
              snapshot: packageState.__jedScoringPackageSnapshot
            }
        )
      }
    });
  }, value);
}

async function updateSnapshot(page: Page, value: unknown): Promise<void> {
  await page.evaluate((nextSnapshot) => {
    const packageState = globalThis as typeof globalThis & {
      __jedScoringPackageSnapshot?: unknown;
    };
    packageState.__jedScoringPackageSnapshot = nextSnapshot;
  }, value);
}

async function installLocale(page: Page, locale: ShippedLocale): Promise<void> {
  await page.addInitScript((selectedLocale) => {
    window.localStorage.setItem('jedScoring.locale', selectedLocale);
  }, locale);
}

async function installMediaHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaHarness = window as typeof window & {
      __jedScoringPipRequests?: number;
      __jedScoringDownload?: { name: string; href: string };
      __jedScoringCreatedObject?: Blob;
      __jedScoringDragFile?: File;
    };
    mediaHarness.__jedScoringPipRequests = 0;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (object: Blob) => {
        mediaHarness.__jedScoringCreatedObject = object;
        return originalCreateObjectURL(object);
      }
    });
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'requestPictureInPicture', {
      configurable: true,
      value: async function requestPictureInPicture() {
        mediaHarness.__jedScoringPipRequests = (mediaHarness.__jedScoringPipRequests ?? 0) + 1;
        return this;
      }
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: function captureDownload(this: HTMLAnchorElement) {
        if (this.download) {
          mediaHarness.__jedScoringDownload = { name: this.download, href: this.href };
        }
      }
    });
  });
}

async function dragSilentReference(page: Page) {
  return page.getByTestId('silent-reference-file').evaluate(async (element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer
    }));
    const file = dataTransfer.files.item(0);
    if (!file) throw new Error('Expected one generated silent reference File.');
    const mediaHarness = window as typeof window & { __jedScoringDragFile?: File };
    mediaHarness.__jedScoringDragFile = file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    return {
      count: dataTransfer.files.length,
      name: file.name,
      type: file.type,
      size: file.size,
      riff: ascii(0, 4),
      wave: ascii(8, 12),
      samplesAreZero: bytes.slice(44).every((value) => value === 0)
    };
  });
}

async function assertSilentDownloadMatchesDrag(page: Page, downloadLabel: string) {
  await page.getByRole('button', { name: downloadLabel }).click();
  return page.evaluate(async () => {
    const mediaHarness = window as typeof window & {
      __jedScoringDownload?: { name: string; href: string };
      __jedScoringCreatedObject?: Blob;
      __jedScoringDragFile?: File;
    };
    const dragFile = mediaHarness.__jedScoringDragFile;
    const downloadFile = mediaHarness.__jedScoringCreatedObject;
    if (!(dragFile instanceof File) || !(downloadFile instanceof File)) {
      throw new Error('Expected drag and download to expose generated File objects.');
    }
    const bytes = new Uint8Array(await downloadFile.arrayBuffer());
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    return {
      sameObject: dragFile === downloadFile,
      drag: { name: dragFile.name, type: dragFile.type, size: dragFile.size },
      download: {
        name: downloadFile.name,
        type: downloadFile.type,
        size: downloadFile.size,
        href: mediaHarness.__jedScoringDownload?.href ?? '',
        anchorName: mediaHarness.__jedScoringDownload?.name ?? '',
        riff: ascii(0, 4),
        wave: ascii(8, 12),
        samplesAreZero: bytes.slice(44).every((value) => value === 0)
      }
    };
  });
}

async function gotoShippedSidePanel(page: Page): Promise<void> {
  const response = await page.request.get('/manifest.json');
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as { side_panel?: { default_path?: string } };
  expect(manifest.side_panel?.default_path).toBeTruthy();
  await page.goto(`/${manifest.side_panel!.default_path!}`);
}

async function gotoPackageSidePanel(page: Page, baseURL: string): Promise<void> {
  const response = await page.request.get(`${baseURL}/manifest.json`);
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as { side_panel?: { default_path?: string } };
  expect(manifest.side_panel?.default_path).toBe('src/sidepanel.html');
  await page.goto(`${baseURL}/${manifest.side_panel.default_path}`);
}

function requiredPackageEnvironment<T>(name: string): T {
  const value = process.env[name];
  expect(value, `${name} must be supplied by the package runner`).toBeTruthy();
  return JSON.parse(value!) as T;
}

function safeHttpsDestination(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

async function expectDeveloperDestinations(page: Page, config: DeveloperConfig): Promise<void> {
  const destinations = [
    ['developer-contact', config.contactUrl],
    ['developer-homepage', config.homepageUrl]
  ] as const;
  let expectedAnchors = 0;

  for (const [testId, configuredUrl] of destinations) {
    const destination = page.getByTestId(testId);
    const safeUrl = safeHttpsDestination(configuredUrl);
    if (!safeUrl) {
      expect(await destination.evaluate((element) => element.tagName)).toBe('SPAN');
      continue;
    }

    expectedAnchors += 1;
    expect(await destination.evaluate((element) => element.tagName)).toBe('A');
    await expect(destination).toHaveAttribute('href', safeUrl);
    await expect(destination).toHaveAttribute('target', '_blank');
    const relTokens = (await destination.getAttribute('rel') ?? '').split(/\s+/u).filter(Boolean).sort();
    expect(relTokens).toEqual(['noopener', 'noreferrer']);
  }

  await expect(page.locator('.developer-footer a')).toHaveCount(expectedAnchors);
}

test('ships an exact localized manifest whose locale tokens and icon files resolve', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as {
    version?: string;
    name?: string;
    description?: string;
    default_locale?: string;
    permissions?: readonly string[];
    host_permissions?: readonly string[];
    icons?: Record<string, string>;
    side_panel?: { default_path?: string };
  };

  expect(manifest).toMatchObject({
    version: '0.2.1',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage', 'sidePanel', 'debugger', 'tabs'],
    host_permissions: ['https://suno.com/*'],
    icons: {
      16: 'src/assets/icons/jed-16.png',
      32: 'src/assets/icons/jed-32.png',
      48: 'src/assets/icons/jed-48.png',
      128: 'src/assets/icons/jed-128.png'
    },
    side_panel: { default_path: 'src/sidepanel.html' }
  });
  expect(manifest.permissions).toEqual(['storage', 'sidePanel', 'debugger', 'tabs']);
  expect(manifest.host_permissions).toEqual(['https://suno.com/*']);
  expect(manifest.icons && Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48']);

  const tokenKey = (token: string | undefined) => {
    const match = /^__MSG_([A-Za-z][A-Za-z0-9_]*)__$/u.exec(token ?? '');
    expect(match, `Expected a Chrome locale token, received ${token ?? '<missing>'}`).not.toBeNull();
    return match![1];
  };
  const nameKey = tokenKey(manifest.name);
  const descriptionKey = tokenKey(manifest.description);

  for (const expected of Object.values(shippedLocales)) {
    const localeResponse = await request.get(`/_locales/${expected.chromeLocale}/messages.json`);
    expect(localeResponse.ok()).toBe(true);
    const messages = await localeResponse.json() as Record<string, { message?: string }>;
    expect(messages[nameKey]?.message).toBe('JED Scoring');
    expect(messages[descriptionKey]?.message).toBe(expected.description);
  }

  for (const iconPath of Object.values(manifest.icons ?? {})) {
    const iconResponse = await request.get(`/${iconPath}`);
    expect(iconResponse.ok()).toBe(true);
    expect([...await iconResponse.body()].slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

for (const [locale, expected] of Object.entries(shippedLocales) as [ShippedLocale, typeof shippedLocales[ShippedLocale]][]) {
  test(`renders shipped JED branding and its actual developer configuration in ${locale}`, async ({ page }) => {
    const mainConfig = requiredPackageEnvironment<DeveloperConfig>('JED_MAIN_PACKAGE_CONFIG');
    await installLocale(page, locale);
    await installSnapshot(page, snapshot());
    await gotoShippedSidePanel(page);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('combobox', { name: expected.localeLabel })).toHaveValue(locale);
    await expect(page.getByRole('main', { name: expected.panelLabel })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'JED Scoring' })).toBeVisible();
    await expect(page.getByText(expected.tagline)).toBeVisible();
    await expect(page.getByText(expected.byline)).toBeVisible();
    await expect(page.getByTestId('developer-contact')).toBeVisible();
    await expect(page.getByTestId('developer-homepage')).toBeVisible();
    await expectDeveloperDestinations(page, mainConfig);
  });
}

test('renders default developer destinations from a real no-env Vite package build', async ({ page }) => {
  const build = requiredPackageEnvironment<DeveloperPackageBuild>('JED_UNCONFIGURED_PACKAGE_BUILD');
  await installLocale(page, 'en');
  await installSnapshot(page, snapshot());
  await gotoPackageSidePanel(page, build.baseURL);

  await expectDeveloperDestinations(page, defaultDeveloperConfig);
});

test('renders exact safe anchors from a valid HTTPS Vite package variant', async ({ page }) => {
  const build = requiredPackageEnvironment<DeveloperPackageBuild>('JED_VALID_PACKAGE_BUILD');
  expect(build).toMatchObject(validDeveloperConfig);
  await installLocale(page, 'en');
  await installSnapshot(page, snapshot());
  await gotoPackageSidePanel(page, build.baseURL);

  await expectDeveloperDestinations(page, validDeveloperConfig);
});

test('rejects invalid build-time developer destinations in real Vite package variants', async ({ page }) => {
  const builds = JSON.parse(
    process.env.JED_INVALID_PACKAGE_BUILDS ?? '[]'
  ) as InvalidPackageBuild[];
  expect(builds).toMatchObject([
    {
      contactKind: 'http',
      homepageKind: 'javascript',
      contactUrl: 'http://contact.invalid/jed',
      homepageUrl: 'javascript:alert("jed")'
    },
    {
      contactKind: 'malformed',
      homepageKind: 'malformed',
      contactUrl: 'not a valid contact URL',
      homepageUrl: '::not a valid homepage URL::'
    }
  ]);
  await installLocale(page, 'en');
  await installSnapshot(page, snapshot());

  for (const build of builds) {
    await gotoPackageSidePanel(page, build.baseURL);
    await expect(page.getByRole('heading', { name: 'JED Scoring' })).toBeVisible();
    await expect(page.getByText('Developed by 达子 Jed_Wang')).toBeVisible();
    await expect(page.getByTestId('developer-contact')).toContainText('Developer link not configured');
    await expect(page.getByTestId('developer-homepage')).toContainText('Developer link not configured');
    await expectDeveloperDestinations(page, build);
  }
});

for (const [locale, expected] of Object.entries(shippedLocales) as [ShippedLocale, typeof shippedLocales[ShippedLocale]][]) {
  test(`completes the shipped prepare-and-sync flow in ${locale}`, async ({ page }) => {
    await installMediaHarness(page);
    await installLocale(page, locale);
    await installSnapshot(page, snapshot());
    await gotoShippedSidePanel(page);

    const builtScript = await page.locator('script[type="module"]').getAttribute('src');
    expect(builtScript).toMatch(/^\/assets\/sidepanel\.html-[\w-]+\.js$/);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('button', { name: expected.start })).toHaveCount(0);
    await page.getByLabel(expected.fileSelect).setInputFiles(await createTinyVideoInput(page));
    await expect(page.getByText(silentFileName)).toBeVisible();

    const dragPayload = await dragSilentReference(page);
    expect(dragPayload).toMatchObject({
      count: 1,
      name: silentFileName,
      type: 'audio/wav',
      riff: 'RIFF',
      wave: 'WAVE',
      samplesAreZero: true
    });
    expect(dragPayload.size).toBeGreaterThan(44);
    expect(await assertSilentDownloadMatchesDrag(page, expected.download)).toEqual({
      sameObject: true,
      drag: { name: silentFileName, type: 'audio/wav', size: dragPayload.size },
      download: {
        name: silentFileName,
        type: 'audio/wav',
        size: dragPayload.size,
        href: expect.stringMatching(/^blob:/u),
        anchorName: silentFileName,
        riff: 'RIFF',
        wave: 'WAVE',
        samplesAreZero: true
      }
    });

    const video = page.getByLabel(expected.videoPreview);
    await expect(page.locator('video')).toHaveCount(1);
    expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(false);
    await page.getByRole('button', { name: expected.pipOpen }).click();
    await expect(page.getByRole('button', { name: expected.pipReturn })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(1);
    await page.getByRole('button', { name: expected.pipReturn }).click();
    await page.getByRole('button', { name: expected.mute }).click();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);

    await expect(page.getByRole('button', { name: expected.start })).toHaveCount(0);
    await page.getByRole('radio', { name: new RegExp(readyClip.label) }).check();
    await expect(page.getByRole('button', { name: expected.start })).toHaveCount(0);
    await page.getByRole('button', { name: expected.confirm }).click();
    const start = page.getByRole('button', { name: expected.start });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.getByText(expected.statusSyncing)).toBeVisible();
    const progress = page.getByRole('button', { name: expected.syncing });
    await expect(progress).toBeDisabled();
    await expect(progress).toHaveAttribute('aria-busy', 'true');
  });
}

test('keeps unsafe candidates disabled', async ({ page }) => {
  await installLocale(page, 'zh-CN');
  await installSnapshot(page, snapshot({ clips: [unsafeClip] }));
  await gotoShippedSidePanel(page);

  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));
  await expect(page.getByText(silentFileName)).toBeVisible();
  await expect(page.getByRole('radio', { name: /Warp 音频块/ })).toBeDisabled();
  await expect(page.getByText('已启用 Warp。请关闭 Warp 后重新选择该音频块。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认参考音频块' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);
});

test('shows the dedicated adapter-unavailable state', async ({ page }) => {
  await installLocale(page, 'zh-CN');
  await installSnapshot(page, snapshot({
    health: 'unavailable',
    bridgeStatus: 'waiting-for-project-state',
    clips: [],
    reason: 'Transport unavailable.'
  }));
  await gotoShippedSidePanel(page);

  await expect(page.getByText('无法可靠读取 Suno Studio 传输栏')).toBeVisible();
  await expect(page.getByText('无法读取 Studio 工程状态。请检查工程；如果问题持续，请复制诊断摘要。')).toBeVisible();
  await expect(page.getByRole('button', { name: '连接 Studio' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '复制诊断摘要' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);
});

test('keeps the local media mounted when transport becomes unavailable after binding', async ({ page }) => {
  await installLocale(page, 'zh-CN');
  await installSnapshot(page, snapshot());
  await gotoShippedSidePanel(page);

  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));
  await expect(page.getByText(silentFileName)).toBeVisible();
  const candidate = page.getByRole('radio', { name: /时间轴静音参考/ });
  await expect(candidate).toBeEnabled();
  await candidate.check();
  await page.getByRole('button', { name: '确认参考音频块' }).click();
  await expect(page.getByRole('button', { name: '开始同步' })).toBeEnabled();
  const mountedVideo = page.getByLabel('本地视频预览');
  const previewSource = await mountedVideo.getAttribute('src');
  expect(previewSource).toMatch(/^blob:/u);
  await mountedVideo.evaluate((element) => {
    element.setAttribute('data-package-video-identity', 'retained');
  });

  await updateSnapshot(page, snapshot({
    health: 'unavailable',
    bridgeStatus: 'ready',
    reason: 'Transport unavailable.'
  }));

  await expect(page.getByText('无法可靠读取 Suno Studio 传输栏')).toBeVisible();
  await expect(page.getByLabel('本地视频预览')).toHaveCount(1);
  await expect(mountedVideo).toHaveAttribute('src', previewSource!);
  await expect(mountedVideo).toHaveAttribute('data-package-video-identity', 'retained');
  await expect(page.getByRole('button', { name: '开始同步' })).toHaveCount(0);
});

test('keeps the local video private, audible by default, docked, and paired with only a silent WAV', async ({ page }) => {
  await installMediaHarness(page);
  await installLocale(page, 'zh-CN');
  await installSnapshot(page, snapshot());
  const networkWrites: { method: string; url: string; body: string | null }[] = [];
  const observedUrls: string[] = [];
  page.on('request', (request) => {
    observedUrls.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      networkWrites.push({
        method: request.method(),
        url: request.url(),
        body: request.postData()
      });
    }
  });
  await page.setViewportSize({ width: 420, height: 800 });
  await gotoShippedSidePanel(page);

  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));

  await expect(page.getByText(videoFileName)).toBeVisible();
  await expect(page.getByText(silentFileName)).toBeVisible();
  await expect(page.getByLabel('本地视频预览')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('C:\\');

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
  if (!beforeScroll) throw new Error('Expected the built video dock to have layout before scrolling.');
  const afterScrollState = await settingsScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    };
  });
  expect(afterScrollState.scrollHeight).toBe(initialScroll.scrollHeight);
  expect(afterScrollState.clientHeight).toBe(initialScroll.clientHeight);
  expect(afterScrollState.scrollTop).toBeGreaterThan(initialScroll.scrollTop);
  expect(afterScrollState.scrollTop).toBeGreaterThan(0);
  const afterScroll = await dock.boundingBox();
  expect(afterScroll).not.toBeNull();
  if (!afterScroll) throw new Error('Expected the built video dock to retain layout after scrolling.');
  expect(afterScroll.y).toBeCloseTo(beforeScroll.y, 1);
  await settingsScroll.evaluate((element) => {
    element.scrollTop = 0;
  });

  const dragPayload = await dragSilentReference(page);
  expect(dragPayload).toMatchObject({ count: 1, name: silentFileName, type: 'audio/wav' });
  expect(dragPayload.size).toBeGreaterThan(44);
  expect(dragPayload).toMatchObject({ riff: 'RIFF', wave: 'WAVE', samplesAreZero: true });

  expect(await assertSilentDownloadMatchesDrag(page, '下载静音 WAV')).toEqual({
    sameObject: true,
    drag: { name: silentFileName, type: 'audio/wav', size: dragPayload.size },
    download: {
      name: silentFileName,
      type: 'audio/wav',
      size: dragPayload.size,
      href: expect.stringMatching(/^blob:/u),
      anchorName: silentFileName,
      riff: 'RIFF',
      wave: 'WAVE',
      samplesAreZero: true
    }
  });

  const video = page.getByLabel('本地视频预览');
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '静音本地视频' })).toBeVisible();
  expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(false);
  await page.getByRole('button', { name: '静音本地视频' }).click();
  expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);
  const pictureInPictureButton = page.getByRole('button', { name: '弹出视频画面' });
  await expect(pictureInPictureButton).toBeVisible();
  await pictureInPictureButton.click();
  await expect(page.getByRole('button', { name: '视频已弹出，点击收回' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const mediaHarness = window as typeof window & { __jedScoringPipRequests?: number };
    return mediaHarness.__jedScoringPipRequests;
  })).toBe(1);

  expect(networkWrites).toEqual([]);
  expect(observedUrls.some((url) => url.includes(videoFileName))).toBe(false);
});

test('keeps the shipped ready console ordered, resilient, and visually constrained in every locale', async ({ page }, testInfo) => {
  await installLocale(page, 'zh-CN');
  await installSnapshot(page, snapshot());
  await page.setViewportSize({ width: 432, height: 900 });
  await gotoShippedSidePanel(page);
  await page.getByLabel('选择本地视频').setInputFiles(await createTinyVideoInput(page));
  await expect(page.getByText(silentFileName)).toBeVisible();
  await page.getByRole('radio', { name: /时间轴静音参考/ }).check();
  await page.getByRole('button', { name: '确认参考音频块' }).click();

  for (const [locale, expected] of Object.entries(shippedLocales) as [ShippedLocale, typeof shippedLocales[ShippedLocale]][]) {
    await page.getByRole('combobox').selectOption(locale);
    await expect(page.getByRole('combobox', { name: expected.localeLabel })).toHaveValue(locale);
    await expect(page.getByText(expected.tagline)).toBeVisible();

    for (const width of [320, 432]) {
      await page.setViewportSize({ width, height: 900 });
      const contract = await page.evaluate(() => {
        const orderedSelectors = [
          '.video-stage',
          '.readiness-zone',
          '.time-mapping',
          '.offset-control',
          '.action-zone',
          '.developer-footer'
        ];
        const orderedElements = orderedSelectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing release region: ${selector}`);
          return element;
        });
        const rootStyle = getComputedStyle(document.documentElement);
        const shadowSelectors = [
          '.app-shell',
          '.panel-header',
          '.video-stage',
          '.readiness-zone',
          '.work-zone',
          '.action-zone',
          '.developer-footer',
          '.panel-card'
        ];
        const shadowed = shadowSelectors.filter((selector) => {
          const element = document.querySelector(selector);
          return element && getComputedStyle(element).boxShadow !== 'none';
        });
        const shortTargets = [...document.querySelectorAll<HTMLElement>('button, select, input, a[href], video')]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              height: rect.height,
              name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
              visible: rect.width > 0 && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
            };
          })
          .filter((target) => target.visible && target.height < 44);
        const pillControls = [...document.querySelectorAll<HTMLElement>('button, select, input:not([type="radio"])')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0
              && Number.parseFloat(getComputedStyle(element).borderRadius) >= rect.height / 2;
          })
          .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName);

        return {
          locale: document.documentElement.lang,
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          orderIsCorrect: orderedElements.every((element, index) => (
            index === orderedElements.length - 1
            || Boolean(element.compareDocumentPosition(orderedElements[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)
          )),
          shadowed,
          shortTargets,
          pillControls,
          radii: {
            shell: rootStyle.getPropertyValue('--radius-shell').trim(),
            control: rootStyle.getPropertyValue('--radius-control').trim(),
            detail: rootStyle.getPropertyValue('--radius-detail').trim()
          },
          colors: {
            bronze: rootStyle.getPropertyValue('--accent-bronze').trim(),
            canvas: rootStyle.getPropertyValue('--surface-canvas').trim()
          }
        };
      });

      expect(contract, `${locale} at ${width}px violates the shipped visual contract`).toEqual({
        locale,
        horizontalOverflow: 0,
        orderIsCorrect: true,
        shadowed: ['.app-shell'],
        shortTargets: [],
        pillControls: [],
        radii: { shell: '14px', control: '8px', detail: '6px' },
        colors: { bronze: '#d8ad70', canvas: '#0b0b0a' }
      });
      await testInfo.attach(`jed-scoring-${locale}-${width}px`, {
        body: await page.screenshot(),
        contentType: 'image/png'
      });
    }
  }
});

test('loads the unpacked dist observer in MAIN world under restrictive page CSP', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'suno-video-sync-extension-'));
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...extensionBrowserLaunchOptions(),
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const extensionWorlds: string[] = [];
    cdp.on('Runtime.executionContextCreated', ({ context: executionContext }) => {
      if (executionContext.origin.startsWith('chrome-extension://')) {
        extensionWorlds.push(executionContext.origin);
      }
    });
    await cdp.send('Runtime.enable');

    const projectState = {
      timing: { type: 'manual', bps: 1, lockBPS: false, bpsAutomation: [] },
      loop: { startBeats: 0, endBeats: 16, enabled: false },
      tracks: [{
        id: 'track-1',
        type: 'audio',
        clips: [{
          type: 'audio',
          id: 'clip-csp',
          name: 'CSP Reference',
          startBeats: 0,
          endBeats: 12,
          readStartBeats: 0,
          transposition: 0,
          reversed: false,
          loop: { enabled: false, startBeats: 0, endBeats: 12 },
          warp: { enabled: false, awaitingAnalysis: false, markers: { 0: 0, 12: 12 } }
        }],
        takeLanes: []
      }]
    };

    await page.route('https://suno.com/**', async (route) => {
      if (new URL(route.request().url()).pathname === '/api/studio/project/project-1') {
        await route.fulfill({ json: { state: projectState } });
        return;
      }
      await route.fulfill({
        contentType: 'text/html',
        headers: { 'content-security-policy': "script-src 'none'; object-src 'none'" },
        body: '<!doctype html><html><body><h1>CSP host</h1></body></html>'
      });
    });

    await page.goto('https://suno.com/extension-csp-test');
    await expect.poll(() => extensionWorlds).not.toEqual([]);
    const bridgeState = await page.evaluate(async () => {
      const statePromise = new Promise<unknown>((resolveState, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Bridge state timeout')), 5_000);
        window.addEventListener('message', (event) => {
          const message = event.data as {
            source?: unknown;
            type?: unknown;
            state?: { status?: unknown };
          };
          if (event.source !== window
            || message?.source !== 'suno-video-sync.page-bridge'
            || message.type !== 'bridge-state'
            || message.state?.status !== 'ready') return;
          window.clearTimeout(timeout);
          resolveState(message.state);
        });
      });
      await fetch('/api/studio/project/project-1');
      return statePromise;
    });

    expect(bridgeState).toMatchObject({
      status: 'ready',
      clips: [{ id: 'clip-csp', label: 'CSP Reference' }]
    });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
