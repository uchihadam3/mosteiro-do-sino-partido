import { defineConfig } from '@playwright/test';

/**
 * E2E suite. Runs against the Vite dev server (reused if already running) and the local WebSocket relay
 * used by the online co-op spec. WebGL runs on SwiftShader so the suite works on headless CI machines.
 * Set PW_CHROMIUM=/path/to/chrome to use a preinstalled browser instead of the one Playwright downloads.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'off',
    viewport: { width: 1600, height: 900 },
    launchOptions: {
      executablePath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: [
    { command: 'npm run dev -w @mosteiro/web -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 120_000 },
    { command: 'node apps/server/relay.mjs 8790', port: 8790, reuseExistingServer: true, timeout: 30_000 },
  ],
});
