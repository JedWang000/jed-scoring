// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../src/ui/i18n/en';
import {
  I18nProvider,
  createChromeLocaleStore,
  resolveBrowserLocale,
  useI18n,
  type Locale,
  type LocaleStore
} from '../../src/ui/i18n';
import { zhCN } from '../../src/ui/i18n/zh-CN';
import { zhTW } from '../../src/ui/i18n/zh-TW';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveBrowserLocale', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['ZH-tW', 'zh-TW'],
    ['zh-TW-extra', 'zh-TW'],
    ['zh-CN-extra', 'zh-CN'],
    ['  zh-hANT-x-private  ', 'zh-TW'],
    ['en-US', 'en'],
    ['ja-JP', 'en'],
    ['', 'en'],
    ['not_a_locale', 'en'],
    ['zhish', 'en']
  ] as const)('maps %j to %s', (language, expected) => {
    expect(resolveBrowserLocale(language)).toBe(expected);
  });
});

describe('message catalogs', () => {
  it('has the same complete, non-empty key set in every locale', () => {
    const expectedKeys = Object.keys(en).sort();

    expect(Object.keys(zhCN).sort()).toEqual(expectedKeys);
    expect(Object.keys(zhTW).sort()).toEqual(expectedKeys);
    expect(expectedKeys).not.toHaveLength(0);

    for (const catalog of [en, zhCN, zhTW]) {
      expect(Object.values(catalog).every((message) => message.trim().length > 0)).toBe(true);
    }
  });

  it('registers every release copy group and complete named templates', () => {
    const groups = [
      'brand',
      'locale',
      'common',
      'studio',
      'status',
      'video',
      'reference',
      'binding',
      'preparation',
      'mapping',
      'offset',
      'action',
      'privacy',
      'developer'
    ];

    for (const group of groups) {
      expect(Object.keys(en).some((key) => key.startsWith(`${group}.`))).toBe(true);
    }
    expect(en['video.fileSummary']).toContain('{fileName}');
    expect(en['reference.duration']).toContain('{duration}');
    expect(en['offset.increase']).toContain('{amount}');
    expect((en as Record<string, string>)['status.playbackUnavailable']).toContain('continue playback');
    expect((en as Record<string, string>)['status.playbackUnknown']).toContain('continue playback');
  });

  it('uses the approved product strings verbatim', () => {
    expect([zhCN['brand.name'], zhTW['brand.name'], en['brand.name']]).toEqual([
      'JED Scoring',
      'JED Scoring',
      'JED Scoring'
    ]);
    expect([zhCN['brand.tagline'], zhTW['brand.tagline'], en['brand.tagline']]).toEqual([
      '直接在 Suno 中为视频配乐',
      '直接在 Suno 中為影片配樂',
      'Score Your Video with Suno'
    ]);
    expect([zhCN['brand.developer'], zhTW['brand.developer'], en['brand.developer']]).toEqual([
      '达子 Jed_Wang',
      '达子 Jed_Wang',
      '达子 Jed_Wang'
    ]);
    expect([zhCN['video.masterClock'], zhTW['video.masterClock'], en['video.masterClock']]).toEqual([
      'Suno Studio 为主时钟',
      'Suno Studio 為主時鐘',
      'Suno Studio is the master clock'
    ]);
    expect([zhCN['status.ready'], zhTW['status.ready'], en['status.ready']]).toEqual([
      '已连接，可开始同步',
      '已連線，可開始同步',
      'Connected and ready to sync'
    ]);
    expect([zhCN['mapping.title'], zhTW['mapping.title'], en['mapping.title']]).toEqual([
      '时间映射',
      '時間映射',
      'Time mapping'
    ]);
    expect([zhCN['offset.title'], zhTW['offset.title'], en['offset.title']]).toEqual([
      '同步偏移',
      '同步偏移',
      'Sync offset'
    ]);
    expect([zhCN['action.start'], zhTW['action.start'], en['action.start']]).toEqual([
      '开始同步',
      '開始同步',
      'Start sync'
    ]);
    expect([zhCN['privacy.short'], zhTW['privacy.short'], en['privacy.short']]).toEqual([
      '视频和音频保留在本机',
      '影片和音訊保留在本機',
      'Video and audio stay on this device'
    ]);
    expect([zhCN['privacy.silentWav'], zhTW['privacy.silentWav'], en['privacy.silentWav']]).toEqual([
      '只有你明确拖动或下载的全零静音 WAV 会进入 Suno 工作流。',
      '只有你明確拖放或下載的全零靜音 WAV 會進入 Suno 工作流程。',
      'Only the all-zero silent WAV you explicitly drag or download enters the Suno workflow.'
    ]);
  });

  it('gives every blocking binding state a factual next step in every catalog', () => {
    const recoveryKeys = [
      'binding.empty.waitingProject',
      'binding.empty.ready',
      'binding.empty.unsupportedProject',
      'binding.empty.unsupportedTiming',
      'binding.empty.tooManyClips',
      'binding.empty.parseFailed',
      'binding.eligibility.warped',
      'binding.eligibility.speedChanged',
      'binding.eligibility.looped',
      'binding.eligibility.reversed',
      'binding.eligibility.analysisPending',
      'binding.eligibility.unsupportedMapping'
    ] as const;

    for (const key of recoveryKeys) {
      expect(zhCN[key]).toContain('请');
      expect(zhTW[key]).toContain('請');
      expect(en[key]).toMatch(/\b(?:Add|Refresh|Open|Use|Disable|Restore|Turn|Wait|Choose)\b/u);
    }
  });

  it('states the binding failure, stopped automatic sync, and recovery action in every warning', () => {
    const warningKeys = [
      'status.warningDefault',
      'status.warning.missing',
      'status.warning.identityAmbiguous',
      'status.warning.warped',
      'status.warning.speedChanged',
      'status.warning.looped',
      'status.warning.reversed',
      'status.warning.analysisPending',
      'status.warning.unsupportedMapping'
    ] as const;

    for (const key of warningKeys) {
      expect(zhCN[key]).toContain('自动同步');
      expect(zhCN[key]).toContain('请');
      expect(zhTW[key]).toContain('自動同步');
      expect(zhTW[key]).toContain('請');
      expect(en[key]).toContain('Automatic sync');
      expect(en[key]).toMatch(/\b(?:Bind|Disable|Restore|Turn|Wait|Choose|Check)\b/u);
    }
  });

  it('uses explicit verb-and-noun recovery CTAs and a safe unknown Studio fallback', () => {
    expect([zhCN['action.rebind'], zhTW['action.rebind'], en['action.rebind']]).toEqual([
      '重新绑定参考音频块',
      '重新綁定參考音訊片段',
      'Bind reference clip again'
    ]);
    expect([
      zhCN['reference.error.retry'],
      zhTW['reference.error.retry'],
      en['reference.error.retry']
    ]).toEqual([
      '重新生成静音参考音频',
      '重新產生靜音參考音訊',
      'Generate silent reference again'
    ]);
    expect([
      zhCN['studio.connection.projectReadFailed'],
      zhTW['studio.connection.projectReadFailed'],
      en['studio.connection.projectReadFailed']
    ]).toEqual([
      '无法读取 Studio 工程状态。请检查工程；如果问题持续，请复制诊断摘要。',
      '無法讀取 Studio 專案狀態。請檢查專案；如果問題持續，請複製診斷摘要。',
      'Studio project state could not be read. Check the project, then copy diagnostics if the problem continues.'
    ]);
  });

  it('gives the exhaustive empty-ready projection an add-only recovery in every catalog', () => {
    expect([
      zhCN['binding.empty.ready'],
      zhTW['binding.empty.ready'],
      en['binding.empty.ready']
    ]).toEqual([
      '当前时间轴中没有可绑定的顶层音频块。请在 Studio 中添加一个受支持的顶层音频块，然后返回插件或刷新 Studio 页面。',
      '目前時間軸中沒有可綁定的頂層音訊片段。請在 Studio 中新增一個受支援的頂層音訊片段，然後返回擴充功能或重新整理 Studio 頁面。',
      'The current timeline has no top-level audio clips to bind. Add a supported top-level audio clip in Studio, then return here or refresh the Studio page.'
    ]);
  });
});

