import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 20_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test/e2e-report" }]],
  // Serve the built extension's side panel as a static site
  webServer: {
    command: "npx serve .output/chrome-mv3 -p 4321 --no-clipboard",
    port: 4321,
    reuseExistingServer: true,
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:4321",
    screenshot: "on",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
