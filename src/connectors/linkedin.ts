/**
 * LinkedIn Connector
 * 
 * Base connector for LinkedIn automation with intelligent navigation,
 * login detection, and error handling.
 */

import { createLogger } from '../utils/logger.js';
import type { BrowserSessionManager } from '../browser/session.js';
import type { RateLimiter } from '../browser/rate-limiter.js';
import type { Job, JobSearchParams } from '../types/job.js';
import type { Company } from '../types/company.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';
import { extractJobListings, scrollToLoadMore } from '../tools/linkedin-search.js';

const logger = createLogger('linkedin-connector');

/**
 * LinkedIn-specific URLs
 */
const LINKEDIN_URLS = {
  BASE: 'https://www.linkedin.com',
  LOGIN: 'https://www.linkedin.com/login',
  FEED: 'https://www.linkedin.com/feed/',
  JOBS_SEARCH: 'https://www.linkedin.com/jobs/search/',
  JOB_DETAIL: (jobId: string) => `https://www.linkedin.com/jobs/view/${jobId}`,
  COMPANY: (companyId: string) => `https://www.linkedin.com/company/${companyId}`,
};

/**
 * LinkedIn connector for job search and data extraction
 */
export class LinkedInConnector {
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private platform: 'LINKEDIN' = 'LINKEDIN';

  constructor(sessionManager: BrowserSessionManager, rateLimiter: RateLimiter) {
    this.sessionManager = sessionManager;
    this.rateLimiter = rateLimiter;
    logger.info('LinkedInConnector initialized');
  }

  /**
   * Ensure user is logged into LinkedIn
   */
  async ensureLoggedIn(): Promise<void> {
    logger.debug('Checking LinkedIn login status');

    // Get or create session
    await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    // Detect login state
    const loginResult = await this.sessionManager.detectLogin(this.platform);

    if (loginResult.isLoggedIn) {
      logger.info('User is logged into LinkedIn', { method: loginResult.method });
      return;
    }

    // Not logged in - navigate to feed to trigger login
    logger.warn('User not logged into LinkedIn, navigating to feed');

    await this.sessionManager.navigate(this.platform, {
      url: LINKEDIN_URLS.FEED,
      timeout: 30000,
    });

    // Check again after navigation
    const secondCheck = await this.sessionManager.detectLogin(this.platform);

    if (!secondCheck.isLoggedIn) {
      const error: OktyvError = {
        code: OktyvErrorCode.NOT_LOGGED_IN,
        message: 'Please log into LinkedIn in your browser. The browser window should open automatically.',
        retryable: false,
      };

      logger.error('Login required', error);
      throw error;
    }

    logger.info('Successfully logged into LinkedIn');
  }

  /**
   * Search for jobs on LinkedIn
   */
  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    logger.info('Searching LinkedIn jobs', { params });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure logged in
    await this.ensureLoggedIn();

    // Get session
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    try {
      // Navigate to search with parameters
      const searchUrl = this.buildJobSearchUrl(params);
      
      await this.sessionManager.navigate(this.platform, {
        url: searchUrl,
        waitForSelector: '.jobs-search__results-list',
        timeout: 30000,
      });

      // Scroll to load more results if needed
      const targetCount = params.limit || 10;
      if (targetCount > 10) {
        await scrollToLoadMore(session.page, targetCount);
      }

      // Extract job listings
      const jobs = await extractJobListings(session.page, params);

      logger.info('Job search complete', { count: jobs.length });
      return jobs;

    } catch (error) {
      logger.error('Job search failed', { error });
      
      // If it's already an OktyvError, rethrow it
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

      // Otherwise wrap in PARSE_ERROR
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to search LinkedIn jobs',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Get detailed job information
   */
  async getJob(jobId: string, includeCompany: boolean = false): Promise<{ job: Job; company?: Company }> {
    logger.info('Fetching LinkedIn job', { jobId, includeCompany });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure logged in
    await this.ensureLoggedIn();

    // TODO: Implement actual job fetch logic
    logger.warn('Job fetch not yet implemented');

    throw {
      code: OktyvErrorCode.NOT_IMPLEMENTED,
      message: 'LinkedIn job fetch implementation in progress',
      retryable: false,
    } as OktyvError;
  }

  /**
   * Get company information
   */
  async getCompany(companyId: string): Promise<Company> {
    logger.info('Fetching LinkedIn company', { companyId });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure logged in
    await this.ensureLoggedIn();

    // TODO: Implement actual company fetch logic
    logger.warn('Company fetch not yet implemented');

    throw {
      code: OktyvErrorCode.NOT_IMPLEMENTED,
      message: 'LinkedIn company fetch implementation in progress',
      retryable: false,
    } as OktyvError;
  }

  /**
   * Navigate to LinkedIn jobs search page
   * @private Reserved for future implementation
   */
  // @ts-expect-error - Reserved for future implementation
  private async navigateToJobsSearch(params: JobSearchParams): Promise<void> {
    logger.debug('Navigating to LinkedIn jobs search', { params });

    // Build search URL with parameters
    const searchUrl = this.buildJobSearchUrl(params);

    await this.sessionManager.navigate(this.platform, {
      url: searchUrl,
      waitForSelector: '.jobs-search-results-list',
      timeout: 30000,
    });

    logger.debug('Navigation to jobs search complete');
  }

  /**
   * Build LinkedIn job search URL with parameters
   */
  private buildJobSearchUrl(params: JobSearchParams): string {
    const url = new URL(LINKEDIN_URLS.JOBS_SEARCH);

    // Keywords
    if (params.keywords) {
      url.searchParams.set('keywords', params.keywords);
    }

    // Location
    if (params.location) {
      url.searchParams.set('location', params.location);
    }

    // Remote filter
    if (params.remote) {
      url.searchParams.set('f_WT', '2'); // LinkedIn's remote work filter
    }

    // Job type filter
    if (params.jobType && params.jobType.length > 0) {
      const typeMap: Record<string, string> = {
        FULL_TIME: 'F',
        PART_TIME: 'P',
        CONTRACT: 'C',
        TEMPORARY: 'T',
        INTERNSHIP: 'I',
      };
      const types = params.jobType.map(t => typeMap[t]).filter(Boolean);
      if (types.length > 0) {
        url.searchParams.set('f_JT', types.join(','));
      }
    }

    // Experience level filter
    if (params.experienceLevel && params.experienceLevel.length > 0) {
      const levelMap: Record<string, string> = {
        INTERNSHIP: '1',
        ENTRY_LEVEL: '2',
        ASSOCIATE: '3',
        MID_SENIOR: '4',
        DIRECTOR: '5',
        EXECUTIVE: '6',
      };
      const levels = params.experienceLevel.map(l => levelMap[l]).filter(Boolean);
      if (levels.length > 0) {
        url.searchParams.set('f_E', levels.join(','));
      }
    }

    // Posted within filter
    if (params.postedWithin) {
      const timeMap: Record<string, string> = {
        '24h': 'r86400',
        '7d': 'r604800',
        '30d': 'r2592000',
      };
      const timeFilter = timeMap[params.postedWithin];
      if (timeFilter) {
        url.searchParams.set('f_TPR', timeFilter);
      }
    }

    // Pagination
    if (params.offset) {
      url.searchParams.set('start', params.offset.toString());
    }

    logger.debug('Built search URL', { url: url.toString() });
    return url.toString();
  }

  /**
   * Check if session is healthy and ready
   */
  async healthCheck(): Promise<boolean> {
    try {
      const session = await this.sessionManager.getSession({
        platform: this.platform,
        headless: true,
      });

      return session.state === 'READY';
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }
}
