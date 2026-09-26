import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Manifest must be a function: WXT loads .env files after the config module,
// so import.meta.env.WXT_* is only populated by the time the function runs.
export default defineConfig({
  manifest: ({ mode }) => ({
    name: 'ImmiFill',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'alarms'],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'ImmiFill' },
    ...(mode === 'production'
      ? {
          host_permissions: [
            'https://online.immi.gov.au/*',
            'https://api.successedu.com.au/*',
          ],
        }
      : {
          optional_host_permissions: ['<all_urls>'],
          host_permissions: [
            'http://localhost:5174/*',
            'http://127.0.0.1:5174/*',
          ],
        }),
  }),
  vite: () => ({
    plugins: [preact()],
    define: {
      'import.meta.env.WXT_DATA_SOURCE': JSON.stringify(
        process.env.WXT_DATA_SOURCE ?? 'static',
      ),
      'import.meta.env.WXT_CRM_BASE': JSON.stringify(
        process.env.WXT_CRM_BASE ?? '',
      ),
    },
  }),
});
