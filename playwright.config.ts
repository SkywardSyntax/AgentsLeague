import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: 'http://localhost:4203',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_MODE=agent AGENT_STREAM_MODE=mock npm run dev -- --port 4203',
    port: 4203,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
