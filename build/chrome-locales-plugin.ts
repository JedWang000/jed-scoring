import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const LOCALES = ['en', 'zh_CN', 'zh_TW'] as const;

export function chromeLocalesPlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: 'jed-scoring:chrome-locales',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root;
    },
    async buildStart() {
      for (const locale of LOCALES) {
        this.emitFile({
          type: 'asset',
          fileName: `_locales/${locale}/messages.json`,
          source: await readFile(
            resolve(projectRoot, 'src', '_locales', locale, 'messages.json')
          )
        });
      }
    }
  };
}
