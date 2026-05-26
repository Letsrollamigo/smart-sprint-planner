/**
 * One-time auth setup for Playwright live smoke against youtrack.example.com.
 *
 * Run ONCE manually:
 *   node scripts/save-auth.js
 *
 * A headed Chrome window opens → log in with your YouTrack credentials →
 * the script waits until you reach a /youtrack/ page → saves cookies to
 * playwright/.auth/user.json.
 *
 * After that, `npm run smoke` reuses the saved auth state automatically.
 * Re-run this script if you get 401/redirect errors in smoke.
 */

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';

const BASE_URL = process.env.YOUTRACK_URL || 'https://youtrack.example.com';
const AUTH_PATH = 'playwright/.auth/user.json';

if (!existsSync('playwright/.auth')) {
  mkdirSync('playwright/.auth', { recursive: true });
}

console.log('');
console.log('=== Playwright Auth Setup ===');
console.log(`Target: ${BASE_URL}`);
console.log('');

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();

console.log('Opening YouTrack... Log in with your credentials.');
console.log('The script waits until you reach the main YouTrack page.\n');

await page.goto(BASE_URL);

// Wait until user lands on any YouTrack page (past login)
await page.waitForURL(url => {
  const href = url.toString();
  return href.includes('/youtrack') || href.includes('/projects') || href === `${BASE_URL}/`;
}, { timeout: 120_000 }).catch(() => {
  // Timeout means user might already be on the right page
});

// Extra: wait for the YouTrack toolbar to confirm full load
await page.waitForSelector('[class*="toolbar"], [data-test="ring-toolbar"], .yt-page__toolbar, body', {
  timeout: 15_000
}).catch(() => {});

await context.storageState({ path: AUTH_PATH });

console.log('');
console.log(`✅ Auth state saved → ${AUTH_PATH}`);
console.log('   Run `npm run smoke` to execute live smoke against example.com.');
console.log('');

await browser.close();
