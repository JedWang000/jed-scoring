// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SilentReferenceCard,
  triggerFileDownload,
  type PreparationErrorCode
} from '../../src/ui/components/SilentReferenceCard';
import { renderWithLocale } from '../helpers/render-with-locale';

const localeMatrix = [
  {
    locale: 'zh-CN' as const,
    title: '静音参考音频',
    recovery: '无法生成静音参考音频，请重试。',
    retry: '重新生成静音参考音频',
    download: '下载静音 WAV',
    dragHint: '拖到 Suno 轨道'
  },
  {
    locale: 'zh-TW' as const,
    title: '靜音參考音訊',
    recovery: '無法產生靜音參考音訊，請重試。',
    retry: '重新產生靜音參考音訊',
    download: '下載靜音 WAV',
    dragHint: '拖放至 Suno 軌道'
  },
  {
    locale: 'en' as const,
    title: 'Silent reference audio',
    recovery: 'The silent reference could not be generated. Try again.',
    retry: 'Generate silent reference again',
    download: 'Download silent WAV',
    dragHint: 'Drag to a Suno track'
  }
] as const;

const preparationErrorCases: readonly {
  code: PreparationErrorCode;
  zhCN: string;
  zhTW: string;
  en: string;
}[] = [
  {
    code: 'metadata-read-failed',
    zhCN: '无法读取视频元数据。请选择受支持的 MP4、WebM 或 MOV 文件后重试。',
    zhTW: '無法讀取影片中繼資料。請選擇支援的 MP4、WebM 或 MOV 檔案後重試。',
    en: 'Video metadata could not be read. Choose a supported MP4, WebM, or MOV file and try again.'
  },
  {
    code: 'unsupported-codec',
    zhCN: '无法读取视频编码或容器。请转换为 MP4/H.264 或 WebM 后重新选择文件。',
    zhTW: '無法讀取影片編碼或容器。請轉換為 MP4/H.264 或 WebM 後重新選擇檔案。',
    en: 'The video codec or container could not be read. Convert the video to MP4/H.264 or WebM, then choose the file again.'
  },
  {
    code: 'wav-too-large',
    zhCN: '视频过长，无法写入标准 WAV 文件。请使用较短的视频后重新生成静音参考音频。',
    zhTW: '影片過長，無法寫入標準 WAV 檔案。請使用較短的影片後重新產生靜音參考音訊。',
    en: 'The video is too long for a standard WAV file. Use a shorter video, then generate the silent reference again.'
  },
  {
    code: 'wav-allocation-failed',
    zhCN: '浏览器内存不足，无法生成静音 WAV。请关闭其他标签页或使用较短的视频后重试。',
    zhTW: '瀏覽器記憶體不足，無法產生靜音 WAV。請關閉其他分頁或使用較短的影片後重試。',
    en: 'The browser does not have enough memory to generate the silent WAV. Close other tabs or use a shorter video, then try again.'
  },
  {
    code: 'wav-generation-failed',
    zhCN: '无法生成静音 WAV。请重试；如果问题持续，请使用较短的视频。',
    zhTW: '無法產生靜音 WAV。請重試；如果問題持續，請使用較短的影片。',
    en: 'The silent WAV could not be generated. Try again; if the problem continues, use a shorter video.'
  }
];

function renderSilent(node: Parameters<typeof renderWithLocale>[0]) {
  return renderWithLocale(node, 'zh-CN');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (URL as unknown as { createObjectURL?: (object: Blob) => string }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
});

