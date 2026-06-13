import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "wallet-testnet",
      testMatch: /wallet-testnet\.synpress\.ts/,
      timeout: 120_000,
    },
    {
      name: "wallet-local",
      testMatch: /wallet-local\.synpress\.ts/,
      timeout: 120_000,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `bash -c 'NEXT_PUBLIC_DEFAULT_CHAIN_ID=998 NEXT_PUBLIC_TESTNET_RPC=https://rpcs.chain.link/hyperevm/testnet NEXT_PUBLIC_ADMIN_ENABLED=true npm run build && NEXT_PUBLIC_DEFAULT_CHAIN_ID=998 NEXT_PUBLIC_TESTNET_RPC=https://rpcs.chain.link/hyperevm/testnet NEXT_PUBLIC_ADMIN_ENABLED=true npm run start -- -p ${PORT}'`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
