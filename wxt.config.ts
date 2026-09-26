import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

/** `http://host:5176` -> ['http://host:5176/*']. Unset or unparseable -> []. */
function crmOrigin(base: string | undefined): string[] {
  if (!base) return [];
  try {
    return [`${new URL(base).origin}/*`];
  } catch {
    return []; // a malformed base must not break the build
  }
}

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
            // The CRM is never a tab, so "Enable on this site" can never grant it:
            // a dev build talking to a CRM must declare that origin up front.
            ...crmOrigin(process.env.WXT_CRM_BASE),
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
