// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeLocalesPlugin } from '../../build/chrome-locales-plugin';
import { BRAND, isSafeDeveloperUrl } from '../../src/ui/brand';
import { JedMark } from '../../src/ui/components/JedMark';

afterEach(cleanup);

const projectFile = (relativePath: string) => resolve(process.cwd(), relativePath);

const expectedLocales = {
  en: 'Score Your Video with Suno — by 达子 Jed_Wang',
  zh_CN: '直接在 Suno 中为视频配乐 — 达子 Jed_Wang',
  zh_TW: '直接在 Suno 中為影片配樂 — 达子 Jed_Wang'
} as const;

describe('JED package branding', () => {
  it('emits each source locale at the Chrome package root during builds', async () => {
    const plugin = chromeLocalesPlugin();
    const emitFile = vi.fn(() => 'asset-id');

    expect(typeof plugin.buildStart).toBe('function');
    await (plugin.buildStart as Function).call({ emitFile });

    expect(emitFile.mock.calls.map(([asset]) => asset.fileName)).toEqual([
      '_locales/en/messages.json',
      '_locales/zh_CN/messages.json',
      '_locales/zh_TW/messages.json'
    ]);
    for (const [asset] of emitFile.mock.calls) {
      expect(asset.type).toBe('asset');
      expect(asset.source.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(expectedLocales))(
    'ships complete %s Chrome package messages',
    (locale, description) => {
      const messages = JSON.parse(
        readFileSync(projectFile(`src/_locales/${locale}/messages.json`), 'utf8')
      ) as Record<string, { message: string }>;

      expect(messages).toEqual({
        extensionName: { message: 'JED Scoring' },
        extensionDescription: { message: description }
      });
      expect(Object.values(messages).every(({ message }) => message.trim().length > 0)).toBe(true);
      expect(messages.extensionDescription.message).toContain('达子 Jed_Wang');
    }
  );

  it.each([16, 32, 48, 128])('ships a non-empty %ipx PNG icon', (size) => {
    const iconPath = projectFile(`src/assets/icons/jed-${size}.png`);
    const icon = readFileSync(iconPath);

    expect(statSync(iconPath).size).toBeGreaterThan(8);
    expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('keeps the JED mark accessible and the byline out of visible vector geometry', () => {
    const svgSource = readFileSync(projectFile('src/assets/jed-mark.svg'), 'utf8');
    const componentSource = readFileSync(projectFile('src/ui/components/JedMark.tsx'), 'utf8');

    expect(svgSource).toContain('<title>JED Scoring by 达子 Jed_Wang</title>');
    expect(svgSource).toContain('viewBox="0 0 128 128"');
    expect(svgSource).not.toContain('<text');
    expect(componentSource).toContain('<title>JED Scoring by 达子 Jed_Wang</title>');
    expect(componentSource).toContain('aria-hidden="true"');
    expect(componentSource).not.toContain('<text');

    const { container } = render(<JedMark data-testid="jed-mark" />);
    const mark = container.querySelector('svg');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark?.querySelector('title')).toHaveTextContent('JED Scoring by 达子 Jed_Wang');
  });

  it('defines immutable JED product metadata and HTTPS-only developer links', () => {
    const brandSource = readFileSync(projectFile('src/ui/brand.ts'), 'utf8');
    const manifestSource = readFileSync(projectFile('src/manifest.ts'), 'utf8');
    const manifestVersion = /version:\s*'([^']+)'/.exec(manifestSource)?.[1];
    expect(manifestVersion).toBeDefined();
    const sourceManifest = { version: manifestVersion! };
    const packageJson = JSON.parse(readFileSync(projectFile('package.json'), 'utf8')) as { version: string };
    const packageLock = JSON.parse(readFileSync(projectFile('package-lock.json'), 'utf8')) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    const readme = readFileSync(projectFile('README.md'), 'utf8');

    expect(brandSource).toContain("productName: 'JED Scoring'");
    expect(brandSource).toContain("developerName: '达子 Jed_Wang'");
    expect(brandSource).toContain("versionLabel: 'V0.2.1'");
    expect(brandSource).toContain(
      "export const DEFAULT_DEVELOPER_URL = 'https://b23.tv/iNOah8D'"
    );
    expect(brandSource).toContain(
      'import.meta.env.VITE_JED_CONTACT_URL || DEFAULT_DEVELOPER_URL'
    );
    expect(brandSource).toContain(
      'import.meta.env.VITE_JED_HOMEPAGE_URL || DEFAULT_DEVELOPER_URL'
    );
    expect(brandSource).toContain('} as const;');
    expect(brandSource).toContain("new URL(value).protocol === 'https:'");
    expect(BRAND.versionLabel).toBe('V0.2.1');
    expect(sourceManifest.version).toBe('0.2.1');
    expect(packageJson.version).toBe('0.2.1');
    expect(packageLock.version).toBe('0.2.1');
    expect(packageLock.packages[''].version).toBe('0.2.1');
    expect(readme).toContain('JED Scoring V0.2.1 is a local-first Chrome/Edge Manifest V3 extension');
    expect(readme).toContain('https://b23.tv/iNOah8D');
    expect(readme).toContain('VITE_JED_CONTACT_URL');
    expect(readme).toContain('VITE_JED_HOMEPAGE_URL');
    expect(readme).toMatch(/each override is evaluated\s+independently/);
    expect(readme).toContain('unsafe explicit override fails closed');

    expect(BRAND).toEqual({
      productName: 'JED Scoring',
      developerName: '达子 Jed_Wang',
      versionLabel: 'V0.2.1',
      contactUrl: 'https://b23.tv/iNOah8D',
      homepageUrl: 'https://b23.tv/iNOah8D'
    });
    expect(isSafeDeveloperUrl('https://example.com/profile')).toBe(true);
    expect(isSafeDeveloperUrl('http://example.com/profile')).toBe(false);
    expect(isSafeDeveloperUrl('#')).toBe(false);
    expect(isSafeDeveloperUrl(undefined)).toBe(false);
  });

  it('uses JED Scoring as the side-panel document title', () => {
    const html = readFileSync(projectFile('src/sidepanel.html'), 'utf8');

    expect(html).toContain('<title>JED Scoring</title>');
  });
});
