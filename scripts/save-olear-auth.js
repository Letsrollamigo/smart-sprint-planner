/**
 * One-time auth setup for Playwright live smoke against youtrack.example.com.
 *
 * Run ONCE manually:
 *   node scripts/save-olear-auth.js
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
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  После входа вернись в этот терминал и нажми Enter');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await page.goto(BASE_URL);

// Wait for user to press Enter in terminal after logging in
await new Promise(resolve => {
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', resolve);
  process.stdout.write('Залогинился? Нажми Enter → ');
});

await context.storageState({ path: AUTH_PATH });

console.log('');
console.log(`✅ Auth state saved → ${AUTH_PATH}`);
console.log('   Run `npm run smoke` to execute live smoke against example.com.');
console.log('');

await browser.close();
