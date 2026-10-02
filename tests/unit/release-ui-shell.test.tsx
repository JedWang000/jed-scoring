// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceTrackBinding } from '../../src/shared/types';
import { BRAND } from '../../src/ui/brand';
import { ActionZone } from '../../src/ui/components/ActionZone';
import { BrandHeader } from '../../src/ui/components/BrandHeader';
import { DeveloperFooter } from '../../src/ui/components/DeveloperFooter';
import { OffsetControl } from '../../src/ui/components/OffsetControl';
import { PreparationFlow } from '../../src/ui/components/PreparationFlow';
import { ReadinessZone } from '../../src/ui/components/ReadinessZone';
import { TimeMapping } from '../../src/ui/components/TimeMapping';
import { VideoStage } from '../../src/ui/components/VideoStage';
import type { PresentationPhase } from '../../src/ui/model/presentation-state';
import { renderWithLocale } from '../helpers/render-with-locale';

afterEach(cleanup);

describe('BrandHeader', () => {
  it.each([
    ['zh-CN', '直接在 Suno 中为视频配乐', '语言', '版本 V0.2.1'],
    ['zh-TW', '直接在 Suno 中為影片配樂', '語言', '版本 V0.2.1'],
    ['en', 'Score Your Video with Suno', 'Language', 'Version V0.2.1']
  ] as const)(
    'keeps the product identity fixed while localizing its %s shell copy',
    (locale, tagline, languageLabel, versionLabel) => {
      const { container } = renderWithLocale(<BrandHeader />, locale);

      expect(screen.getByRole('heading', { name: BRAND.productName })).toBeVisible();
      expect(screen.getByText(tagline)).toBeVisible();
      expect(screen.getByLabelText(languageLabel)).toHaveRole('combobox');
      expect(screen.getByText(versionLabel)).toBeVisible();
      expect(container.querySelector('svg')).toBeInTheDocument();
    }
  );

  it('uses one native three-choice control and switches the complete header locale', () => {
    renderWithLocale(<BrandHeader />, 'en');
    const localeSelect = screen.getByRole('combobox', { name: 'Language' });

    expect(localeSelect.tagName).toBe('SELECT');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '简体中文',
      '繁體中文',
      'English'
    ]);

    fireEvent.change(localeSelect, { target: { value: 'zh-TW' } });

    expect(screen.getByRole('combobox', { name: '語言' })).toHaveValue('zh-TW');
    expect(screen.getByText('直接在 Suno 中為影片配樂')).toBeVisible();
    expect(screen.getByRole('heading', { name: BRAND.productName })).toBeVisible();
  });
});

