import { build as esbuildBuild } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export const DIRECT_MAIN_WORLD_FILE = 'assets/main-world-direct.js';
const SUNO_MATCH = 'https://suno.com/*';

interface ContentScriptShape {
  readonly matches: readonly string[];
  readonly js?: readonly string[];
  readonly run_at?: string;
  readonly world?: string;
  readonly [key: string]: unknown;
}

interface ManifestShape {
  readonly content_scripts?: readonly ContentScriptShape[];
  readonly [key: string]: unknown;
}

export function addDirectMainWorldContentScript<T extends ManifestShape>(manifest: T): T {
  const remainingScripts = (manifest.content_scripts ?? []).filter(
    (script) => !script.js?.includes(DIRECT_MAIN_WORLD_FILE)
  );
  return {
    ...manifest,
    content_scripts: [
      {
        matches: [SUNO_MATCH],
        js: [DIRECT_MAIN_WORLD_FILE],
        run_at: 'document_start',
        world: 'MAIN'
      },
      ...remainingScripts
    ]
  };
}

export function directMainWorldPlugin(
  entryPoint = 'src/content/main-world.ts'
): Plugin {
  return {
    name: 'suno-video-sync:direct-main-world',
    apply: 'build',
    async buildStart() {
      const result = await esbuildBuild({
        entryPoints: [resolve(entryPoint)],
        bundle: true,
        charset: 'utf8',
        format: 'iife',
        legalComments: 'none',
        minify: true,
        platform: 'browser',
        target: 'chrome102',
        write: false
      });
      const [output] = result.outputFiles ?? [];
      if (!output || result.outputFiles?.length !== 1) {
        throw new Error('Direct MAIN-world bundle was not generated exactly once.');
      }
      this.emitFile({
        type: 'asset',
        fileName: DIRECT_MAIN_WORLD_FILE,
        source: output.contents
      });
    },
    async writeBundle(outputOptions) {
      if (!outputOptions.dir) throw new Error('Vite output directory is unavailable.');
      const manifestPath = resolve(outputOptions.dir, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ManifestShape;
      await writeFile(
        manifestPath,
        `${JSON.stringify(addDirectMainWorldContentScript(manifest), null, 2)}\n`,
        'utf8'
      );
    }
  };
}
