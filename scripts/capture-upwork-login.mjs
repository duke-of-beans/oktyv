/**
 * Upwork login capture — standalone runner.
 *
 * Opens real Chrome at the Upwork login page, waits for the user to complete
 * login (including 2FA), polls every 2 seconds for the required auth cookies,
 * then saves them to D:/Dev/oktyv/auth/upwork.cookies.json.
 *
 * This is the same logic as the upwork_login_capture MCP tool, extracted to
 * a script so it can be invoked directly without going through Claude's MCP
 * tool-list cache.
 *
 * Run: node D:/Dev/oktyv/scripts/capture-upwork-login.mjs
 */

import puppeteer from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const UPWORK_LOGIN = 'https://www.upwork.com/ab/account-security/login';
const REAL_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// Your real Chrome user data dir + Profile 1 (where your saved Upwork password lives).
// Puppeteer reads this via the `--profile-directory` flag while `userDataDir` points
// at the root. This way Chrome opens AS YOU, with autofill, bookmarks, everything.
const CHROME_USER_DATA = 'C:/Users/DKdKe/AppData/Local/Google/Chrome/User Data';
const CHROME_PROFILE = 'Profile 1';
const OUTPUT_FILE = 'D:/Dev/oktyv/auth/upwork.cookies.json';
const REQUIRED_COOKIES = ['master_refresh_token', 'console_user'];
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 2000;

function log(msg, extra = {}) {
  const stamp = new Date().toISOString().slice(11, 19);
  const suffix = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  console.log(`[${stamp}] ${msg}${suffix}`);
}

async function main() {
  log('Launching real Chrome with your Profile 1', {
    binary: REAL_CHROME,
    userDataDir: CHROME_USER_DATA,
    profileDirectory: CHROME_PROFILE,
  });

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: REAL_CHROME,
    userDataDir: CHROME_USER_DATA,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [`--profile-directory=${CHROME_PROFILE}`],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  log('Navigating to Upwork login page');
  await page.goto(UPWORK_LOGIN, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  log('Login page loaded. Waiting for user to complete login in the browser window.');
  log(`Will poll every ${POLL_MS / 1000}s for auth cookies. Timeout: ${TIMEOUT_MS / 60_000} min.`);

  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    attempts += 1;
    const cookies = await page.cookies();
    const names = new Set(cookies.map((c) => c.name));
    const present = REQUIRED_COOKIES.filter((n) => names.has(n));
    const missing = REQUIRED_COOKIES.filter((n) => !names.has(n));

    if (missing.length === 0) {
      log('Auth cookies detected — capturing', {
        attempts,
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        present,
        totalCookies: cookies.length,
      });

      const payload = {
        platform: 'UPWORK',
        capturedAt: new Date().toISOString(),
        cookieCount: cookies.length,
        cookies,
      };
      await mkdir(dirname(OUTPUT_FILE), { recursive: true });
      await writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
      log('Saved to ' + OUTPUT_FILE);
      log('Closing browser.');
      await browser.close();
      process.exit(0);
    }

    if (attempts % 10 === 0) {
      log('Still waiting for login', {
        attempts,
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        cookiesOnPage: cookies.length,
        missing,
      });
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  log('Timed out waiting for login. Closing browser.');
  await browser.close();
  process.exit(2);
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
