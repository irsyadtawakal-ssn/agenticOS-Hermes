import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { browserMockAssetsPlugin } from './vendor/pixel-agents/webview-ui/vite.config.ts';

const here = import.meta.dirname;

// Dev only: read the UI token server-side so the browser never sees it.
function uiTokenFromEnvLocal(): string {
  const file = resolve(here, '../../.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('AOS_UI_TOKEN='));
  return line ? line.slice('AOS_UI_TOKEN='.length).trim() : '';
}

const coreUrl = process.env.AOS_CORE_URL ?? 'http://127.0.0.1:7400';
const token = uiTokenFromEnvLocal();

export default defineConfig({
  root: here,
  base: './',
  plugins: [tailwindcss(), react(), browserMockAssetsPlugin()],
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [here, resolve(here, '../../infra/profiles')] },
    proxy: {
      '/v1': { target: coreUrl, changeOrigin: true, ws: true, headers: token ? { authorization: `Bearer ${token}` } : {} },
    },
  },
});
