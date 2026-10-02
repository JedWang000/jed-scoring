// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioConnectionCard } from '../../src/ui/components/StudioConnectionCard';
import { renderWithLocale } from '../helpers/render-with-locale';

const localeMatrix = [
  {
    locale: 'zh-CN' as const,
    title: 'Studio 连接',
    connect: '连接 Studio',
    notConnected: '尚未连接到当前 Suno Studio 标签页。',
    ready: 'Studio 工程状态已读取。',
    debuggerRecovery: 'Studio 调试连接正被 DevTools 或其他调试器占用。请关闭占用连接的工具，然后重新连接 Studio。',
    unknownRecovery: '无法读取 Studio 工程状态。请检查工程；如果问题持续，请复制诊断摘要。',
    copy: '复制诊断摘要',
    copyFailed: '无法复制诊断摘要，请重试。'
  },
  {
    locale: 'zh-TW' as const,
    title: 'Studio 連線',
    connect: '連線 Studio',
    notConnected: '尚未連線至目前的 Suno Studio 分頁。',
    ready: '已讀取 Studio 專案狀態。',
    debuggerRecovery: 'Studio 偵錯連線正由 DevTools 或其他偵錯工具使用。請關閉占用連線的工具，然後重新連線 Studio。',
    unknownRecovery: '無法讀取 Studio 專案狀態。請檢查專案；如果問題持續，請複製診斷摘要。',
    copy: '複製診斷摘要',
    copyFailed: '無法複製診斷摘要，請重試。'
  },
  {
    locale: 'en' as const,
    title: 'Studio connection',
    connect: 'Connect Studio',
    notConnected: 'Not connected to the current Suno Studio tab.',
    ready: 'Studio project state is available.',
    debuggerRecovery: 'The Studio debugging connection is in use by DevTools or another debugger. Close the tool using it, then connect Studio again.',
    unknownRecovery: 'Studio project state could not be read. Check the project, then copy diagnostics if the problem continues.',
    copy: 'Copy diagnostics summary',
    copyFailed: 'Could not copy the diagnostics summary. Try again.'
  }
] as const;

afterEach(cleanup);

describe('StudioConnectionCard', () => {
  it.each(localeMatrix)(
    'localizes connection state, actions, recovery copy, and ARIA naming in $locale',
    async ({ locale, title, connect, notConnected, copy, copyFailed }) => {
      renderWithLocale(<StudioConnectionCard
        bridgeStatus="waiting-for-project-state"
        reason="No active Suno Studio tab is available."
        onConnect={vi.fn()}
        onReload={vi.fn()}
        onCopyDiagnostics={vi.fn(async () => false)}
      />, locale);

      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
      expect(screen.getByText(notConnected)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: connect })).toBeEnabled();
      expect(screen.queryByText('No active Suno Studio tab is available.')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: copy }));
      expect(await screen.findByRole('alert')).toHaveTextContent(copyFailed);
    }
  );

  it.each(localeMatrix)(
    'uses a safe project-state recovery for an unknown reason in $locale',
    ({ locale, unknownRecovery, copy }) => {
      const rawReason = 'Unsupported timing details changed upstream.';
      renderWithLocale(<StudioConnectionCard
        bridgeStatus="unsupported-timing"
        reason={rawReason}
        onConnect={vi.fn()}
        onReload={vi.fn()}
        onCopyDiagnostics={vi.fn()}
      />, locale);

      expect(screen.getByText(unknownRecovery)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: copy })).toBeEnabled();
      expect(screen.queryByText(rawReason)).not.toBeInTheDocument();
    }
  );

  it.each(localeMatrix)(
    'keeps the project-loaded message for an unknown ready-state transport reason in $locale',
    ({ locale, ready, unknownRecovery }) => {
      const rawReason = 'Studio transport observation is stale.';
      renderWithLocale(<StudioConnectionCard
        bridgeStatus="ready"
        reason={rawReason}
        onConnect={vi.fn()}
        onReload={vi.fn()}
        onCopyDiagnostics={vi.fn()}
      />, locale);

      expect(screen.getByText(ready)).toBeInTheDocument();
      expect(screen.queryByText(unknownRecovery)).not.toBeInTheDocument();
      expect(screen.queryByText(rawReason)).not.toBeInTheDocument();
    }
  );

  it.each(localeMatrix)(
    'localizes the debugger conflict reason and concrete recovery in $locale',
    ({ locale, debuggerRecovery }) => {
      renderWithLocale(<StudioConnectionCard
        bridgeStatus="waiting-for-project-state"
        reason="The Studio debugging target is already in use."
        onConnect={vi.fn()}
        onReload={vi.fn()}
        onCopyDiagnostics={vi.fn()}
      />, locale);

      expect(screen.getByText(debuggerRecovery)).toBeInTheDocument();
      expect(screen.queryByText('The Studio debugging target is already in use.')).not.toBeInTheDocument();
    }
  );

  it('connects and copies diagnostics through explicit user actions', async () => {
    const onConnect = vi.fn(async () => undefined);
    const onCopyDiagnostics = vi.fn(async () => true);
    renderWithLocale(<StudioConnectionCard
      bridgeStatus="waiting-for-project-state"
      reason="No active Suno Studio tab is available."
      onConnect={onConnect}
      onReload={vi.fn()}
      onCopyDiagnostics={onCopyDiagnostics}
    />, 'zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '连接 Studio' }));
    fireEvent.click(screen.getByRole('button', { name: '复制诊断摘要' }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onCopyDiagnostics).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('诊断摘要已复制。')).toBeInTheDocument();
  });

  it('requires confirmation before asking the client to reload Studio', async () => {
    const onReload = vi.fn(async () => undefined);
    const confirmReload = vi.fn(() => false);
    renderWithLocale(<StudioConnectionCard
      bridgeStatus="waiting-for-project-state"
      reason="Connected to Studio; waiting for project state."
      onConnect={vi.fn()}
      onReload={onReload}
      onCopyDiagnostics={vi.fn()}
      confirmReload={confirmReload}
    />, 'zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '重新加载 Studio 并读取工程' }));

    expect(confirmReload).toHaveBeenCalledWith(
      '重新加载可能丢失 Suno Studio 中尚未保存的更改。确认继续吗？'
    );
    expect(onReload).not.toHaveBeenCalled();
  });

  it('runs reload after confirmation and reports a copy failure', async () => {
    const onReload = vi.fn(async () => undefined);
    renderWithLocale(<StudioConnectionCard
      bridgeStatus="waiting-for-project-state"
      reason="Connected to Studio; waiting for project state."
      onConnect={vi.fn()}
      onReload={onReload}
      onCopyDiagnostics={vi.fn(async () => false)}
      confirmReload={() => true}
    />, 'zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '重新加载 Studio 并读取工程' }));
    fireEvent.click(screen.getByRole('button', { name: '复制诊断摘要' }));

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('无法复制诊断摘要，请重试。')).toBeInTheDocument();
  });
});
