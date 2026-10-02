import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyDist } from '../../scripts/verify-dist.mjs';

const directMainWorldFile = 'assets/main-world-direct.js';
const iconPaths = {
  16: 'src/assets/icons/jed-16.png',
  32: 'src/assets/icons/jed-32.png',
  48: 'src/assets/icons/jed-48.png',
  128: 'src/assets/icons/jed-128.png'
} as const;

const localeMessages = {
  en: {
    extensionName: {
      message: 'JED Scoring',
      description: 'The extension product name',
      placeholders: {
        product: { content: 'JED Scoring', example: 'JED Scoring' }
      }
    },
    extensionDescription: { message: 'Score Your Video with Suno — by 达子 Jed_Wang' }
  },
  zh_CN: {
    extensionName: { message: 'JED Scoring' },
    extensionDescription: { message: '直接在 Suno 中为视频配乐 — 达子 Jed_Wang' }
  },
  zh_TW: {
    extensionName: { message: 'JED Scoring' },
    extensionDescription: { message: '直接在 Suno 中為影片配樂 — 达子 Jed_Wang' }
  }
} as const;

const validManifest = {
  manifest_version: 3,
  name: '__MSG_extensionName__',
  description: '__MSG_extensionDescription__',
  default_locale: 'en',
  version: '0.2.1',
  icons: iconPaths,
  permissions: ['storage', 'sidePanel', 'debugger', 'tabs'],
  host_permissions: ['https://suno.com/*'],
  background: { service_worker: 'service-worker-loader.js', type: 'module' },
  side_panel: { default_path: 'src/sidepanel.html' },
  content_scripts: [
    {
      matches: ['https://suno.com/*'],
      js: [directMainWorldFile],
      run_at: 'document_start',
      world: 'MAIN'
    },
    {
      matches: ['https://suno.com/*'],
      js: ['assets/index-loader.js'],
      run_at: 'document_idle'
    }
  ],
  web_accessible_resources: [{
    matches: ['https://suno.com/*'],
    resources: ['assets/index.js'],
    use_dynamic_url: true
  }]
};

const validViteManifest = {
  'src/background/index.ts': {
    file: 'assets/background.js',
    src: 'src/background/index.ts',
    isEntry: true
  },
  'src/content/index.ts': {
    file: 'assets/index.js',
    src: 'src/content/index.ts',
    isEntry: true
  },
  'src/sidepanel.html': {
    file: 'assets/sidepanel.js',
    src: 'src/sidepanel.html',
    isEntry: true,
    css: ['assets/sidepanel.css']
  }
};

const observerMarkers = [
  'studio-api-prod.suno.com',
  'save-project',
  'suno-video-sync.page-bridge'
];

const fixtureFiles: Record<string, string> = {
  [directMainWorldFile]: `(()=>{${observerMarkers.join(';')}})();`,
  'service-worker-loader.js': "import './assets/background.js';",
  'assets/background.js': [
    'suno-video-sync:background-request/v1',
    'Network.loadingFinished',
    'Network.getRequestPostData',
    'Network.getResponseBody',
    'Runtime.addBinding'
  ].join(' '),
  'assets/index-loader.js': 'chrome.runtime.getURL("assets/index.js")',
  'assets/index.js': [
    'suno-video-sync:snapshot-request/v1',
    'suno-video-sync:snapshot-response/v1',
    'waiting-for-project-state'
  ].join(' '),
  'assets/sidepanel.js': [
    '静音参考音频',
    '下载静音 WAV',
    '原视频与声音仅在本机播放',
    '静音本地视频',
    '弹出视频画面',
    '确认参考音频块',
    'Offset 毫秒',
    '允许视频声音并继续',
    '无法可靠读取 Suno Studio 传输栏',
    'adapter-unavailable'
  ].join(' '),
  'assets/sidepanel.css': '.video-dock{position:sticky}',
  'src/sidepanel.html': '<script type="module" src="/assets/sidepanel.js"></script><link rel="stylesheet" href="/assets/sidepanel.css">',
  ...Object.fromEntries(Object.entries(localeMessages).map(([locale, messages]) => [
    `_locales/${locale}/messages.json`,
    JSON.stringify(messages)
  ])),
  ...Object.fromEntries(Object.values(iconPaths).map((path) => [path, 'png']))
};