describe('DeveloperFooter', () => {
  it.each([
    ['zh-CN', '联系开发者', '开发者主页', '尚未配置开发者链接'],
    ['zh-TW', '聯絡開發者', '開發者首頁', '尚未設定開發者連結'],
    ['en', 'Contact developer', 'Developer homepage', 'Developer link not configured']
  ] as const)(
    'reserves non-interactive developer details in %s when explicit links are absent',
    (locale, contactLabel, homepageLabel, unconfigured) => {
      renderWithLocale(<DeveloperFooter contactUrl="" homepageUrl="" />, locale);

      expect(screen.getByText(new RegExp(BRAND.developerName))).toBeVisible();
      const contactSlot = screen.getByTestId('developer-contact');
      const homepageSlot = screen.getByTestId('developer-homepage');
      expect(contactSlot.tagName).toBe('SPAN');
      expect(homepageSlot.tagName).toBe('SPAN');
      expect(contactSlot).toHaveTextContent(`${contactLabel}: ${unconfigured}`);
      expect(homepageSlot).toHaveTextContent(`${homepageLabel}: ${unconfigured}`);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    }
  );

  it('renders only valid HTTPS destinations as protected new-tab links', () => {
    renderWithLocale(
      <DeveloperFooter
        contactUrl="https://example.com/contact"
        homepageUrl="https://example.com/home"
      />,
      'en'
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/contact',
      'https://example.com/home'
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it.each(['http://example.com', 'javascript:alert(1)', 'not a URL', ''])(
    'does not create a false control for unsafe destination %j',
    (unsafeUrl) => {
      renderWithLocale(
        <DeveloperFooter contactUrl={unsafeUrl} homepageUrl={unsafeUrl} />,
        'en'
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('developer-contact').tagName).toBe('SPAN');
      expect(screen.getByTestId('developer-homepage').tagName).toBe('SPAN');
    }
  );
});

describe('progressive preparation and full-width console', () => {
  it('renders completed preparation summaries, expands only the current step, and omits future steps', () => {
    const phase: Extract<PresentationPhase, { kind: 'preparation' }> = {
      kind: 'preparation',
      completed: ['connect-studio', 'import-video'],
      current: 'prepare-reference'
    };

    renderWithLocale(
      <PreparationFlow
        phase={phase}
        steps={{
          'connect-studio': <div data-testid="connect-content" />,
          'import-video': <div data-testid="import-content" />,
          'prepare-reference': <div data-testid="reference-content" />,
          'bind-reference': <div data-testid="binding-content" />
        }}
      />,
      'en'
    );

    const flow = screen.getByTestId('preparation-flow');
    expect(flow.querySelectorAll('[data-state="complete"]')).toHaveLength(2);
    expect(flow.querySelectorAll('[data-state="current"]')).toHaveLength(1);
    expect(screen.getByTestId('reference-content')).toBeVisible();
    expect(screen.queryByTestId('connect-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('binding-content')).not.toBeInTheDocument();
  });

  it('keeps one local video in the stage and reports the last observed Studio time without a live region', () => {
    const videoRef = createRef<HTMLVideoElement>();

    const { container } = renderWithLocale(
      <VideoStage
        previewURL="blob:scene.mp4"
        videoRef={videoRef}
        studioTimeSeconds={61.234}
      />,
      'en'
    );

    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByText('Suno Studio is the master clock')).toBeVisible();
    const observedTime = screen.getByText('01:01.234');
    expect(observedTime).toHaveClass('numeric');
    expect(observedTime).not.toHaveAttribute('aria-live');
  });

  it('keeps readiness passive while the recovery action is owned elsewhere', () => {
    renderWithLocale(
      <ReadinessZone
        state="warning"
        warningReason="missing"
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />,
      'en'
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The reference audio clip was deleted');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows video start, bound Studio position, exact offset, and lock state without changing the mapping', () => {
    const binding: ReferenceTrackBinding = {
      clipId: 'clip-1',
      clipStartSeconds: 12.345,
      clipDurationSeconds: 30,
      trimStartSeconds: 0,
      speed: 1,
      warped: false,
      confirmedAtMs: 1
    };

    renderWithLocale(
      <TimeMapping binding={binding} offsetMs={-33.333} locked />,
      'en'
    );

    expect(screen.getByText('00:00.000')).toBeVisible();
    expect(screen.getByText('00:12.345')).toBeVisible();
    expect(screen.getByText('-33.333 ms')).toBeVisible();
    expect(screen.getByText('Locked to confirmed reference')).toBeVisible();
    expect(binding.clipStartSeconds).toBe(12.345);
  });

  it('preserves exact frame and millisecond adjustments, numeric input, reset, and resync callbacks', () => {
    const onOffsetChange = vi.fn();
    const onResync = vi.fn();
    renderWithLocale(
      <OffsetControl
        canResync
        offsetMs={12.345}
        onOffsetChange={onOffsetChange}
        onResync={onResync}
      />,
      'en'
    );

    const input = screen.getByLabelText('Offset in milliseconds');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).not.toHaveAttribute('role', 'spinbutton');
    expect(input).not.toHaveAttribute('aria-valuenow');
    expect((input as HTMLInputElement).value).toBe('12.345');

    fireEvent.click(screen.getByRole('button', { name: 'Increase sync offset by 1 frame' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease sync offset by 10 ms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase sync offset by 50 ms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase sync offset by 100 ms' }));
    fireEvent.change(input, { target: { value: '7.125' } });
    expect(onOffsetChange).toHaveBeenCalledTimes(4);
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Reset offset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resync' }));

    const values = onOffsetChange.mock.calls.map(([value]) => value as number);
    expect(values).toHaveLength(6);
    expect(values[0]).toBeCloseTo(45.678, 6);
    expect(values[1]).toBeCloseTo(2.345, 6);
    expect(values[2]).toBeCloseTo(62.345, 6);
    expect(values[3]).toBeCloseTo(112.345, 6);
    expect(values.slice(4)).toEqual([7.125, 0]);
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('keeps partial Offset drafts local, commits finite decimals, and restores invalid input accessibly', () => {
    const onOffsetChange = vi.fn();
    renderWithLocale(
      <OffsetControl
        canResync
        offsetMs={12.345}
        onOffsetChange={onOffsetChange}
        onResync={vi.fn()}
      />,
      'en'
    );

    const input = screen.getByRole('textbox', { name: 'Offset in milliseconds' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-' } });
    expect(input).toHaveValue('-');
    expect(onOffsetChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '1.' } });
    expect(input).toHaveValue('1.');
    expect(onOffsetChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '-7.125' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOffsetChange).toHaveBeenCalledWith(-7.125);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('12.345');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid offset in milliseconds. The previous value was restored.'
    );
  });

  it.each([
    ['warning', 'Bind reference clip again', 'rebind'],
    ['adapter-unavailable', 'Bind reference clip again', 'rebind'],
    ['file-reauthorization-required', 'Choose file again', 'reselect']
  ] as const)(
    'exposes exactly one existing recovery action for %s',
    (state, label, callback) => {
      const onRebind = vi.fn();
      const onReselectFile = vi.fn();
      const onResumePlayback = vi.fn();
      renderWithLocale(
        <ActionZone
          state={state}
          canSync={false}
          onStart={vi.fn()}
          onRebind={onRebind}
          onReselectFile={onReselectFile}
          onResumePlayback={onResumePlayback}
        />,
        'en'
      );

      const zone = screen.getByTestId('action-zone');
      expect(within(zone).getAllByRole('button')).toHaveLength(1);
      fireEvent.click(within(zone).getByRole('button', { name: label }));
      expect({
        rebind: onRebind,
        reselect: onReselectFile,
        resume: onResumePlayback
      }[callback]).toHaveBeenCalledTimes(1);
    }
  );

  it('shows disabled localized progress while syncing without inventing stop or pause', () => {
    renderWithLocale(
      <ActionZone
        state="syncing"
        canSync
        onStart={vi.fn()}
        onRebind={vi.fn()}
        onReselectFile={vi.fn()}
        onResumePlayback={vi.fn()}
      />,
      'en'
    );

    expect(screen.getByRole('button', { name: 'Syncing with Suno Studio' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /stop|pause/i })).not.toBeInTheDocument();
  });

  it('keeps file reselection as a secondary existing action beside the sync-ready primary action', () => {
    const onStart = vi.fn();
    const onReselectFile = vi.fn();
    renderWithLocale(
      <ActionZone
        state="sync-ready"
        canSync
        onStart={onStart}
        onRebind={vi.fn()}
        onReselectFile={onReselectFile}
        onResumePlayback={vi.fn()}
      />,
      'en'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose file again' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onReselectFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Start sync' })).toHaveClass('sync-button');
    expect(screen.getByRole('button', { name: 'Choose file again' })).not.toHaveClass('sync-button');
  });
});
