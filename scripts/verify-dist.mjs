import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { init as initModuleLexer, parse as parseModule } from 'es-module-lexer';

const DIRECT_MAIN_WORLD_FILE = 'assets/main-world-direct.js';
const SUNO_MATCH = 'https://suno.com/*';
const REQUIRED_LOCALES = ['en', 'zh_CN', 'zh_TW'];
const REQUIRED_ICONS = {
  16: 'src/assets/icons/jed-16.png',
  32: 'src/assets/icons/jed-32.png',
  48: 'src/assets/icons/jed-48.png',
  128: 'src/assets/icons/jed-128.png'
};
const REQUIRED_ENTRIES = {
  background: 'src/background/index.ts',
  adapter: 'src/content/index.ts',
  sidepanel: 'src/sidepanel.html'
};

const FEATURE_MARKERS = [
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
];

function extensionPath(distRoot, resource) {
  assert.equal(typeof resource, 'string', 'Extension resource path must be a string');
  const normalized = resource.startsWith('/') ? resource.slice(1) : resource;
  assert.ok(normalized.length > 0, 'Extension resource path must not be empty');
  assert.equal(isAbsolute(normalized), false, `Extension resource must be relative: ${resource}`);
  const absolutePath = resolve(distRoot, normalized);
  const pathFromRoot = relative(distRoot, absolutePath);
  assert.ok(
    pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot),
    `Extension resource escapes dist: ${resource}`
  );
  return { absolutePath, normalized };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function requireResource(distRoot, resource, resources) {
  const { absolutePath, normalized } = extensionPath(distRoot, resource);
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`Missing extension resource: ${normalized}`);
  }
  resources.add(normalized);
  return absolutePath;
}

function collectManifestResources(manifest) {
  const resources = [];
  if (manifest.background?.service_worker) resources.push(manifest.background.service_worker);
  for (const contentScript of manifest.content_scripts ?? []) {
    resources.push(...(contentScript.js ?? []), ...(contentScript.css ?? []));
  }
  if (manifest.side_panel?.default_path) resources.push(manifest.side_panel.default_path);
  for (const group of manifest.web_accessible_resources ?? []) {
    resources.push(...(group.resources ?? []));
  }
  return resources;
}

function runtimeGetURLTargets(code) {
  return [...code.matchAll(/chrome\.runtime\.getURL\(\s*["']([^"']+)["']\s*\)/g)]
    .map((match) => match[1]);
}

