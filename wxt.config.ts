import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Manifest must be a function: WXT loads .env files after the config module,
// so import.meta.env.WXT_* is only populated by the time the function runs.
export default defineConfig({
  manifest: () => ({
    name: 'ImmiFill',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'alarms'],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'ImmiFill' },
    // Owner decision (2026-09-26), overriding the PRD's fixed-host prod rule:
    // the extension runs on every site with no per-site prompt. Large surface —
    // it can read and write any page while holding real client PII, and it is
    // the main Web Store review risk. Narrow to the CRM + ImmiAccount if that
    // review fails.
    host_permissions: ['<all_urls>'],
  }),
  vite: () => ({
    plugins: [preact()],
    define: {
      'import.meta.env.WXT_DATA_SOURCE': JSON.stringify('api'),
      'import.meta.env.WXT_CRM_BASE': JSON.stringify(
        process.env.WXT_CRM_BASE ?? '',
      ),
    },
  }),
});
