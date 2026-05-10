import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3939',
    trace: 'retain-on-failure',
    headless: true
  },
  webServer: {
    command: 'npx http-server -p 3939 -c-1 .',
    port: 3939,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI
  }
});