async function writeFixtureFile(root: string, path: string, contents: string): Promise<void> {
  const absolutePath = join(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
}

async function createValidDistFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'suno-video-sync-dist-'));
  await writeFixtureFile(root, 'manifest.json', JSON.stringify(validManifest));
  await writeFixtureFile(root, '.vite/manifest.json', JSON.stringify(validViteManifest));
  await Promise.all(Object.entries(fixtureFiles).map(
    ([path, contents]) => writeFixtureFile(root, path, contents)
  ));
  return root;
}

describe('verifyDist', () => {
  it('accepts a complete least-privilege extension package', async () => {
    const root = await createValidDistFixture();

    await expect(verifyDist(root)).resolves.toMatchObject({
      manifestScripts: 2,
      featureMarkers: 10
    });
  });

  it('rejects a built manifest from the previous 0.2.0 release', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      version: '0.2.0'
    }));

    await expect(verifyDist(root)).rejects.toThrow(/0\.2\.1/);
  });

  it('rejects a direct MAIN-world script that depends on chrome.runtime', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, directMainWorldFile, 'chrome.runtime.getURL("x")');

    await expect(verifyDist(root)).rejects.toThrow(/MAIN-world.*chrome\.runtime/);
  });

  it.each([
    ['dynamic import', 'import("./observer-chunk.js")'],
    ['minified static import', 'import{x}from"./observer-chunk.js"'],
    ['minified export', 'const x=1;export{x}']
  ])('rejects a MAIN-world script containing %s', async (_name, moduleSyntax) => {
    const root = await createValidDistFixture();
    await writeFixtureFile(
      root,
      directMainWorldFile,
      `${fixtureFiles[directMainWorldFile]} ${moduleSyntax}`
    );

    await expect(verifyDist(root)).rejects.toThrow(/MAIN-world.*self-contained/);
  });

  it('rejects missing manifest resources', async () => {
    const root = await createValidDistFixture();
    await rm(join(root, 'assets/index.js'));

    await expect(verifyDist(root)).rejects.toThrow(/Missing extension resource.*index\.js/);
  });

  it('rejects a missing required Chrome locale catalog', async () => {
    const root = await createValidDistFixture();
    await rm(join(root, '_locales/zh_TW/messages.json'));

    await expect(verifyDist(root)).rejects.toThrow(/Missing extension resource.*_locales.*zh_TW/i);
  });

  it('rejects a locale catalog that cannot resolve a manifest token', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, '_locales/zh_CN/messages.json', JSON.stringify({
      extensionName: { message: 'JED Scoring' }
    }));

    await expect(verifyDist(root)).rejects.toThrow(/extensionDescription.*zh_CN/i);
  });

  it.each([
    ['an array catalog', [], /Chrome locale en catalog.*plain object/i],
    [
      'a non-object message entry',
      {
        extensionName: 'JED Scoring',
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName.*plain object/i
    ],
    [
      'an empty message',
      {
        extensionName: { message: '   ' },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName.*message.*non-empty string/i
    ],
    [
      'a non-string description',
      {
        extensionName: { message: 'JED Scoring', description: 42 },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName.*description.*string/i
    ],
    [
      'an array placeholders collection',
      {
        extensionName: { message: 'JED Scoring', placeholders: [] },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName.*placeholders.*plain object/i
    ],
    [
      'a non-object placeholder entry',
      {
        extensionName: {
          message: 'JED Scoring',
          placeholders: { product: 'JED Scoring' }
        },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName placeholder product.*plain object/i
    ],
    [
      'an empty placeholder content',
      {
        extensionName: {
          message: 'JED Scoring',
          placeholders: { product: { content: '' } }
        },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName placeholder product.*content.*non-empty string/i
    ],
    [
      'a non-string placeholder example',
      {
        extensionName: {
          message: 'JED Scoring',
          placeholders: { product: { content: 'JED Scoring', example: 42 } }
        },
        extensionDescription: localeMessages.en.extensionDescription
      },
      /Chrome locale en entry extensionName placeholder product.*example.*string/i
    ]
  ])('rejects Chrome messages with %s', async (_label, messages, errorPattern) => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, '_locales/en/messages.json', JSON.stringify(messages));

    await expect(verifyDist(root)).rejects.toThrow(errorPattern as RegExp);
  });

  it('rejects a missing required JED icon', async () => {
    const root = await createValidDistFixture();
    await rm(join(root, iconPaths[48]));

    await expect(verifyDist(root)).rejects.toThrow(/Missing extension resource.*jed-48\.png/i);
  });

  it('rejects a missing CDP background entry chunk', async () => {
    const root = await createValidDistFixture();
    await rm(join(root, 'assets/background.js'));

    await expect(verifyDist(root)).rejects.toThrow(/Missing extension resource.*background\.js/);
  });

  it.each([
    'Network.getResponseBody',
    'Runtime.addBinding'
  ])('rejects a background package missing %s', async (marker) => {
    const root = await createValidDistFixture();
    await writeFixtureFile(
      root,
      'assets/background.js',
      fixtureFiles['assets/background.js'].replace(marker, '')
    );

    await expect(verifyDist(root)).rejects.toThrow(new RegExp(marker.replace('.', '\\.')));
  });

  it('rejects a manifest without the module background service worker', async () => {
    const root = await createValidDistFixture();
    const { background: _background, ...withoutBackground } = validManifest;
    await writeFixtureFile(root, 'manifest.json', JSON.stringify(withoutBackground));

    await expect(verifyDist(root)).rejects.toThrow(/background|service.worker/i);
  });

  it('rejects expanded permissions', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      permissions: [...validManifest.permissions, 'cookies']
    }));

    await expect(verifyDist(root)).rejects.toThrow(/permissions/);
  });

  it.each([
    ['optional_permissions', ['cookies']],
    ['optional_host_permissions', ['https://evil.example/*']]
  ] as const)('rejects manifest field %s', async (field, value) => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      [field]: value
    }));

    await expect(verifyDist(root)).rejects.toThrow(new RegExp(field));
  });

  it.each([
    ['wrong match scope', { matches: ['https://example.com/*'] }],
    ['late MAIN injection', { run_at: 'document_idle' }],
    ['wrong execution world', { world: 'ISOLATED' }]
  ])('rejects %s in final content scripts', async (_name, override) => {
    const root = await createValidDistFixture();
    const [main, adapter] = validManifest.content_scripts;
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      content_scripts: [{ ...main, ...override }, adapter]
    }));

    await expect(verifyDist(root)).rejects.toThrow(/content_scripts/);
  });

  it('rejects adapter chunks missing from the Suno-scoped web resources', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      web_accessible_resources: [{
        ...validManifest.web_accessible_resources[0],
        resources: []
      }]
    }));

    await expect(verifyDist(root)).rejects.toThrow(/web_accessible_resources.*index\.js/);
  });

  it('rejects a manifest that points the side panel at a different page', async () => {
    const root = await createValidDistFixture();
    await writeFixtureFile(root, 'src/blank.html', '<p>blank</p>');
    await writeFixtureFile(root, 'manifest.json', JSON.stringify({
      ...validManifest,
      side_panel: { default_path: 'src/blank.html' }
    }));

    await expect(verifyDist(root)).rejects.toThrow(/side_panel\.default_path/);
  });
});
