import { describe, expect, it } from 'vitest';
import manifest from '../../src/manifest';

describe('manifest', () => {
  it('uses localized JED package copy and the checked-in icon set', () => {
    const icons = {
      16: 'src/assets/icons/jed-16.png',
      32: 'src/assets/icons/jed-32.png',
      48: 'src/assets/icons/jed-48.png',
      128: 'src/assets/icons/jed-128.png'
    };

    expect(manifest.name).toBe('__MSG_extensionName__');
    expect(manifest.description).toBe('__MSG_extensionDescription__');
    expect(manifest.default_locale).toBe('en');
    expect(manifest.icons).toEqual(icons);

    if (manifest.action) {
      expect(manifest.action.default_icon).toEqual(icons);
    }
  });

  it('uses MV3, the CDP service worker, and the exact Suno host permission', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage', 'sidePanel', 'debugger', 'tabs']);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).toEqual(['https://suno.com/*']);
    expect(manifest.background).toEqual({
      service_worker: 'src/background/index.ts',
      type: 'module'
    });
    expect(manifest.side_panel?.default_path).toBe('src/sidepanel.html');
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://suno.com/*'],
        js: ['src/content/index.ts'],
        run_at: 'document_idle'
      }
    ]);
    expect(manifest.content_scripts?.some((script) => script.world === 'MAIN')).toBe(false);
  });
});
