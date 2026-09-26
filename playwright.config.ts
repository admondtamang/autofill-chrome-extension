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
// Phase 1 and Phase 2 run the SAME specs against different builds; the two
// `.output` dirs coexist so neither run clobbers the other. Keep this in step
// with `extDirFor()` in tests/e2e/harness.ts (duplicated on purpose: this file
// must not pull the harness' `@/` aliases into config resolution).
const api = process.env.IMMIFILL_MODE === 'api';
const EXT = resolve(import.meta.dirname, api ? '.output/api-mv3-dev' : '.output/chrome-mv3-dev');
if (!existsSync(EXT)) {
  const cmd = api ? 'pnpm build:api' : 'pnpm build';
  throw new Error(`No build at ${EXT} — run \`${cmd}\` first.`);
}

const demo = process.env.IMMIFILL_DEMO === '1';
const MOCK_CRM = process.env.WXT_CRM_BASE ?? 'http://localhost:5176';

export default defineConfig({
  testDir: 'tests/e2e',
  // One browser, one side panel, one fixture tab: the suite is deliberately serial.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: demo ? [['list']] : [['list'], ['html', { open: 'never' }]],
  // api.spec.ts asserts the CONTRACTS §10 behaviours; it is meaningless against
  // a static build, where there is no auth, no CRM and no mapping cache.
  testIgnore: demo ? [] : ['**/demo.spec.ts', ...(api ? [] : ['**/api.spec.ts'])],
  use: { actionTimeout: 15_000 },
  webServer: [
    {
      command: 'pnpm fixtures',
      url: 'http://localhost:5174/index.html',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    // Every mock route answers 401 unauthenticated — a readiness code Playwright
    // accepts, and proof the auth gate is on before a single test runs.
    ...(api
      ? [
          {
            command: 'pnpm mock-crm',
            url: `${MOCK_CRM}/immifill/mappings`,
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
