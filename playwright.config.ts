import { defineConfig, devices } from '@playwright/test';

// By default the tests start their own dev server on port 3100. If you already have `npm run dev` running
// (Next.js allows only one per project), point the tests at it: E2E_BASE_URL=http://localhost:3000
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL, ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx next dev -p 3100', url: 'http://localhost:3100/login', reuseExistingServer: true, timeout: 120_000 },
});
