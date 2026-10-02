import { describe, expect, it } from 'vitest';
import {
  DIRECT_MAIN_WORLD_FILE,
  addDirectMainWorldContentScript
} from '../../build/direct-main-world-plugin';

describe('addDirectMainWorldContentScript', () => {
  it('adds the self-contained observer as the exact first MAIN-world content script', () => {
    const manifest = {
      manifest_version: 3,
      side_panel: { default_path: 'src/sidepanel.html' },
      content_scripts: [{
        matches: ['https://suno.com/*'],
        js: ['assets/index-loader.js'],
        run_at: 'document_idle'
      }]
    };

    expect(addDirectMainWorldContentScript(manifest)).toEqual({
      ...manifest,
      content_scripts: [
        {
          matches: ['https://suno.com/*'],
          js: [DIRECT_MAIN_WORLD_FILE],
          run_at: 'document_start',
          world: 'MAIN'
        },
        ...manifest.content_scripts
      ]
    });
  });
});
