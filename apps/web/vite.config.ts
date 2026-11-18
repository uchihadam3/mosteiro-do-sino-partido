import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const BUILD_ID = process.env.BUILD_ID ?? new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [
    react(),
    {
      // stamp the service worker with the build id so installed copies detect updates
      name: 'sw-version',
      generateBundle() {
        const sw = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8').replaceAll('__BUILD_ID__', BUILD_ID);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build: BUILD_ID }) });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } },
  },
});
