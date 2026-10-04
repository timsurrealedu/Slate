import { defineConfig } from "@playwright/test";
const externalTestUrl = process.env.SLATE_TEST_URL;
if (!externalTestUrl) process.env.SLATE_PRODUCTION_TEST = "1";
export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/fixtures.mjs",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.SLATE_TEST_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--no-sandbox"], channel: process.env.SLATE_TEST_BROWSER_CHANNEL },
  },
  reporter: [["list"], ["json", { outputFile: "artifacts/browser-results.json" }]],
  outputDir: "artifacts/browser",
  webServer: externalTestUrl
    ? undefined
    : {
        command:
          "node node_modules/vite/bin/vite.js preview --config vite.standalone.config.ts --host 127.0.0.1 --port 3000 --strictPort",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 30000,
      },
});
