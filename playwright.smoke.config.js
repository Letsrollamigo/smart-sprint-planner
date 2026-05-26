/**
 * Playwright config for LIVE smoke against youtrack.example.com.
 *
 * Usage:
 *   npm run smoke             — full live smoke suite
 *   npm run smoke:headed      — same but headed (watch what happens)
 *
 * Prerequisites:
 *   playwright/.auth/user.json must exist. Run `node scripts/save-olear-auth.js` once.
 *
 * Environment variables:
 *   YOUTRACK_URL      — default: https://youtrack.example.com
 *   YOUTRACK_PROJECT  — default: DEMO
 *   SSP_APP_ID        — YouTrack app numeric ID for community plugin (default: 145-463)
 */

import { defineConfig } from '@playwright/test';

const BASE_URL   = process.env.YOUTRACK_URL     || 'https://youtrack.example.com';
const PROJECT    = process.env.YOUTRACK_PROJECT  || 'DEMO';
const APP_ID     = process.env.SSP_APP_ID        || '145-463';

export default defineConfig({
  testDir: './tests/playwright-smoke',
  timeout: 45_000,
  fullyParallel: false,   // smoke runs sequentially — shared live state
  retries: 1,             // one retry to handle transient YT load delays
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/smoke' }]],

  use: {
    baseURL: BASE_URL,
    storageState: 'playwright/.auth/user.json',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    headless: process.env.HEADED !== '1',
    viewport: { width: 1440, height: 900 },
  },

  // Expose to tests via process.env
  globalSetup: undefined,
  projects: [
    {
      name: 'live-smoke',
      use: { },
    }
  ],

  // Make env vars available to spec files
  // Tests access via: process.env.YOUTRACK_PROJECT, etc.
});

// Re-export constants so spec files can import from config
export { BASE_URL, PROJECT, APP_ID };
