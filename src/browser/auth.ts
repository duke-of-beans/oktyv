/**
 * Platform Auth Cookie Manager
 *
 * Persists authenticated sessions as JSON cookie snapshots rather than relying on
 * Chrome profile persistence (which breaks silently due to DPAPI encryption, profile
 * version skew, and fingerprint binding).
 *
 * Pattern (2026 canonical): capture cookies once via `page.cookies()` after a manual
 * human login, save to JSON, inject via `page.setCookie(...cookies)` on every
 * subsequent run. Works across puppeteer restarts and survives profile corruption.
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { constants as fsConstants } from 'fs';
import type { Page, CookieData } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { Platform } from '../types/job.js';

const logger = createLogger('auth-manager');

// Cookies are auth-sensitive. Default to a sibling `auth/` dir; override for tests.
const DEFAULT_AUTH_DIR =
  process.env.OKTYV_AUTH_DIR || 'D:/Dev/oktyv/auth';

/**
 * Required cookie names by platform — presence of these signals a genuine
 * authenticated session. Absence means "login flow never completed."
 *
 * Upwork: `master_refresh_token` is the long-lived (remember-me) refresh token.
 *         `console_user` is Upwork's internal "you are logged in" marker.
 *         Both are HttpOnly and set by the auth.upwork.com domain at login.
 *         The shorter-lived `master_access_token` only exists mid-session, so
 *         don't require it here — refresh_token is enough to prove persistence.
 */
const REQUIRED_AUTH_COOKIES: Partial<Record<Platform, string[]>> = {
  [Platform.LINKEDIN]: ['li_at'],
  [Platform.INDEED]: ['CTK', 'INDEED_CSRF_TOKEN'],
  [Platform.WELLFOUND]: ['_angellist_session'],
  [Platform.UPWORK]: ['master_refresh_token', 'console_user'],
};

export interface SerializedCookies {
  platform: Platform;
  capturedAt: string;
  cookieCount: number;
  cookies: CookieData[];
}

function cookiesPathFor(platform: Platform): string {
  return join(DEFAULT_AUTH_DIR, `${platform.toLowerCase()}.cookies.json`);
}

/**
 * Check whether the current page's cookies contain all required auth markers
 * for this platform. Used to verify login completed before saving.
 */
export async function verifyAuthenticated(
  page: Page,
  platform: Platform
): Promise<{ ok: boolean; missing: string[]; present: string[] }> {
  const cookies = await page.cookies();
  const names = new Set(cookies.map((c) => c.name));
  const required = REQUIRED_AUTH_COOKIES[platform] ?? [];
  const missing = required.filter((n) => !names.has(n));
  const present = required.filter((n) => names.has(n));
  return { ok: missing.length === 0, missing, present };
}

/**
 * Capture current session cookies from the page, verify auth completed,
 * and persist to disk. Throws if the session isn't authenticated — this
 * prevents saving half-logged-in cookie sets that would silently fail later.
 */
export async function captureAndSave(
  page: Page,
  platform: Platform
): Promise<{ path: string; cookieCount: number; verified: string[] }> {
  const verification = await verifyAuthenticated(page, platform);
  if (!verification.ok) {
    throw new Error(
      `Refusing to save un-authenticated session for ${platform}. ` +
        `Missing required cookies: ${verification.missing.join(', ')}. ` +
        `Log in fully (including any 2FA / device verification), reach the ` +
        `platform dashboard, then retry capture.`
    );
  }

  const cookies = await page.cookies();
  const payload: SerializedCookies = {
    platform,
    capturedAt: new Date().toISOString(),
    cookieCount: cookies.length,
    cookies,
  };

  const outPath = cookiesPathFor(platform);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');

  logger.info('Auth cookies captured and saved', {
    platform,
    path: outPath,
    cookieCount: cookies.length,
    verifiedMarkers: verification.present,
  });

  return {
    path: outPath,
    cookieCount: cookies.length,
    verified: verification.present,
  };
}

/**
 * Load saved cookies for a platform and apply them to a page. Call BEFORE
 * navigating to a protected URL. No-op if no saved cookies exist (returns false).
 *
 * Returns true if cookies were applied, false if no file was found.
 * Throws on file corruption or schema mismatch.
 */
export async function loadAndApply(
  page: Page,
  platform: Platform
): Promise<boolean> {
  const path = cookiesPathFor(platform);
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    logger.debug('No saved auth cookies found', { platform, path });
    return false;
  }

  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as SerializedCookies;

  if (parsed.platform !== platform) {
    throw new Error(
      `Cookie file platform mismatch: expected ${platform}, got ${parsed.platform}`
    );
  }

  if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
    throw new Error(`Cookie file is empty or corrupted: ${path}`);
  }

  // Puppeteer's setCookie accepts an array spread. It silently filters expired
  // cookies, so pre-filter here to log what's dropping.
  const now = Math.floor(Date.now() / 1000);
  const fresh = parsed.cookies.filter(
    (c: any) => !c.expires || c.expires === -1 || c.expires > now
  );
  const expired = parsed.cookies.length - fresh.length;

  await page.setCookie(...fresh);

  logger.info('Auth cookies applied to page', {
    platform,
    path,
    applied: fresh.length,
    expired,
    capturedAt: parsed.capturedAt,
    ageHours: Math.round(
      (Date.now() - new Date(parsed.capturedAt).getTime()) / 3600_000
    ),
  });

  return true;
}

/**
 * Check whether saved cookies exist and still contain the required auth markers.
 * Used to decide whether to trigger a re-login or proceed. Does NOT open a browser.
 */
export async function hasValidSavedAuth(
  platform: Platform
): Promise<{ exists: boolean; valid: boolean; ageHours?: number; missing?: string[] }> {
  const path = cookiesPathFor(platform);
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    return { exists: false, valid: false };
  }

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as SerializedCookies;
    const names = new Set(parsed.cookies.map((c) => c.name));
    const required = REQUIRED_AUTH_COOKIES[platform] ?? [];
    const missing = required.filter((n) => !names.has(n));
    const ageHours = Math.round(
      (Date.now() - new Date(parsed.capturedAt).getTime()) / 3600_000
    );
    return {
      exists: true,
      valid: missing.length === 0,
      ageHours,
      missing: missing.length > 0 ? missing : undefined,
    };
  } catch (err) {
    logger.warn('Saved auth file unreadable', { platform, path, err });
    return { exists: true, valid: false };
  }
}
