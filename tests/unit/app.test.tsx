// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SunoClip, SunoSnapshot } from '../../src/content/suno-adapter';
import { createSilentWavFile } from '../../src/media/silent-wav';
import { App } from '../../src/ui/App';
import { BindingPicker } from '../../src/ui/components/BindingPicker';
import { SilentReferenceCard } from '../../src/ui/components/SilentReferenceCard';
import { SyncStatus } from '../../src/ui/components/SyncStatus';
import { VideoImporter } from '../../src/ui/components/VideoImporter';
import { renderWithLocale } from '../helpers/render-with-locale';

const candidate: SunoClip = {
  id: 'clip-1',
  startSeconds: 12,
  durationSeconds: 30,
  trimStartSeconds: 0,
  speed: 1,
  warped: false,
  label: 'Reference audio',
  bindingEligibility: 'ready'
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function installObjectURLMocks() {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => 'blob:' + file.name)
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn()
  });
  return pause;
}

const readyMetadata = {
  kind: 'ready',
  metadata: { durationSeconds: 2, width: 1920, height: 1080 }
} as const;

async function advanceToBindingStep(fileName = 'shot.mp4') {
  fireEvent.change(screen.getByLabelText('选择本地视频'), {
    target: { files: [new File(['video'], fileName, { type: 'video/mp4' })] }
  });
  await screen.findByRole('heading', { name: '绑定参考音频块' });
}

const leafLocaleMatrix = [
  {
    locale: 'zh-CN' as const,
    videoTitle: '导入本地视频',
    videoAction: '选择本地视频',
    videoHint: '或将 MP4、WebM、MOV 拖到这里',
    bindingTitle: '绑定参考音频块',
    bindingLegend: '选择参考音频块',
    bindingAction: '确认参考音频块',
    bindingRecovery: '尚未读取到 Suno 项目状态，请刷新一次 Studio 页面。',
    warning: '参考音频块已删除',
    rebind: '重新绑定参考音频块',
    playbackBlocked: '浏览器阻止了有声播放，请点击后继续。',
    playbackUnavailable: '本地视频无法播放。请检查文件格式，然后继续播放。',
    resume: '允许视频声音并继续',
    adapterRecovery: '无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。'
  },
  {
    locale: 'zh-TW' as const,
    videoTitle: '匯入本機影片',
    videoAction: '選擇本機影片',
    videoHint: '或將 MP4、WebM、MOV 拖放至此',
    bindingTitle: '綁定參考音訊片段',
    bindingLegend: '選擇參考音訊片段',
    bindingAction: '確認參考音訊片段',
    bindingRecovery: '尚未讀取到 Suno 專案狀態，請重新整理一次 Studio 頁面。',
    warning: '參考音訊片段已刪除',
    rebind: '重新綁定參考音訊片段',
    playbackBlocked: '瀏覽器阻擋了有聲播放，請點擊後繼續。',
    playbackUnavailable: '本機影片無法播放。請檢查檔案格式，然後繼續播放。',
    resume: '允許影片聲音並繼續',
    adapterRecovery: '無法可靠讀取 Suno Studio 傳輸列。請保持 Studio 開啟，外掛程式會繼續嘗試連線。'
  },
  {
    locale: 'en' as const,
    videoTitle: 'Import local video',
    videoAction: 'Choose local video',
    videoHint: 'Or drop an MP4, WebM, or MOV here',
    bindingTitle: 'Bind reference audio clip',
    bindingLegend: 'Choose reference audio clip',
    bindingAction: 'Confirm reference audio clip',
    bindingRecovery: 'Suno project state has not been read yet. Refresh the Studio page once.',
    warning: 'The reference audio clip was deleted',
    rebind: 'Bind reference clip again',
    playbackBlocked: 'The browser blocked audible playback. Continue with a click.',
    playbackUnavailable: 'The local video could not play. Check the file format, then continue playback.',
    resume: 'Allow video audio and continue',
    adapterRecovery: 'Suno Studio transport cannot be read reliably. Keep Studio open while the extension retries the connection.'
  }
] as const;

const bindingEmptyRecoveryCases = [
  ['waiting-for-project-state', 'Suno project state has not been read yet. Refresh the Studio page once.'],
  ['ready', 'The current timeline has no top-level audio clips to bind. Add a supported top-level audio clip in Studio, then return here or refresh the Studio page.'],
  ['unsupported-project-shape', 'This Suno project structure cannot be read safely. Open another project with a supported top-level audio clip.'],
  ['unsupported-timing', 'This Suno project timing cannot be bound safely. Open another project with supported timing.'],
  ['too-many-clips', 'This project has too many top-level audio clips to read safely. Use a project with fewer top-level audio clips.'],
  ['parse-failed', 'Suno project-state validation failed. Refresh the Studio page and try again.']
] as const;

const bindingEligibilityRecoveryCases = [
  ['warped', 'Warp is enabled. Disable Warp, then select the clip again.'],
  ['speed-changed', 'Playback speed is not 1×. Restore 1× speed, then select the clip again.'],
  ['looped', 'Looping is enabled. Disable looping, then select the clip again.'],
  ['reversed', 'The clip is reversed. Turn off Reverse, then select the clip again.'],
  ['analysis-pending', 'Warp analysis is incomplete. Wait for analysis to finish, then select the clip again.'],
  ['unsupported-mapping', 'The time mapping cannot be calculated precisely. Choose another top-level audio clip with supported timing.']
] as const;

