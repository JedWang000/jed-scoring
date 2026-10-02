import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const sourcePath = join(projectRoot, 'src', 'assets', 'jed-mark.svg');
const outputDirectory = join(projectRoot, 'src', 'assets', 'icons');
const sizes = [16, 32, 48, 128];

const source = await readFile(sourcePath, 'utf8');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`
      <!doctype html>
      <style>
        html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; }
        svg { display: block; width: ${size}px; height: ${size}px; }
      </style>
      ${source}
    `);
    await page.locator('svg').screenshot({
      path: join(outputDirectory, `jed-${size}.png`),
      omitBackground: true
    });
  }
} finally {
  await browser.close();
}

console.log(`Generated JED icons at ${sizes.map((size) => `${size}px`).join(', ')}.`);
