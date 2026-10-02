import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extensionName__',
  description: '__MSG_extensionDescription__',
  default_locale: 'en',
  version: '0.2.1',
  icons: {
    16: 'src/assets/icons/jed-16.png',
    32: 'src/assets/icons/jed-32.png',
    48: 'src/assets/icons/jed-48.png',
    128: 'src/assets/icons/jed-128.png'
  },
  permissions: ['storage', 'sidePanel', 'debugger', 'tabs'],
  host_permissions: ['https://suno.com/*'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  side_panel: { default_path: 'src/sidepanel.html' },
  content_scripts: [
    {
      matches: ['https://suno.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    }
  ]
});
