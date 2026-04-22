/**
 * puppeteer-real-browser smoke test — is Cloudflare beaten at all?
 *
 * Launches puppeteer-real-browser (stealth-optimized, known working against Cloudflare
 * per 2026 research), navigates directly to the Upwork job page, and reports back:
 *   - Final URL (did it redirect to login? stay on job? hit CF challenge?)
 *   - Page title
 *   - First 200 chars of body
 *   - Whether h4 exists (signal that the real job content rendered)
 *
 * No auth. No profile. Just: does real-browser bypass Cloudflare cold?
 */

import { connect } from 'puppeteer-real-browser';

const JOB_URL = 'https://www.upwork.com/jobs/~022046430890836324972';

function log(msg, extra = {}) {
  const stamp = new Date().toISOString().slice(11, 19);
  const suffix = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  console.log(`[${stamp}] ${msg}${suffix}`);
}

async function main() {
  log('Launching puppeteer-real-browser');

  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    disableXvfb: true,
    connectOption: {
      defaultViewport: null,
    },
  });

  log('Browser up. Navigating to Upwork job.');

  try {
    await page.goto(JOB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (err) {
    log('Navigation errored (may still have loaded partial content)', { err: err.message });
  }

  // Let any Cloudflare challenge resolve itself
  await new Promise((r) => setTimeout(r, 8_000));

  const finalUrl = page.url();
  const title = await page.title();
  const h4Count = await page.$$eval('h4', (els) => els.length).catch(() => 0);
  const bodyText = await page
    .evaluate(() => document.body.innerText.slice(0, 300))
    .catch(() => '(body read failed)');

  log('Final state', { finalUrl, title, h4Count });
  log('Body preview: ' + bodyText.replace(/\s+/g, ' ').slice(0, 250));

  log('Leaving browser open 60s so you can see what rendered. Then closing.');
  await new Promise((r) => setTimeout(r, 60_000));
  await browser.close();
  log('Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
