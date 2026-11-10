import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// PW_CHROMIUM overrides; otherwise use the sandbox's preinstalled Chromium when it exists, and
// Playwright's own bundled browser (`npx playwright install chromium`) everywhere else.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 1,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