describe('localized leaf components', () => {
  it.each(leafLocaleMatrix)(
    'localizes importer and binding copy while preserving filenames, clip labels, and ARIA names in $locale',
    ({
      locale,
      videoTitle,
      videoAction,
      videoHint,
      bindingTitle,
      bindingLegend,
      bindingAction
    }) => {
      const fileName = 'Suno cut 01.MOV';
      const clipLabel = 'Suno take 01 · Lead';
      renderWithLocale(<>
        <VideoImporter
          file={new File(['video'], fileName, { type: 'video/quicktime' })}
          onFileSelected={vi.fn()}
        />
        <BindingPicker
          clips={[{ ...candidate, label: clipLabel }]}
          bridgeStatus="ready"
          onSelect={vi.fn()}
          onConfirm={vi.fn()}
        />
      </>, locale);

      expect(screen.getByRole('region', { name: videoTitle })).toBeInTheDocument();
      expect(screen.getByLabelText(videoAction)).toHaveAttribute(
        'accept',
        'video/mp4,video/webm,video/quicktime'
      );
      expect(screen.getByText(videoHint)).toBeInTheDocument();
      expect(screen.getByText(fileName)).toHaveTextContent(fileName);
      expect(screen.getByRole('region', { name: bindingTitle })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: bindingLegend })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: new RegExp(clipLabel) })).toBeEnabled();
      expect(screen.getByRole('button', { name: bindingAction })).toBeDisabled();
    }
  );

  it.each(leafLocaleMatrix)(
    'localizes binding empty-state recovery in $locale',
    ({ locale, bindingRecovery }) => {
      renderWithLocale(<BindingPicker
        clips={[]}
        bridgeStatus="waiting-for-project-state"
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
      />, locale);

      expect(screen.getByText(bindingRecovery)).toBeInTheDocument();
    }
  );

  it.each(bindingEmptyRecoveryCases)(
    'gives $0 bridge state a factual next step',
    (bridgeStatus, recovery) => {
      renderWithLocale(<BindingPicker
        clips={[]}
        bridgeStatus={bridgeStatus}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
      />, 'en');

      expect(screen.getByText(recovery)).toBeInTheDocument();
    }
  );

  it.each(bindingEligibilityRecoveryCases)(
    'gives $0 candidate a factual next step while keeping it disabled',
    (bindingEligibility, recovery) => {
      renderWithLocale(<BindingPicker
        clips={[{ ...candidate, bindingEligibility }]}
        bridgeStatus="ready"
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
      />, 'en');

      expect(screen.getByText(recovery)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Reference audio/ })).toBeDisabled();
    }
  );

  it.each(leafLocaleMatrix)(
    'localizes warning state and its concrete recovery action in $locale',
    ({ locale, warning, rebind }) => {
      renderWithLocale(<SyncStatus
        state="warning"
        warningReason="missing"
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />, locale);

      expect(screen.getByRole('alert')).toHaveTextContent(warning);
      expect(screen.getByRole('button', { name: rebind })).toBeEnabled();
    }
  );

  it.each(leafLocaleMatrix)(
    'localizes unavailable transport state with its automatic recovery guidance in $locale',
    ({ locale, adapterRecovery }) => {
      renderWithLocale(<SyncStatus
        state="adapter-unavailable"
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />, locale);

      expect(screen.getByRole('status')).toHaveTextContent(adapterRecovery);
    }
  );

  it.each(leafLocaleMatrix)(
    'maps typed playback errors to localized recovery copy in $locale',
    ({ locale, playbackBlocked, playbackUnavailable, resume }) => {
      const rawKnown = '本地视频无法播放，请检查格式后重试。';
      const rawUnknown = 'backend player exploded';
      const { rerender } = renderWithLocale(<SyncStatus
        state="playback-blocked"
        playbackError="media-unavailable"
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />, locale);

      expect(screen.getByRole('alert')).toHaveTextContent(playbackUnavailable);
      expect(screen.getByRole('button', { name: resume })).toBeEnabled();
      expect(screen.queryByText(rawKnown)).not.toBeInTheDocument();

      rerender(<SyncStatus
        state="playback-blocked"
        playbackError="autoplay-blocked"
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />);
      expect(screen.getByRole('alert')).toHaveTextContent(playbackBlocked);
      expect(screen.queryByText(rawUnknown)).not.toBeInTheDocument();
    }
  );
});

