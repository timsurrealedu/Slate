import { defineConfig } from "@playwright/test";
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
    launchOptions: { args: ["--no-sandbox"] },
  },
  reporter: [["list"], ["json", { outputFile: "artifacts/browser-results.json" }]],
  outputDir: "artifacts/browser",
});
