import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3100', ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
  webServer: { command: 'npx next dev -p 3100', url: 'http://localhost:3100/login', reuseExistingServer: true, timeout: 120_000 },
});
