/**
 * Upwork Connector
 *
 * Base connector for Upwork automation with intelligent navigation,
 * login detection via the master_access_token cookie, and error handling.
 *
 * Mirrors the LinkedInConnector pattern. Upwork is heavily fingerprinted —
 * we rely on a persistent user data directory (browser-data/upwork) so the
 * human can log in once and the session is reused on every subsequent run.
 */

import { createLogger } from '../utils/logger.js';
import type { BrowserSessionManager } from '../browser/session.js';
import type { RateLimiter } from '../browser/rate-limiter.js';
import { Platform, type Job, type JobSearchParams } from '../types/job.js';
import type { Company } from '../types/company.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';
import { extractJobListings, scrollToLoadMore } from '../tools/upwork-search.js';
import { extractJobDetail } from '../tools/upwork-job.js';
import { extractClientDetail } from '../tools/upwork-client.js';
import {
  captureAndSave,
  verifyAuthenticated,
  hasValidSavedAuth,
} from '../browser/auth.js';
import {
  getUpworkRealSession,
} from '../browser/upwork-real-browser.js';

const logger = createLogger('upwork-connector');

const UPWORK_URLS = {
  BASE: 'https://www.upwork.com',
  LOGIN: 'https://www.upwork.com/ab/account-security/login',
  HOME: 'https://www.upwork.com/nx/find-work/',
  JOBS_SEARCH: 'https://www.upwork.com/nx/search/jobs/',
  JOB_DETAIL: (jobId: string) => `https://www.upwork.com/jobs/${jobId}/`,
  CLIENT: (clientId: string) => `https://www.upwork.com/ab/clients/${clientId}/overview`,
};

/**
 * Upwork connector for job search and data extraction
 */
export class UpworkConnector {
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private platform = Platform.UPWORK;

  constructor(sessionManager: BrowserSessionManager, rateLimiter: RateLimiter) {
    this.sessionManager = sessionManager;
    this.rateLimiter = rateLimiter;
    logger.info('UpworkConnector initialized');
  }

  /**
   * Ensure user is logged into Upwork using saved cookie JSON.
   *
   * Strategy (2026 canonical):
   * 1. Load saved cookies from auth/upwork.cookies.json
   * 2. Apply to page via page.setCookie()
   * 3. If no valid saved auth exists, throw with direction to run upwork_login_capture
   *
   * This replaces the old profile-dir approach which broke silently due to
   * Chrome DPAPI encryption and fingerprint binding between launches.
   */
  async ensureLoggedIn(): Promise<void> {
    logger.debug('Checking Upwork saved auth');

    const authStatus = await hasValidSavedAuth(this.platform);

    if (!authStatus.exists) {
      const error: OktyvError = {
        code: OktyvErrorCode.NOT_LOGGED_IN,
        message:
          'No saved Upwork login found. Run the `upwork_login_capture` tool first — ' +
          'it will open a browser window, let you log in manually, and save session ' +
          'cookies for reuse on all subsequent runs.',
        retryable: false,
      };
      logger.error('Upwork auth missing — login capture required', error);
      throw error;
    }

    if (!authStatus.valid) {
      const error: OktyvError = {
        code: OktyvErrorCode.NOT_LOGGED_IN,
        message:
          `Saved Upwork cookies exist but are missing required auth markers ` +
          `(${authStatus.missing?.join(', ')}). Session likely incomplete or expired ` +
          `after ${authStatus.ageHours}h. Run \`upwork_login_capture\` to refresh.`,
        retryable: false,
      };
      logger.error('Upwork saved auth invalid', error);
      throw error;
    }

    // Auth file is present and valid on disk. The actual cookie-application
    // to the page happens in getJob/searchJobs right before navigation, where
    // we have a Page handle. Just log here that we're good.
    logger.info('Upwork saved auth available', {
      ageHours: authStatus.ageHours,
    });
  }