describe('SilentReferenceCard', () => {
  it.each(localeMatrix)(
    'localizes failure recovery and ARIA naming without exposing raw diagnostics in $locale',
    ({ locale, title, retry }) => {
      renderWithLocale(<SilentReferenceCard
        state={{ kind: 'failed', code: 'unsupported-codec' }}
        onRetry={vi.fn()}
      />, locale);

      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('alert')).not.toHaveTextContent('E_UNSUPPORTED');
      expect(screen.getByRole('button', { name: retry })).toBeEnabled();
    }
  );

  it.each(preparationErrorCases)(
    'renders complete localized recovery for $code',
    ({ code, zhCN, zhTW, en }) => {
      for (const [locale, expected] of [
        ['zh-CN', zhCN],
        ['zh-TW', zhTW],
        ['en', en]
      ] as const) {
        const { unmount } = renderWithLocale(<SilentReferenceCard
          state={{ kind: 'failed', code }}
          onRetry={vi.fn()}
        />, locale);
        expect(screen.getByRole('alert')).toHaveTextContent(expected);
        unmount();
      }
    }
  );

  it.each(localeMatrix)(
    'localizes the ready action without translating the filename or Suno brand in $locale',
    ({ locale, title, download, dragHint }) => {
      const fileName = 'Suno take 01-silent-reference.wav';
      const silentFile = new File(['silence'], fileName, { type: 'audio/wav' });
      renderWithLocale(<SilentReferenceCard
        state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
        onRetry={vi.fn()}
      />, locale);

      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
      expect(screen.getByText(fileName)).toHaveTextContent(fileName);
      expect(screen.getByText(dragHint)).toHaveTextContent('Suno');
      expect(screen.getByRole('button', { name: download })).toBeEnabled();
    }
  );

  it('is not draggable while the file is preparing', () => {
    renderSilent(<SilentReferenceCard state={{ kind: 'preparing' }} onRetry={vi.fn()} />);
    expect(screen.getByText('正在生成静音参考音频')).toBeInTheDocument();
    expect(screen.queryByTestId('silent-reference-file')).not.toBeInTheDocument();
  });

  it('adds exactly the ready silent WAV during the trusted dragstart', () => {
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const add = vi.fn();
    const dataTransfer = { items: { add }, effectAllowed: 'none' } as unknown as DataTransfer;
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 12.5 }}
      onRetry={vi.fn()}
    />);

    fireEvent.dragStart(screen.getByTestId('silent-reference-file'), { dataTransfer });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(silentFile);
    expect(dataTransfer.effectAllowed).toBe('copy');
  });

  it('shows the download fallback when DataTransfer rejects the file', () => {
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const dataTransfer = {
      items: { add: vi.fn(() => { throw new DOMException('blocked'); }) },
      effectAllowed: 'none'
    } as unknown as DataTransfer;
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
    />);

    fireEvent.dragStart(screen.getByTestId('silent-reference-file'), { dataTransfer });

    expect(screen.getByRole('alert')).toHaveTextContent('直接拖动未被浏览器接受');
    expect(screen.getByRole('button', { name: '下载静音 WAV' })).toBeEnabled();
  });

  it('shows the download fallback when DataTransfer returns no added item', () => {
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const dataTransfer = {
      items: { add: vi.fn(() => null) },
      effectAllowed: 'none'
    } as unknown as DataTransfer;
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
    />);

    fireEvent.dragStart(screen.getByTestId('silent-reference-file'), { dataTransfer });

    expect(screen.getByRole('alert')).toHaveTextContent('直接拖动未被浏览器接受');
    expect(dataTransfer.effectAllowed).toBe('none');
  });

  it('delegates an explicit download click with only the silent file', () => {
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const downloadFile = vi.fn();
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
      downloadFile={downloadFile}
    />);

    fireEvent.click(screen.getByRole('button', { name: '下载静音 WAV' }));

    expect(downloadFile).toHaveBeenCalledWith(silentFile);
  });

  it('keeps the ready file and reports an explicit download failure', () => {
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
      downloadFile={() => { throw new DOMException('download blocked'); }}
    />);

    fireEvent.click(screen.getByRole('button', { name: '下载静音 WAV' }));

    expect(screen.getByRole('alert')).toHaveTextContent('下载失败，静音文件仍保留在插件中');
    expect(screen.getByTestId('silent-reference-file')).toHaveTextContent(silentFile.name);
  });

  it('revokes the temporary download URL after the browser click', () => {
    vi.useFakeTimers();
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const createObjectURL = vi.fn(() => 'blob:silent-download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    triggerFileDownload(silentFile);
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:silent-download');
  });

  it('revokes the temporary URL when the browser click fails and retains the ready file', () => {
    vi.useFakeTimers();
    const silentFile = new File(['silence'], 'clip-silent-reference.wav', { type: 'audio/wav' });
    const createObjectURL = vi.fn(() => 'blob:failed-silent-download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new DOMException('download blocked');
    });
    renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: silentFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: '下载静音 WAV' }));
    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-silent-download');
    expect(screen.getByRole('alert')).toHaveTextContent('下载失败，静音文件仍保留在插件中');
    expect(screen.getByTestId('silent-reference-file')).toHaveTextContent(silentFile.name);
  });

  it('clears transient failure alerts when the ready file changes', () => {
    const firstFile = new File(['first'], 'first-silent-reference.wav', { type: 'audio/wav' });
    const secondFile = new File(['second'], 'second-silent-reference.wav', { type: 'audio/wav' });
    const rejectedTransfer = {
      items: { add: vi.fn(() => null) },
      effectAllowed: 'none'
    } as unknown as DataTransfer;
    const downloadFile = vi.fn(() => { throw new DOMException('download blocked'); });
    const { rerender } = renderSilent(<SilentReferenceCard
      state={{ kind: 'ready', file: firstFile, durationSeconds: 1 }}
      onRetry={vi.fn()}
      downloadFile={downloadFile}
    />);
    fireEvent.dragStart(screen.getByTestId('silent-reference-file'), {
      dataTransfer: rejectedTransfer
    });
    fireEvent.click(screen.getByRole('button', { name: '下载静音 WAV' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);

    rerender(<SilentReferenceCard
      state={{ kind: 'ready', file: secondFile, durationSeconds: 2 }}
      onRetry={vi.fn()}
      downloadFile={downloadFile}
    />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('silent-reference-file')).toHaveTextContent(secondFile.name);
  });

  it('renders a retry action for generation failure', () => {
    const onRetry = vi.fn();
    renderSilent(<SilentReferenceCard
      state={{ kind: 'failed', code: 'metadata-read-failed' }}
      onRetry={onRetry}
    />);
    fireEvent.click(screen.getByRole('button', { name: '重新生成静音参考音频' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
