import { defineConfig } from '@playwright/test';

/**
 * The extension is loaded by tests/e2e/extension.ts via launchPersistentContext,
 * so there is no `projects` browser here — only the fixture server and timeouts.
 *
 * MV3 service workers need a real (headed) Chromium; DISPLAY must be set.
 * Headless CI: wrap with `xvfb-run -a pnpm e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  webServer: {
    command: 'pnpm fixtures',
    url: 'http://localhost:5174/index.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