  /**
   * Launch a browser, navigate to Upwork login, and poll for successful
   * authentication. When auth cookies appear on the page (signal that the
   * user completed login including any 2FA), capture all cookies to JSON
   * and return. The saved file will be used by all subsequent runs.
   *
   * This is the only time Oktyv touches Upwork with a human-in-the-loop.
   * Should need re-running every few weeks when the session expires.
   */
  async captureLogin(timeoutMs: number = 5 * 60 * 1000): Promise<{
    path: string;
    cookieCount: number;
    verified: string[];
  }> {
    logger.info('Starting Upwork login capture via real-browser', { timeoutMs });

    // Use the same real-browser session that getJob/searchJobs/getClient use.
    // That way the cookies captured here are bound to the same browser fingerprint
    // that'll present them back to Upwork on subsequent runs.
    const session = await getUpworkRealSession();

    // Navigate to the login page.
    await session.page.goto(UPWORK_URLS.LOGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    logger.info(
      'Login page loaded. Waiting for user to complete login (up to ' +
        `${Math.round(timeoutMs / 60_000)} minutes).`
    );

    // Poll every 2 seconds for the required auth cookies. As soon as they
    // appear, the login completed (including any 2FA). Save and exit.
    const pollIntervalMs = 2_000;
    const startedAt = Date.now();
    let attempts = 0;

    while (Date.now() - startedAt < timeoutMs) {
      attempts += 1;
      const verification = await verifyAuthenticated(
        session.page,
        this.platform
      );

      if (verification.ok) {
        logger.info('Auth cookies detected, capturing', {
          attempts,
          elapsedMs: Date.now() - startedAt,
          markers: verification.present,
        });
        const saved = await captureAndSave(session.page, this.platform);
        logger.info('Upwork login capture complete', saved);
        return saved;
      }

      // Only log every 10 polls (~20s) to avoid spam.
      if (attempts % 10 === 0) {
        logger.debug('Waiting for login', {
          attempts,
          missing: verification.missing,
        });
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw {
      code: OktyvErrorCode.NOT_LOGGED_IN,
      message:
        `Upwork login capture timed out after ${Math.round(timeoutMs / 60_000)} ` +
        'minutes. Required auth cookies never appeared — login flow may not have ' +
        'completed. Re-run `upwork_login_capture` when ready to log in.',
      retryable: true,
    } as OktyvError;
  }

  /**
   * Search for jobs on Upwork
   */
  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    logger.info('Searching Upwork jobs via real-browser', { params });
    await this.rateLimiter.waitForToken(this.platform);

    const session = await getUpworkRealSession();

    try {
      const searchUrl = this.buildJobSearchUrl(params);
      await session.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 60_000,
      });

      // Give Cloudflare Turnstile room to auto-solve before checking for listings
      await new Promise((r) => setTimeout(r, 6_000));
      await session.page.waitForSelector('article[data-test="JobTile"]', {
        timeout: 25_000,
      });

      const targetCount = params.limit || 20;
      if (targetCount > 10) {
        await scrollToLoadMore(session.page, targetCount);
      }

      const jobs = await extractJobListings(session.page, params);
      logger.info('Upwork job search complete', { count: jobs.length });
      return jobs;
    } catch (error) {
      logger.error('Upwork job search failed', { error });
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to search Upwork jobs',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Get detailed job information (including bid range for Freelancer Plus users).
   */
  async getJob(jobId: string, includeClient: boolean = false): Promise<{ job: Job; client?: Company }> {
    logger.info('Fetching Upwork job via real-browser', { jobId, includeClient });
    await this.rateLimiter.waitForToken(this.platform);

    // Upwork uses puppeteer-real-browser to beat Cloudflare v20 detection.
    // Auth cookies (if saved via upwork_login_capture) are applied at session start
    // inside upwork-real-browser. Public job pages work even without auth.
    const session = await getUpworkRealSession();

    try {
      const jobUrl = UPWORK_URLS.JOB_DETAIL(jobId);
      await session.page.goto(jobUrl, {
        waitUntil: 'networkidle2',
        timeout: 60_000,
      });

      // Cloudflare Turnstile auto-solve takes ~5-10s. Give it room before checking DOM.
      await new Promise((r) => setTimeout(r, 6_000));

      // Let Cloudflare's Turnstile challenge auto-solve if it fires
      await session.page.waitForSelector('h4', { timeout: 25_000 });

      const job = await extractJobDetail(session.page, jobId);
      logger.info('Upwork job fetch complete', { jobId, title: job.title });

      let client: Company | undefined;
      if (includeClient && job.upworkMeta?.clientCountry) {
        // Upwork rarely exposes client IDs in the job post URL — if a client
        // link was present on the page, the extractor captured it. Otherwise
        // we skip this silently (the job-detail already includes most client
        // quality signals).
        logger.debug('Client profile skipped — no client ID available from job page');
      }

      return { job, client };
    } catch (error) {
      logger.error('Upwork job fetch failed', { jobId, error });
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to fetch Upwork job: ' + ((error as any)?.message ?? String(error)),
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Get client (Upwork buyer) profile. Rare path — most client data lives on
   * the job detail page itself.
   */
  async getClient(clientId: string): Promise<Company> {
    logger.info('Fetching Upwork client via real-browser', { clientId });
    await this.rateLimiter.waitForToken(this.platform);

    const session = await getUpworkRealSession();

    try {
      const clientUrl = UPWORK_URLS.CLIENT(clientId);
      await session.page.goto(clientUrl, {
        waitUntil: 'networkidle2',
        timeout: 60_000,
      });

      await new Promise((r) => setTimeout(r, 6_000));
      await session.page.waitForSelector('h1, [data-test="client-name"]', {
        timeout: 25_000,
      });

      const client = await extractClientDetail(session.page, clientId);
      logger.info('Upwork client fetch complete', { clientId, name: client.name });
      return client;
    } catch (error) {
      logger.error('Upwork client fetch failed', { clientId, error });
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to fetch Upwork client',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Build Upwork job search URL with filters.
   * Upwork's search URL params:
   *   q=            keywords
   *   sort=         recency | relevance
   *   t=            0 (Hourly) / 1 (Fixed)
   *   contractor_tier=  1 (Entry) / 2 (Intermediate) / 3 (Expert)
   *   hourly_rate=  25-  (low-high, $ / hr)
   *   amount=       500-  (fixed min)
   *   payment_verified=1
   *   duration_v3=  short | medium | long | ongoing
   *   per_page=     number of results
   */
  private buildJobSearchUrl(params: JobSearchParams): string {
    const url = new URL(UPWORK_URLS.JOBS_SEARCH);

    if (params.keywords) url.searchParams.set('q', params.keywords);
    url.searchParams.set('sort', 'recency');

    if (params.upworkHourlyMin || params.upworkHourlyMax) {
      const lo = params.upworkHourlyMin ?? '';
      const hi = params.upworkHourlyMax ?? '';
      url.searchParams.set('hourly_rate', `${lo}-${hi}`);
    }
    if (params.upworkFixedMin) {
      url.searchParams.set('amount', `${params.upworkFixedMin}-`);
    }
    if (params.upworkContractorTier) {
      url.searchParams.set('contractor_tier', String(params.upworkContractorTier));
    }
    if (params.upworkExperienceLevel) {
      const tierMap = { entry: '1', intermediate: '2', expert: '3' };
      url.searchParams.set('contractor_tier', tierMap[params.upworkExperienceLevel]);
    }
    if (params.upworkPaymentVerifiedOnly) {
      url.searchParams.set('payment_verified', '1');
    }
    if (params.upworkProjectLength) {
      url.searchParams.set('duration_v3', params.upworkProjectLength);
    }
    if (params.postedWithin) {
      // Upwork uses `t=` for posted-within buckets, but it's shared with job type.
      // Skip if ambiguous — recency sort already prioritizes fresh.
    }
    if (params.limit) {
      url.searchParams.set('per_page', String(Math.min(params.limit, 50)));
    }

    logger.debug('Built Upwork search URL', { url: url.toString() });
    return url.toString();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const session = await this.sessionManager.getSession({
        platform: this.platform,
        headless: false,
      });
      return session.state === 'READY';
    } catch (error) {
      logger.error('Upwork health check failed', { error });
      return false;
    }
  }
}
