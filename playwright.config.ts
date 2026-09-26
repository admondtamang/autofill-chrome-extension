import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * There is no `projects` browser here: tests/e2e/harness.ts launches the
 * browser itself with `chromium.launchPersistentContext`, because an MV3
 * extension can only be loaded that way (and its service worker needs a real,
 * headed Chromium — `DISPLAY` must be set; on a headless CI box wrap the
 * command in `xvfb-run -a`).
 */
const EXT = resolve(import.meta.dirname, '.output/chrome-mv3-dev');
if (!existsSync(EXT)) {
  throw new Error(`No build at ${EXT} — run \`pnpm build\` before \`pnpm e2e\`.`);
}

const demo = process.env.IMMIFILL_DEMO === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  // One browser, one side panel, one fixture tab: the suite is deliberately serial.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: demo ? [['list']] : [['list'], ['html', { open: 'never' }]],
  testIgnore: demo ? [] : ['**/demo.spec.ts'],
  use: { actionTimeout: 15_000 },
  webServer: {
    command: 'pnpm fixtures',
    url: 'http://localhost:5174/index.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
