import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "ImmiFill",
    description: "Fill Australian ImmiAccount forms from the Success CRM side panel",
    version: "0.1.0",
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
    host_permissions: [
      "https://online.immi.gov.au/*",
      "https://api.successedu.com.au/*",
      "<all_urls>",
    ],
    // side_panel is a Chrome MV3 key; cast to bypass strict WXT manifest type
    ...(({
      side_panel: { default_path: "sidepanel/index.html" },
    }) as object),
  },
  vite: () => ({
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  }),
});