function htmlResourceTargets(code) {
  return [...code.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:[a-z][a-z\d+.-]*:|#)/i.test(value));
}

function assertFinalContentScripts(manifest) {
  const scripts = manifest.content_scripts ?? [];
  assert.equal(scripts.length, 2, 'Unexpected final content_scripts count');
  assert.deepEqual(scripts[0], {
    matches: [SUNO_MATCH],
    js: [DIRECT_MAIN_WORLD_FILE],
    run_at: 'document_start',
    world: 'MAIN'
  }, 'Unexpected final content_scripts MAIN entry');
  assert.deepEqual(scripts[1]?.matches, [SUNO_MATCH], 'Unexpected final content_scripts adapter matches');
  assert.equal(scripts[1]?.run_at, 'document_idle', 'Unexpected final content_scripts adapter run_at');
  assert.deepEqual(
    Object.keys(scripts[1] ?? {}).sort(),
    ['js', 'matches', 'run_at'],
    'Unexpected final content_scripts adapter shape'
  );
  assert.equal(scripts[1]?.js?.length, 1, 'Unexpected final content_scripts adapter scripts');
}

function assertNoSensitiveCapabilities(manifest, javascript) {
  const serializedManifest = JSON.stringify(manifest);
  assert.doesNotMatch(serializedManifest, /<all_urls>/, 'Manifest must not request <all_urls>');
  const forbidden = [
    [/document\.cookie/, 'document.cookie'],
    [/chrome\.cookies/, 'chrome.cookies'],
    [/chrome\.webRequest/, 'chrome.webRequest'],
    [/["']Authorization["']/, 'Authorization header']
  ];
  for (const [pattern, label] of forbidden) {
    assert.doesNotMatch(javascript, pattern, `Final package must not use ${label}`);
  }
}

function manifestMessageKey(value, field) {
  assert.equal(
    typeof value,
    'string',
    `Manifest ${field} must be a localized Chrome message token`
  );
  const match = /^__MSG_([A-Za-z][A-Za-z0-9_]*)__$/.exec(value);
  assert.ok(match, `Manifest ${field} must be a localized Chrome message token`);
  return match[1];
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertChromeMessagesCatalog(messages, locale) {
  assert.ok(
    isPlainObject(messages),
    `Chrome locale ${locale} catalog must be a non-array plain object`
  );

  for (const [key, entry] of Object.entries(messages)) {
    assert.ok(
      isPlainObject(entry),
      `Chrome locale ${locale} entry ${key} must be a non-array plain object`
    );
    assert.ok(
      typeof entry.message === 'string' && entry.message.trim().length > 0,
      `Chrome locale ${locale} entry ${key} message must be a non-empty string`
    );
    if ('description' in entry) {
      assert.equal(
        typeof entry.description,
        'string',
        `Chrome locale ${locale} entry ${key} description must be a string`
      );
    }
    if (!('placeholders' in entry)) continue;
    assert.ok(
      isPlainObject(entry.placeholders),
      `Chrome locale ${locale} entry ${key} placeholders must be a non-array plain object`
    );
    for (const [placeholderName, placeholder] of Object.entries(entry.placeholders)) {
      assert.ok(
        isPlainObject(placeholder),
        `Chrome locale ${locale} entry ${key} placeholder ${placeholderName} must be a non-array plain object`
      );
      assert.ok(
        typeof placeholder.content === 'string' && placeholder.content.trim().length > 0,
        `Chrome locale ${locale} entry ${key} placeholder ${placeholderName} content must be a non-empty string`
      );
      if ('example' in placeholder) {
        assert.equal(
          typeof placeholder.example,
          'string',
          `Chrome locale ${locale} entry ${key} placeholder ${placeholderName} example must be a string`
        );
      }
    }
  }
}

async function requireLocalizedPackageSurface(distRoot, manifest, resources) {
  assert.equal(manifest.name, '__MSG_extensionName__', 'Unexpected localized manifest name');
  assert.equal(
    manifest.description,
    '__MSG_extensionDescription__',
    'Unexpected localized manifest description'
  );
  assert.equal(manifest.default_locale, 'en', 'Unexpected manifest default_locale');
  assert.deepEqual(manifest.icons, REQUIRED_ICONS, 'Unexpected manifest icons');

  const manifestMessages = [
    manifestMessageKey(manifest.name, 'name'),
    manifestMessageKey(manifest.description, 'description')
  ];
  for (const locale of REQUIRED_LOCALES) {
    const resource = `_locales/${locale}/messages.json`;
    const path = await requireResource(distRoot, resource, resources);
    const messages = await readJson(path);
    assertChromeMessagesCatalog(messages, locale);
    for (const key of manifestMessages) {
      assert.ok(
        typeof messages[key]?.message === 'string' && messages[key].message.trim().length > 0,
        `Manifest token ${key} does not resolve in Chrome locale ${locale}`
      );
    }
  }

  for (const icon of Object.values(REQUIRED_ICONS)) {
    await requireResource(distRoot, icon, resources);
  }
}

export async function verifyDist(distRoot = resolve('dist')) {
  const root = resolve(distRoot);
  const manifest = await readJson(resolve(root, 'manifest.json'));
  assert.equal(manifest.version, '0.2.1', 'Expected manifest version 0.2.1');
  assert.deepEqual(
    manifest.permissions,
    ['storage', 'sidePanel', 'debugger', 'tabs'],
    'Unexpected manifest permissions'
  );
  assert.deepEqual(manifest.host_permissions, [SUNO_MATCH], 'Unexpected host_permissions');
  assert.deepEqual(
    manifest.background,
    { service_worker: 'service-worker-loader.js', type: 'module' },
    'Unexpected background service worker'
  );
  assert.equal(manifest.optional_permissions, undefined, 'Unexpected optional_permissions');
  assert.equal(
    manifest.optional_host_permissions,
    undefined,
    'Unexpected optional_host_permissions'
  );
  assert.equal(
    manifest.side_panel?.default_path,
    'src/sidepanel.html',
    'Unexpected side_panel.default_path'
  );
  assertFinalContentScripts(manifest);

  const resources = new Set();
  await requireLocalizedPackageSurface(root, manifest, resources);
  await Promise.all(
    collectManifestResources(manifest).map((resource) => requireResource(root, resource, resources))
  );

  const viteManifest = await readJson(resolve(root, '.vite/manifest.json'));
  const visitedEntries = new Set();
  const visitEntry = async (key) => {
    if (visitedEntries.has(key)) return;
    const entry = viteManifest[key];
    assert.ok(entry?.file, `Missing Vite manifest entry: ${key}`);
    visitedEntries.add(key);
    await requireResource(root, entry.file, resources);
    for (const css of entry.css ?? []) await requireResource(root, css, resources);
    for (const importedKey of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      await visitEntry(importedKey);
    }
  };
  for (const key of Object.values(REQUIRED_ENTRIES)) await visitEntry(key);

  const entryClosure = (key, keys = new Set()) => {
    if (keys.has(key)) return keys;
    const entry = viteManifest[key];
    assert.ok(entry?.file, `Missing Vite manifest entry: ${key}`);
    keys.add(key);
    for (const importedKey of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      entryClosure(importedKey, keys);
    }
    return keys;
  };
  const entryFiles = (key) => [...entryClosure(key)].map((entryKey) => viteManifest[entryKey].file);
  const readEntryCode = async (key) => (
    await Promise.all(entryFiles(key).map((file) => (
      readFile((extensionPath(root, file)).absolutePath, 'utf8')
    )))
  ).join('\n');

  const adapterScriptPath = manifest.content_scripts[1].js[0];
  const adapterLoaderCode = await readFile(
    (extensionPath(root, adapterScriptPath)).absolutePath,
    'utf8'
  );
  const adapterTargets = runtimeGetURLTargets(adapterLoaderCode);
  const adapterEntryFile = viteManifest[REQUIRED_ENTRIES.adapter].file;
  assert.ok(
    adapterTargets.includes(adapterEntryFile),
    'Adapter entry is not reached by its content-script loader'
  );

  const backgroundLoaderCode = await readFile(
    (extensionPath(root, manifest.background.service_worker)).absolutePath,
    'utf8'
  );
  const backgroundEntryFile = viteManifest[REQUIRED_ENTRIES.background].file;
  assert.ok(
    backgroundLoaderCode.includes(backgroundEntryFile),
    'Background entry is not reached by its service-worker loader'
  );
  const backgroundCode = await readEntryCode(REQUIRED_ENTRIES.background);
  for (const marker of [
    'suno-video-sync:background-request/v1',
    'Network.loadingFinished',
    'Network.getRequestPostData',
    'Network.getResponseBody',
    'Runtime.addBinding'
  ]) {
    assert.ok(backgroundCode.includes(marker), `CDP background marker is missing: ${marker}`);
  }

  const sunoResources = new Set(
    (manifest.web_accessible_resources ?? [])
      .filter((group) => (
        group.use_dynamic_url === true
        && JSON.stringify(group.matches) === JSON.stringify([SUNO_MATCH])
      ))
      .flatMap((group) => group.resources ?? [])
  );
  for (const file of entryFiles(REQUIRED_ENTRIES.adapter)) {
    assert.ok(
      sunoResources.has(file),
      `web_accessible_resources for ${SUNO_MATCH} is missing ${file}`
    );
  }

  const mainCode = await readFile(
    (extensionPath(root, DIRECT_MAIN_WORLD_FILE)).absolutePath,
    'utf8'
  );
  assert.doesNotMatch(mainCode, /chrome\.runtime/, 'MAIN-world script must not depend on chrome.runtime');
  await initModuleLexer;
  const [mainImports, mainExports] = parseModule(mainCode);
  assert.equal(
    mainImports.length + mainExports.length,
    0,
    'MAIN-world script must be self-contained'
  );
  assert.match(mainCode, /studio-api-prod\.suno\.com/, 'MAIN-world allowlist is missing');
  assert.match(mainCode, /save-project/, 'MAIN-world save observation is missing');
  assert.match(mainCode, /suno-video-sync\.page-bridge/, 'MAIN-world bridge source is missing');

  const adapterCode = await readEntryCode(REQUIRED_ENTRIES.adapter);
  assert.match(adapterCode, /suno-video-sync:snapshot-request\/v1/, 'Adapter request protocol is missing');
  assert.match(adapterCode, /suno-video-sync:snapshot-response\/v1/, 'Adapter response protocol is missing');
  assert.match(adapterCode, /waiting-for-project-state/, 'Adapter project-state fallback is missing');

  const sidepanelCode = await readEntryCode(REQUIRED_ENTRIES.sidepanel);
  for (const marker of FEATURE_MARKERS) {
    assert.ok(sidepanelCode.includes(marker), `Side-panel feature marker is missing: ${marker}`);
  }

  const sidepanelHtmlPath = await requireResource(root, manifest.side_panel.default_path, resources);
  const sidepanelHtml = await readFile(sidepanelHtmlPath, 'utf8');
  for (const target of htmlResourceTargets(sidepanelHtml)) {
    await requireResource(root, target, resources);
  }

  const javascriptPaths = [...resources].filter((resource) => resource.endsWith('.js'));
  const javascript = (await Promise.all(javascriptPaths.map(async (resource) => (
    readFile((extensionPath(root, resource)).absolutePath, 'utf8')
  )))).join('\n');
  assertNoSensitiveCapabilities(manifest, javascript);

  return {
    manifestScripts: manifest.content_scripts.flatMap((entry) => entry.js ?? []).length,
    resources: resources.size,
    featureMarkers: FEATURE_MARKERS.length
  };
}

async function runCli() {
  const result = await verifyDist(process.argv[2] ? resolve(process.argv[2]) : resolve('dist'));
  console.log(`Verified dist: ${result.manifestScripts} manifest scripts, ${result.resources} resources, ${result.featureMarkers} feature markers.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
