import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { chromeLocalesPlugin } from './build/chrome-locales-plugin';
import { directMainWorldPlugin } from './build/direct-main-world-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest }), chromeLocalesPlugin(), directMainWorldPlugin()]
});
