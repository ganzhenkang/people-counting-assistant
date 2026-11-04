import { defineConfig } from "@playwright/test";

/**
 * Browser tests. Uses the locally installed Microsoft Edge (or set PW_CHANNEL=chrome).
 * Run `npm run build` first; the tests start `next start` on port 3123 unless
 * a server is already running there.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3123",
    channel: process.env.PW_CHANNEL ?? "msedge",
    acceptDownloads: true,
  },
  webServer: {
    command: "npx next start -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
