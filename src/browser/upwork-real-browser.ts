/**
 * Upwork Real Browser Session
 *
 * Dedicated Puppeteer session for Upwork that uses `puppeteer-real-browser` instead
 * of the shared session manager. This defeats Cloudflare's v20-era bot detection by
 * using a genuine Chrome binary with Cloudflare-Turnstile solving baked in.
 *
 * Why separate: LinkedIn/Indeed/Wellfound don't have Cloudflare on job detail pages,
 * so they keep working with the standard session manager. Upwork is the one platform
 * that needs this nuclear option, so we isolate the blast radius.
 *
 * Session lifecycle: single browser instance cached and reused across calls within
 * a server lifetime. Disposed on process exit.
 */

// @ts-ignore — puppeteer-real-browser has a CJS default export that TS fights with
import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { loadAndApply } from './auth.js';
import { Platform } from '../types/job.js';

const logger = createLogger('upwork-real-browser');

interface RealBrowserSession {
  browser: Browser;
  page: Page;
}

let cachedSession: RealBrowserSession | null = null;
let launchPromise: Promise<RealBrowserSession> | null = null;

async function launchRealBrowser(): Promise<RealBrowserSession> {
  logger.info('Launching puppeteer-real-browser for Upwork');

  const result = await connect({
    headless: false,
    turnstile: true, // auto-solve Cloudflare Turnstile challenges
    disableXvfb: true, // Windows — no Xvfb needed
    connectOption: {
      defaultViewport: null,
    },
  });

  const session: RealBrowserSession = {
    browser: result.browser as unknown as Browser,
    page: result.page as unknown as Page,
  };

  // Cleanup on browser close (user closes window or crash)
  session.browser.on('disconnected', () => {
    logger.warn('Upwork real-browser disconnected');
    cachedSession = null;
  });

  // Apply any saved auth cookies immediately — if upwork_login_capture was run,
  // this lands them before the first navigation so we arrive authenticated.
  try {
    const applied = await loadAndApply(session.page, Platform.UPWORK);
    logger.info('Post-launch auth cookie application', { applied });
  } catch (err) {
    logger.warn('Could not apply auth cookies (likely no saved auth yet)', { err: String(err) });
  }

  return session;
}

/**
 * Get the current real-browser session, launching one if none exists.
 * Deduplicates concurrent launch attempts — if two callers race, the second
 * awaits the first's launchPromise rather than spawning a second browser.
 */
export async function getUpworkRealSession(): Promise<RealBrowserSession> {
  if (cachedSession) return cachedSession;
  if (launchPromise) return launchPromise;

  launchPromise = launchRealBrowser();
  try {
    cachedSession = await launchPromise;
    return cachedSession;
  } finally {
    launchPromise = null;
  }
}

/**
 * Close the Upwork real-browser session. Called on server shutdown or on
 * explicit user request.
 */
export async function closeUpworkRealSession(): Promise<void> {
  if (cachedSession) {
    try {
      await cachedSession.browser.close();
    } catch (err) {
      logger.warn('Error closing Upwork real-browser', { err: String(err) });
    }
    cachedSession = null;
  }
}