function LocaleConsumer() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div>
      <p>{t('brand.tagline')}</p>
      <p>{t('video.fileSummary', { fileName: 'shot.mp4' })}</p>
      <button type="button" onClick={() => setLocale('zh-CN')}>zh-CN</button>
      <button type="button" onClick={() => setLocale('zh-TW')}>zh-TW</button>
      <button type="button" onClick={() => setLocale('en')}>en</button>
      <output aria-label="active locale">{locale}</output>
    </div>
  );
}

function createMemoryStore(saved?: unknown) {
  let value = saved;
  const store: LocaleStore = {
    load: vi.fn(async () => value as Locale | undefined),
    save: vi.fn(async (locale) => {
      value = locale;
    })
  };
  return { store, read: () => value };
}

describe('I18nProvider', () => {
  it('switches visible text, document metadata, and persisted locale immediately', async () => {
    const memory = createMemoryStore();
    render(
      <I18nProvider initialLocale="zh-CN" store={memory.store}>
        <LocaleConsumer />
      </I18nProvider>
    );

    expect(screen.getByText('直接在 Suno 中为视频配乐')).toBeInTheDocument();
    expect(screen.getByText('文件：shot.mp4')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe('JED Scoring');

    fireEvent.click(screen.getByRole('button', { name: 'zh-TW' }));
    expect(screen.getByText('直接在 Suno 中為影片配樂')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-TW');
    expect(document.title).toBe('JED Scoring');
    expect(memory.read()).toBe('zh-TW');

    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByText('Score Your Video with Suno')).toBeInTheDocument();
    expect(screen.getByText('File: shot.mp4')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('JED Scoring');
    expect(memory.read()).toBe('en');
    expect(memory.store.save).toHaveBeenCalledTimes(2);
  });

  it('lets a saved supported locale win over browser inference', async () => {
    const memory = createMemoryStore('zh-TW');
    render(
      <I18nProvider store={memory.store}>
        <LocaleConsumer />
      </I18nProvider>
    );

    expect(await screen.findByText('直接在 Suno 中為影片配樂')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-TW');
    expect(memory.store.save).not.toHaveBeenCalled();
  });

  it('ignores an unsupported saved value and keeps the inferred locale', async () => {
    const memory = createMemoryStore('fr-FR');
    render(
      <I18nProvider store={memory.store}>
        <LocaleConsumer />
      </I18nProvider>
    );

    await waitFor(() => expect(memory.store.load).toHaveBeenCalledOnce());
    expect(screen.getByText('直接在 Suno 中为视频配乐')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('fails soft when loading or saving the locale fails', async () => {
    const store: LocaleStore = {
      load: vi.fn(async () => { throw new Error('load unavailable'); }),
      save: vi.fn(async () => { throw new Error('save unavailable'); })
    };
    render(
      <I18nProvider store={store}>
        <LocaleConsumer />
      </I18nProvider>
    );

    await waitFor(() => expect(store.load).toHaveBeenCalledOnce());
    expect(screen.getByText('直接在 Suno 中为视频配乐')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(screen.getByText('Score Your Video with Suno')).toBeInTheDocument();
    await waitFor(() => expect(store.save).toHaveBeenCalledWith('en'));
  });
});

describe('createChromeLocaleStore', () => {
  it('uses chrome.storage.local and the single release key when available', async () => {
    const area = {
      get: vi.fn(async () => ({ 'jedScoring.locale': 'zh-TW' })),
      set: vi.fn(async () => undefined)
    };
    vi.stubGlobal('chrome', { storage: { local: area } });
    localStorage.setItem('jedScoring.locale', 'en');

    const store = createChromeLocaleStore();

    await expect(store.load()).resolves.toBe('zh-TW');
    await store.save('zh-CN');
    expect(area.get).toHaveBeenCalledWith('jedScoring.locale');
    expect(area.set).toHaveBeenCalledWith({ 'jedScoring.locale': 'zh-CN' });
    expect(localStorage.getItem('jedScoring.locale')).toBe('en');
  });

  it('uses localStorage only when chrome storage is absent', async () => {
    vi.stubGlobal('chrome', {});
    localStorage.setItem('jedScoring.locale', 'zh-CN');
    const store = createChromeLocaleStore();

    await expect(store.load()).resolves.toBe('zh-CN');
    await store.save('en');
    expect(localStorage.getItem('jedScoring.locale')).toBe('en');
  });

  it('treats unsupported and inaccessible persisted values as absent', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ 'jedScoring.locale': 'de' })),
          set: vi.fn(async () => { throw new Error('quota exceeded'); })
        }
      }
    });
    const store = createChromeLocaleStore();

    await expect(store.load()).resolves.toBeUndefined();
    await expect(store.save('en')).resolves.toBeUndefined();
  });
});