describe('App', () => {
  it('exposes explicit CDP connect, guarded reload, and diagnostic copy actions', async () => {
    let snapshot = {
      health: 'unavailable' as const,
      bridgeStatus: 'waiting-for-project-state' as const,
      clips: [] as readonly SunoClip[],
      observedAtMs: 1,
      reason: 'No active Suno Studio tab is available.'
    };
    const connect = vi.fn(async () => {
      snapshot = {
        ...snapshot,
        observedAtMs: 2,
        reason: 'Connected to Studio; waiting for project state.'
      };
      return snapshot;
    });
    const reloadStudio = vi.fn(async () => snapshot);
    const readDiagnostics = vi.fn(async () => [{
      atMs: 2,
      category: 'transport' as const,
      code: 'inventory',
      data: { buttonCount: 18 }
    }]);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App snapshotClient={{
      readSnapshot: vi.fn(async () => snapshot),
      connect,
      reloadStudio,
      readDiagnostics
    }} />);

    fireEvent.click(await screen.findByRole('button', { name: '连接 Studio' }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: '重新加载 Studio 并读取工程' }));
    await waitFor(() => expect(reloadStudio).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '复制诊断摘要' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"buttonCount": 18')));
  });

  it('distinguishes bridge waiting from a genuinely empty project', async () => {
    installObjectURLMocks();
    const { rerender } = render(<App
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'degraded',
          bridgeStatus: 'waiting-for-project-state',
          projectTimeSeconds: 0,
          isPlaying: false,
          clips: [],
          observedAtMs: 1,
          reason: 'waiting'
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();

    expect(await screen.findByText('尚未读取到 Suno 项目状态，请刷新一次 Studio 页面。')).toBeInTheDocument();

    rerender(<App
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'healthy',
          bridgeStatus: 'ready',
          projectTimeSeconds: 0,
          isPlaying: false,
          clips: [],
          observedAtMs: 2
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    expect(await screen.findByText('当前时间轴中没有可绑定的顶层音频块。请在 Studio 中添加一个受支持的顶层音频块，然后返回插件或刷新 Studio 页面。')).toBeInTheDocument();
  });

  it('shows unsupported timing without claiming the project is empty', async () => {
    installObjectURLMocks();
    render(<App
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'degraded',
          bridgeStatus: 'unsupported-timing',
          projectTimeSeconds: 0,
          isPlaying: false,
          clips: [],
          observedAtMs: 1,
          reason: 'unsupported'
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();

    expect(await screen.findByText('当前 Suno 项目的时间模式无法安全绑定。请打开一个使用受支持时间模式的其他项目。')).toBeInTheDocument();
    expect(screen.queryByText(/没有可绑定/)).not.toBeInTheDocument();
  });

  it('reports transport and project state independently when the bridge is ready and empty', async () => {
    installObjectURLMocks();
    render(<App
      initialState="binding-required"
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'unavailable',
          bridgeStatus: 'ready',
          clips: [],
          observedAtMs: 1,
          reason: 'transport missing'
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();

    expect(await screen.findByText('无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。')).toBeInTheDocument();
    expect(screen.getByText('当前时间轴中没有可绑定的顶层音频块。请在 Studio 中添加一个受支持的顶层音频块，然后返回插件或刷新 Studio 页面。')).toBeInTheDocument();
    expect(screen.queryByText('无法可靠读取 Suno Studio，暂不能安全绑定。')).not.toBeInTheDocument();
  });

  it('keeps the project-bridge diagnosis visible when transport is also unavailable', async () => {
    installObjectURLMocks();
    render(<App
      initialState="binding-required"
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'unavailable',
          bridgeStatus: 'waiting-for-project-state',
          clips: [],
          observedAtMs: 1,
          reason: 'transport missing'
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();

    expect(await screen.findByText('无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。')).toBeInTheDocument();
    expect(screen.getByText('尚未读取到 Suno 项目状态，请刷新一次 Studio 页面。')).toBeInTheDocument();
    expect(screen.queryByText('无法可靠读取 Suno Studio，暂不能安全绑定。')).not.toBeInTheDocument();
  });

  it('keeps an unsafe candidate visible but disables confirmation', async () => {
    installObjectURLMocks();
    render(<App
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'healthy',
          bridgeStatus: 'ready',
          projectTimeSeconds: 0,
          isPlaying: false,
          clips: [{
            ...candidate,
            warped: true,
            bindingEligibility: 'warped'
          }],
          observedAtMs: 1
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();

    expect(await screen.findByText('已启用 Warp。请关闭 Warp 后重新选择该音频块。')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Reference audio/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '确认参考音频块' })).toBeDisabled();
  });

  it('does not expose the sync console before explicit reference-track confirmation', () => {
    render(<App initialState="binding-required" initialClips={[candidate]} />);

    expect(screen.queryByRole('button', { name: '开始同步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '同步偏移' })).not.toBeInTheDocument();
  });

  it('enables sync only after a local file and selected reference track are confirmed', async () => {
    installObjectURLMocks();
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });

    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    expect(screen.getByRole('button', { name: '开始同步' })).toBeEnabled();
  });

  it('clicking Resync performs a one-shot seek through the real coordinator', async () => {
    installObjectURLMocks();
    const snapshotClient = {
      readSnapshot: vi.fn(async () => ({
        health: 'healthy' as const,
        bridgeStatus: 'ready' as const,
        projectTimeSeconds: 16,
        isPlaying: true,
        clips: [candidate],
        observedAtMs: 10
      }))
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    await advanceToBindingStep();
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    let currentTime = 4.01;
    const seek = vi.fn((seconds: number) => { currentTime = seconds; });
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: seek
    });

    fireEvent.click(screen.getByRole('button', { name: '重新同步' }));

    await waitFor(() => expect(seek).toHaveBeenCalledTimes(1));
    expect(seek).toHaveBeenCalledWith(4);
    expect(snapshotClient.readSnapshot).toHaveBeenCalled();
  });

  it('prevents a stale Resync snapshot from seeking after binding revocation', async () => {
    installObjectURLMocks();
    const healthySnapshot: SunoSnapshot = {
      health: 'healthy',
      bridgeStatus: 'ready',
      projectTimeSeconds: 16,
      isPlaying: true,
      clips: [candidate],
      observedAtMs: 10
    };
    let currentSnapshot = healthySnapshot;
    let deferNextSnapshot = false;
    let markDeferredStarted!: () => void;
    let resolveDeferredSnapshot!: (snapshot: SunoSnapshot) => void;
    const deferredStarted = new Promise<void>((resolve) => {
      markDeferredStarted = resolve;
    });
    const deferredSnapshot = new Promise<SunoSnapshot>((resolve) => {
      resolveDeferredSnapshot = resolve;
    });
    const snapshotClient = {
      readSnapshot: vi.fn(() => {
        if (deferNextSnapshot) {
          deferNextSnapshot = false;
          markDeferredStarted();
          return deferredSnapshot;
        }
        return Promise.resolve(currentSnapshot);
      })
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    await advanceToBindingStep();
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const seek = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => 4.01,
      set: seek
    });
    Object.defineProperty(video, 'play', { configurable: true, value: play });

    deferNextSnapshot = true;
    fireEvent.click(screen.getByRole('button', { name: '重新同步' }));
    await deferredStarted;

    currentSnapshot = {
      ...healthySnapshot,
      clips: [{ ...candidate, warped: true, bindingEligibility: 'warped' }],
      observedAtMs: 11
    };
    expect(await screen.findByText(
      /参考音频块启用了 Warp。自动同步已暂停/,
      {},
      { timeout: 1500 }
    )).toBeVisible();

    await act(async () => {
      resolveDeferredSnapshot(healthySnapshot);
      await deferredSnapshot;
      await Promise.resolve();
    });

    expect(seek).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('自动同步已暂停');
  });

  it('preserves a confirmed bridge binding while transport remains unavailable', async () => {
    installObjectURLMocks();
    render(<App
      initialState="binding-required"
      snapshotClient={{
        readSnapshot: vi.fn(async () => ({
          health: 'unavailable',
          bridgeStatus: 'ready',
          clips: [candidate],
          observedAtMs: 1,
          reason: 'transport missing'
        }))
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    expect(await screen.findByText('无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。')).toBeInTheDocument();

    const candidateRadio = screen.getByRole('radio', { name: /Reference audio/ });
    fireEvent.click(candidateRadio);
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    });
    expect(candidateRadio).toBeChecked();
    expect(screen.getByText('无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始同步' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新绑定参考音频块' })).toBeEnabled();
  });

  it('does not pause standalone local playback while Studio transport is unavailable', async () => {
    const pause = installObjectURLMocks();
    render(<App
      initialState="binding-required"
      snapshotClient={{
        readSnapshot: vi.fn(async () => ({
          health: 'unavailable',
          bridgeStatus: 'ready',
          clips: [candidate],
          observedAtMs: 1,
          reason: 'transport missing'
        }))
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    await screen.findByText('无法可靠读取 Suno Studio 传输栏。请保持 Studio 打开，插件会继续尝试连接。');
    pause.mockClear();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    });

    expect(pause).not.toHaveBeenCalled();
  });

  it('cancels an in-flight Start when Studio transport becomes unavailable', async () => {
    installObjectURLMocks();
    let snapshot = {
      health: 'healthy' as 'healthy' | 'unavailable',
      bridgeStatus: 'ready' as const,
      projectTimeSeconds: 12,
      isPlaying: true,
      clips: [candidate] as readonly SunoClip[],
      observedAtMs: 1,
      reason: undefined as string | undefined
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={{ readSnapshot: vi.fn(async () => snapshot) }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    let resolvePlay!: () => void;
    const pendingPlay = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn(() => pendingPlay);
    const pause = vi.fn();
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    Object.defineProperty(video, 'pause', { configurable: true, value: pause });

    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    snapshot = {
      ...snapshot,
      health: 'unavailable',
      isPlaying: false,
      observedAtMs: 2,
      reason: 'transport missing'
    };

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    });
    expect(pause).toHaveBeenCalled();

    await act(async () => {
      resolvePlay();
      await pendingPlay;
    });
    expect(screen.queryByText('正在跟随 Suno Studio')).not.toBeInTheDocument();
  });

  it('automatically resumes an active sync session after a transient transport outage', async () => {
    installObjectURLMocks();
    let snapshot = {
      health: 'healthy' as 'healthy' | 'unavailable',
      bridgeStatus: 'ready' as const,
      projectTimeSeconds: 16,
      isPlaying: true,
      clips: [candidate] as readonly SunoClip[],
      observedAtMs: 1,
      reason: undefined as string | undefined
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={{ readSnapshot: vi.fn(async () => snapshot) }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(document.querySelector('#video-file') as HTMLInputElement, {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(document.querySelector('input[name="reference-clip"]') as HTMLInputElement);
    fireEvent.click(document.querySelector('.secondary-button') as HTMLButtonElement);

    const video = document.querySelector('video') as HTMLVideoElement;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    Object.defineProperty(video, 'pause', { configurable: true, value: pause });
    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });

    fireEvent.click(document.querySelector('.sync-button') as HTMLButtonElement);
    await waitFor(() => expect(document.querySelector('.status-syncing')).not.toBeNull());

    snapshot = {
      ...snapshot,
      health: 'unavailable',
      isPlaying: false,
      observedAtMs: 2,
      reason: 'transport observation is stale'
    };
    await waitFor(() => expect(document.querySelector('.status-adapter-unavailable')).not.toBeNull());
    expect(pause).toHaveBeenCalled();
    const playCountDuringOutage = play.mock.calls.length;

    snapshot = {
      ...snapshot,
      health: 'healthy',
      isPlaying: true,
      observedAtMs: 3,
      reason: undefined
    };

    await waitFor(() => expect(document.querySelector('.status-syncing')).not.toBeNull(), {
      timeout: 1_500
    });
    await waitFor(() => expect(play.mock.calls.length).toBeGreaterThan(playCountDuringOutage));
  });

  it('revokes a confirmed binding when the observed candidate becomes unsafe', async () => {
    installObjectURLMocks();
    let snapshot = {
      health: 'healthy' as const,
      bridgeStatus: 'ready' as const,
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [candidate] as readonly SunoClip[],
      observedAtMs: 10
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={{ readSnapshot: vi.fn(async () => snapshot) }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));
    expect(screen.getByRole('button', { name: '开始同步' })).toBeEnabled();

    snapshot = {
      ...snapshot,
      clips: [{ ...candidate, warped: true, bindingEligibility: 'warped' }],
      observedAtMs: 11
    };

    expect(await screen.findByRole('alert')).toHaveTextContent('参考音频块启用了 Warp');
    expect(screen.queryByRole('button', { name: '开始同步' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '绑定参考音频块' })).toBeVisible();
  });

  it('preflights the latest snapshot and never plays after route invalidation', async () => {
    installObjectURLMocks();
    let snapshot = {
      health: 'healthy' as 'healthy' | 'degraded',
      bridgeStatus: 'ready' as 'ready' | 'waiting-for-project-state',
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [candidate] as readonly SunoClip[],
      observedAtMs: 10,
      reason: undefined as string | undefined
    };
    const snapshotClient = { readSnapshot: vi.fn(async () => snapshot) };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    snapshot = {
      health: 'degraded',
      bridgeStatus: 'waiting-for-project-state',
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [],
      observedAtMs: 11,
      reason: 'route changed'
    };

    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));

    await waitFor(() => expect(
      screen.queryByRole('button', { name: '开始同步' })
    ).not.toBeInTheDocument());
    expect(play).not.toHaveBeenCalled();
  });

  it('imports a local file without exposing an absolute path', async () => {
    installObjectURLMocks();
    let resolveMetadata!: (result: typeof readyMetadata) => void;
    const metadata = new Promise<typeof readyMetadata>((resolve) => {
      resolveMetadata = resolve;
    });
    render(<App metadataReader={vi.fn(async () => metadata)} />);
    const file = new File(['video'], 'shot.mp4', { type: 'video/mp4' });

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [file] }
    });

    expect(screen.getByText('shot.mp4')).toBeInTheDocument();
    expect(screen.getByLabelText('本地视频预览')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('C:\\');

    await act(async () => resolveMetadata(readyMetadata));
  });

  it('generates and drags only an equal-duration silent WAV after metadata is ready', async () => {
    installObjectURLMocks();
    const original = new File(['original-video-audio'], 'shot.mp4', { type: 'video/mp4' });
    const silent = createSilentWavFile(
      original.name,
      readyMetadata.metadata.durationSeconds
    );
    renderWithLocale(
      <SilentReferenceCard
        state={{
          kind: 'ready',
          file: silent.file,
          durationSeconds: silent.durationSeconds
        }}
        onRetry={vi.fn()}
      />,
      'zh-CN'
    );

    expect(await screen.findByText('shot-silent-reference.wav')).toBeInTheDocument();
    const add = vi.fn();
    const dataTransfer = { items: { add }, effectAllowed: 'none' } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByTestId('silent-reference-file'), { dataTransfer });

    const dragged = add.mock.calls[0][0] as File;
    expect(dragged).not.toBe(original);
    expect(dragged.name).toBe('shot-silent-reference.wav');
    expect(dragged.type).toBe('audio/wav');
    expect(dataTransfer.effectAllowed).toBe('copy');
  });

  it('ignores stale metadata and silent files after a rapid reselect', async () => {
    installObjectURLMocks();
    let resolveFirst!: (value: typeof readyMetadata) => void;
    const firstResult = new Promise<typeof readyMetadata>((resolve) => {
      resolveFirst = resolve;
    });
    let fileInput!: HTMLElement;
    const secondFile = new File(['b'], 'second.mp4', { type: 'video/mp4' });
    const metadataReader = vi.fn()
      .mockImplementationOnce(() => {
        fireEvent.change(fileInput, { target: { files: [secondFile] } });
        return firstResult;
      })
      .mockResolvedValueOnce({
        kind: 'ready',
        metadata: { durationSeconds: 3, width: 1280, height: 720 }
      });
    render(<App metadataReader={metadataReader} />);

    fileInput = screen.getByLabelText('选择本地视频');
    fireEvent.change(fileInput, {
      target: { files: [new File(['a'], 'first.mp4', { type: 'video/mp4' })] }
    });

    await screen.findByRole('heading', { name: '绑定参考音频块' });
    resolveFirst(readyMetadata);
    await waitFor(() => expect(screen.getByLabelText('本地视频预览')).toHaveAttribute(
      'src',
      'blob:second.mp4'
    ));
    expect(metadataReader).toHaveBeenCalledTimes(2);
  });

  it('keeps the local preview when WAV capacity validation fails', async () => {
    installObjectURLMocks();
    render(<App metadataReader={vi.fn(async () => ({
      kind: 'ready',
      metadata: { durationSeconds: 100_000, width: 1920, height: 1080 }
    }))} />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'too-long.mp4', { type: 'video/mp4' })] }
    });

    expect(await screen.findByLabelText('本地视频预览')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('视频过长，无法写入标准 WAV 文件');
    expect(screen.queryByTestId('silent-reference-file')).not.toBeInTheDocument();
  });

  it('keeps preview available and offers retry when metadata cannot be read', async () => {
    installObjectURLMocks();
    render(<App metadataReader={vi.fn(async () => ({
      kind: 'unsupported-codec',
      guidance: '请转换为 MP4/H.264 或 WebM 后重试。'
    }))} />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'broken.mov', { type: 'video/quicktime' })] }
    });

    expect(await screen.findByLabelText('本地视频预览')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '无法读取视频编码或容器。请转换为 MP4/H.264 或 WebM 后重新选择文件。'
    );
    expect(screen.queryByText('请转换为 MP4/H.264 或 WebM 后重试。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新生成静音参考音频' })).toBeEnabled();
    expect(screen.queryByTestId('silent-reference-file')).not.toBeInTheDocument();
  });

  it('renders one local video above the independently scrolling settings', async () => {
    installObjectURLMocks();
    render(<App metadataReader={vi.fn(async () => readyMetadata)} />);

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });

    const video = await screen.findByLabelText('本地视频预览');
    const settings = screen.getByTestId('settings-scroll');
    expect(screen.getAllByLabelText('本地视频预览')).toHaveLength(1);
    expect(video.closest('.video-stage')?.nextElementSibling).toBe(settings);
  });

  it('prompts for a user gesture when audible playback is blocked and resumes on click', async () => {
    installObjectURLMocks();
    const snapshotClient = {
      readSnapshot: vi.fn(async () => ({
        health: 'healthy' as const,
        bridgeStatus: 'ready' as const,
        projectTimeSeconds: 12,
        isPlaying: true,
        clips: [candidate],
        observedAtMs: 10
      }))
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const blocked = new Error('gesture required');
    blocked.name = 'NotAllowedError';
    const play = vi.fn().mockRejectedValueOnce(blocked).mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    Object.defineProperty(video, 'pause', { configurable: true, value: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    const resume = await screen.findByRole('button', { name: '允许视频声音并继续' });
    expect(screen.getAllByRole('button', { name: '允许视频声音并继续' })).toHaveLength(1);
    expect(resume.compareDocumentPosition(screen.getByRole('heading', { name: '时间映射' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(resume);
    expect(await screen.findByText('正在跟随 Suno Studio')).toBeInTheDocument();
    expect(play.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('preflights Resume and does not play after the route becomes invalid', async () => {
    installObjectURLMocks();
    let snapshot = {
      health: 'healthy' as 'healthy' | 'degraded',
      bridgeStatus: 'ready' as 'ready' | 'waiting-for-project-state',
      projectTimeSeconds: 12,
      isPlaying: true,
      clips: [candidate] as readonly SunoClip[],
      observedAtMs: 10,
      reason: undefined as string | undefined
    };
    const snapshotClient = { readSnapshot: vi.fn(async () => snapshot) };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const blocked = new Error('gesture required');
    blocked.name = 'NotAllowedError';
    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn().mockRejectedValueOnce(blocked).mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    const resume = await screen.findByRole('button', { name: '允许视频声音并继续' });

    snapshot = {
      health: 'degraded',
      bridgeStatus: 'waiting-for-project-state',
      projectTimeSeconds: 12,
      isPlaying: false,
      clips: [],
      observedAtMs: 11,
      reason: 'route changed'
    };
    fireEvent.click(resume);

    await waitFor(() => expect(
      screen.queryByRole('button', { name: '开始同步' })
    ).not.toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer rapid Start success when the older playback attempt rejects later', async () => {
    installObjectURLMocks();
    let rejectFirstPlay!: (reason: Error) => void;
    const firstPlay = new Promise<void>((_resolve, reject) => {
      rejectFirstPlay = reject;
    });
    let resolveSecondPlay!: () => void;
    const secondPlay = new Promise<void>((resolve) => {
      resolveSecondPlay = resolve;
    });
    const snapshotClient = {
      readSnapshot: vi.fn(async () => ({
        health: 'healthy' as const,
        bridgeStatus: 'ready' as const,
        projectTimeSeconds: 12,
        isPlaying: true,
        clips: [candidate],
        observedAtMs: 10
      }))
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn()
      .mockImplementationOnce(() => firstPlay)
      .mockImplementationOnce(() => secondPlay)
      .mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });

    const start = screen.getByRole('button', { name: '开始同步' });
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveSecondPlay();
      await secondPlay;
    });
    expect(await screen.findByText('正在跟随 Suno Studio')).toBeInTheDocument();

    const blocked = new Error('older attempt blocked');
    blocked.name = 'NotAllowedError';
    await act(async () => {
      rejectFirstPlay(blocked);
      await firstPlay.catch(() => undefined);
    });

    expect(screen.getByText('正在跟随 Suno Studio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '允许视频声音并继续' })).not.toBeInTheDocument();
  });

  it('keeps a newer rapid recovery success when the older recovery rejects later', async () => {
    installObjectURLMocks();
    let rejectFirstRecovery!: (reason: Error) => void;
    const firstRecovery = new Promise<void>((_resolve, reject) => {
      rejectFirstRecovery = reject;
    });
    let resolveSecondRecovery!: () => void;
    const secondRecovery = new Promise<void>((resolve) => {
      resolveSecondRecovery = resolve;
    });
    const snapshotClient = {
      readSnapshot: vi.fn(async () => ({
        health: 'healthy' as const,
        bridgeStatus: 'ready' as const,
        projectTimeSeconds: 12,
        isPlaying: true,
        clips: [candidate],
        observedAtMs: 10
      }))
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'shot.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const initialBlocked = new Error('initial attempt blocked');
    initialBlocked.name = 'NotAllowedError';
    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn()
      .mockRejectedValueOnce(initialBlocked)
      .mockImplementationOnce(() => firstRecovery)
      .mockImplementationOnce(() => secondRecovery)
      .mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));

    const resume = await screen.findByRole('button', { name: '允许视频声音并继续' });
    fireEvent.click(resume);
    fireEvent.click(resume);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(3));

    await act(async () => {
      resolveSecondRecovery();
      await secondRecovery;
    });
    expect(await screen.findByText('正在跟随 Suno Studio')).toBeInTheDocument();

    const olderBlocked = new Error('older recovery blocked');
    olderBlocked.name = 'NotAllowedError';
    await act(async () => {
      rejectFirstRecovery(olderBlocked);
      await firstRecovery.catch(() => undefined);
    });

    expect(screen.getByText('正在跟随 Suno Studio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '允许视频声音并继续' })).not.toBeInTheDocument();
  });

  it('ignores a stale playback unlock after the user reselects the video', async () => {
    installObjectURLMocks();
    let resolvePlay!: () => void;
    const pendingPlay = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    const snapshotClient = {
      readSnapshot: vi.fn(async () => ({
        health: 'healthy' as const,
        bridgeStatus: 'ready' as const,
        projectTimeSeconds: 12,
        isPlaying: true,
        clips: [candidate],
        observedAtMs: 10
      }))
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    const fileInput = screen.getByLabelText('选择本地视频');
    fireEvent.change(fileInput, {
      target: { files: [new File(['first'], 'first.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    Object.defineProperty(video, 'play', { configurable: true, value: vi.fn(() => pendingPlay) });
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    fireEvent.click(screen.getByRole('button', { name: '重新选择文件' }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.mp4'));
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['second'], 'second.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });

    await act(async () => {
      resolvePlay();
      await pendingPlay;
    });

    expect(screen.getByText('请选择并明确确认一个参考音频块')).toBeInTheDocument();
    expect(screen.getByLabelText('本地视频预览')).toHaveAttribute('src', 'blob:second.mp4');
    expect(screen.queryByRole('button', { name: '开始同步' })).not.toBeInTheDocument();
  });

  it('prevents an in-flight coordinator tick from playing a reselected video', async () => {
    installObjectURLMocks();
    const snapshot = {
      health: 'healthy' as const,
      bridgeStatus: 'ready' as const,
      projectTimeSeconds: 12,
      isPlaying: true,
      clips: [candidate],
      observedAtMs: 10
    };
    let holdSnapshot = false;
    let resolveSnapshot!: (value: typeof snapshot) => void;
    let markDeferredStarted!: () => void;
    const pendingSnapshot = new Promise<typeof snapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    const deferredStarted = new Promise<void>((resolve) => {
      markDeferredStarted = resolve;
    });
    const snapshotClient = {
      readSnapshot: vi.fn(() => {
        if (holdSnapshot) {
          markDeferredStarted();
          return pendingSnapshot;
        }
        return Promise.resolve(snapshot);
      })
    };
    render(<App
      initialState="binding-required"
      initialClips={[candidate]}
      snapshotClient={snapshotClient}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);
    const fileInput = screen.getByLabelText('选择本地视频');
    fireEvent.change(fileInput, {
      target: { files: [new File(['first'], 'first.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    const video = screen.getByLabelText('本地视频预览') as HTMLVideoElement;
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'play', { configurable: true, value: play });
    holdSnapshot = true;
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    await deferredStarted;

    fireEvent.click(screen.getByRole('button', { name: '重新选择文件' }));
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['second'], 'second.mp4', { type: 'video/mp4' })] }
    });
    await screen.findByRole('heading', { name: '绑定参考音频块' });
    await act(async () => {
      resolveSnapshot(snapshot);
      await pendingSnapshot;
      await Promise.resolve();
    });

    expect(play).not.toHaveBeenCalled();
    expect(screen.getByText('请选择并明确确认一个参考音频块')).toBeInTheDocument();
    expect(screen.getByLabelText('本地视频预览')).toHaveAttribute('src', 'blob:second.mp4');
  });

  it('loads reference candidates from the live Suno snapshot client', async () => {
    installObjectURLMocks();
    render(<App
      initialState="binding-required"
      snapshotClient={{
        readSnapshot: async () => ({
          health: 'healthy',
          bridgeStatus: 'ready',
          projectTimeSeconds: 4,
          isPlaying: false,
          clips: [candidate],
          observedAtMs: 10
        })
      }}
      metadataReader={vi.fn(async () => readyMetadata)}
    />);

    await advanceToBindingStep();
    expect(await screen.findByRole('radio', { name: /Reference audio/ })).toBeEnabled();
  });

  it('moves file reauthorization recovery into the current import step without duplicating an action', () => {
    render(<App initialState="file-reauthorization-required" />);

    expect(screen.getByText('需要重新授权本地视频文件')).toBeInTheDocument();
    expect(screen.getByLabelText('选择本地视频')).toBeEnabled();
    expect(screen.queryByRole('button', { name: '重新选择文件' })).not.toBeInTheDocument();
  });

  it('keeps readiness passive when a warning still has unmet preparation steps', () => {
    render(<App initialState="warning" warningReason="missing" />);

    expect(screen.getByText(/参考音频块已删除。自动同步已停止/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新绑定参考音频块' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('选择本地视频')).toBeEnabled();
  });

  it('does not infer console prerequisites from the initial state seam alone', () => {
    render(<App initialState="sync-ready" />);

    expect(screen.queryByLabelText('Offset 毫秒')).not.toBeInTheDocument();
    expect(screen.getByLabelText('选择本地视频')).toBeEnabled();
  });

  it('shows one current live-extension preparation step and withholds the offset console', async () => {
    const snapshot: SunoSnapshot = {
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: [],
      observedAtMs: 1,
      reason: 'No active Suno Studio tab is available.'
    };
    render(<App snapshotClient={{
      readSnapshot: vi.fn(async () => snapshot),
      connect: vi.fn(async () => snapshot),
      reloadStudio: vi.fn(async () => snapshot),
      readDiagnostics: vi.fn(async () => [])
    }} />);

    await screen.findByRole('button', { name: '连接 Studio' });
    const flow = screen.getByTestId('preparation-flow');
    expect(flow.querySelectorAll('[data-state="current"]')).toHaveLength(1);
    expect(flow.querySelectorAll('[data-state="complete"]')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: '同步偏移' })).not.toBeInTheDocument();
  });

  it('keeps the generated silent handoff draggable and downloadable while binding', async () => {
    installObjectURLMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<App metadataReader={vi.fn(async () => readyMetadata)} />);

    const source = new File(['video'], 'handoff.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [source] }
    });

    expect(await screen.findByRole('heading', { name: '绑定参考音频块' })).toBeVisible();
    const handoff = screen.getByTestId('silent-reference-file');
    const download = screen.getByRole('button', { name: '下载静音 WAV' });
    expect(handoff).toBeVisible();
    expect(handoff).toHaveAttribute('draggable', 'true');
    expect(download).toBeVisible();
    expect(download).toBeEnabled();

    const add = vi.fn();
    const dataTransfer = { items: { add }, effectAllowed: 'none' } as unknown as DataTransfer;
    fireEvent.dragStart(handoff, { dataTransfer });

    expect(add).toHaveBeenCalledTimes(1);
    const dragged = add.mock.calls[0][0] as File;
    expect(dragged.name).toBe('handoff-silent-reference.wav');
    expect(dragged.type).toBe('audio/wav');
    expect(dataTransfer.effectAllowed).toBe('copy');

    fireEvent.click(download);
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(dragged);
  });

  it('progresses through prerequisites, preserves the video element, and reveals the console only when ready', async () => {
    installObjectURLMocks();
    let snapshot: SunoSnapshot = {
      health: 'unavailable',
      bridgeStatus: 'waiting-for-project-state',
      clips: [],
      observedAtMs: 1,
      reason: 'No active Suno Studio tab is available.'
    };
    let resolveMetadata!: (result: typeof readyMetadata) => void;
    const metadataPromise = new Promise<typeof readyMetadata>((resolve) => {
      resolveMetadata = resolve;
    });
    const connect = vi.fn(async () => {
      snapshot = {
        health: 'healthy',
        bridgeStatus: 'ready',
        projectTimeSeconds: 7.5,
        isPlaying: false,
        clips: [candidate],
        observedAtMs: 2
      };
      return snapshot;
    });

    const { container } = render(<App
      snapshotClient={{
        readSnapshot: vi.fn(async () => snapshot),
        connect,
        reloadStudio: vi.fn(async () => snapshot),
        readDiagnostics: vi.fn(async () => [])
      }}
      metadataReader={vi.fn(async () => metadataPromise)}
    />);

    fireEvent.click(await screen.findByRole('button', { name: '连接 Studio' }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('00:07.500')).toBeVisible();
    await waitFor(() => expect(
      screen.getByTestId('preparation-flow').querySelectorAll('[data-state="complete"]')
    ).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('选择本地视频'), {
      target: { files: [new File(['video'], 'scene.mp4', { type: 'video/mp4' })] }
    });
    const video = await screen.findByLabelText('本地视频预览');
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByTestId('preparation-flow').querySelectorAll('[data-state="complete"]')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '静音参考音频' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '绑定参考音频块' })).not.toBeInTheDocument();

    await act(async () => resolveMetadata(readyMetadata));
    expect(await screen.findByText('scene-silent-reference.wav')).toBeVisible();
    expect(screen.getByTestId('preparation-flow').querySelectorAll('[data-state="complete"]')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: '绑定参考音频块' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '导入本地视频' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Reference audio/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认参考音频块' }));

    expect(await screen.findByRole('heading', { name: '同步偏移' })).toBeVisible();
    expect(screen.queryByTestId('preparation-flow')).not.toBeInTheDocument();
    expect(screen.getByLabelText('本地视频预览')).toBe(video);
    expect(container.querySelectorAll('video')).toHaveLength(1);

    snapshot = {
      ...snapshot,
      clips: [{ ...candidate, warped: true, bindingEligibility: 'warped' }],
      observedAtMs: 3
    };
    expect(await screen.findByText(/参考音频块启用了 Warp。自动同步已暂停/, {}, { timeout: 1500 })).toBeVisible();
    expect(screen.getByLabelText('本地视频预览')).toBe(video);
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });
});
