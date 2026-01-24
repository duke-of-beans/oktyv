/**
 * Wellfound Connector
 * 
 * Base connector for Wellfound (formerly AngelList Talent) automation.
 * Startup-focused job board with intelligent navigation and error handling.
 */

import { createLogger } from '../utils/logger.js';
import type { BrowserSessionManager } from '../browser/session.js';
import type { RateLimiter } from '../browser/rate-limiter.js';
import type { Job, JobSearchParams } from '../types/job.js';
import type { Company } from '../types/company.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';
import { extractJobListings, scrollToLoadMore } from '../tools/wellfound-search.js';
import { extractJobDetail } from '../tools/wellfound-job.js';
import { extractCompanyDetail } from '../tools/wellfound-company.js';

const logger = createLogger('wellfound-connector');

/**
 * Wellfound-specific URLs
 */
const WELLFOUND_URLS = {
  BASE: 'https://wellfound.com',
  JOBS_SEARCH: 'https://wellfound.com/jobs',
  JOB_DETAIL: (jobSlug: string) => `https://wellfound.com/l/${jobSlug}`,
  COMPANY: (companySlug: string) => `https://wellfound.com/company/${companySlug}`,
};

/**
 * Wellfound connector for job search and data extraction
 */
export class WellfoundConnector {
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private platform: 'WELLFOUND' = 'WELLFOUND';

  constructor(sessionManager: BrowserSessionManager, rateLimiter: RateLimiter) {
    this.sessionManager = sessionManager;
    this.rateLimiter = rateLimiter;
    logger.info('WellfoundConnector initialized');
  }

  /**
   * Ensure browser session is ready for Wellfound
   * Note: Wellfound doesn't require login for basic job browsing
   */
  async ensureReady(): Promise<void> {
    logger.debug('Checking Wellfound session readiness');

    // Get or create session
    await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    logger.info('Wellfound session ready');
  }

  /**
   * Search for jobs on Wellfound
   */
  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    logger.info('Searching Wellfound jobs', { params });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure session ready
    await this.ensureReady();

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
        waitForSelector: '[data-test="JobSearchResults"]',
        timeout: 30000,
      });

      // Scroll to load more results if needed
      const targetCount = params.limit || 10;
      if (targetCount > 20) {
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
        message: 'Failed to search Wellfound jobs',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Get detailed job information
   */
  async getJob(jobSlug: string, includeCompany: boolean = false): Promise<{ job: Job; company?: Company }> {
    logger.info('Fetching Wellfound job', { jobSlug, includeCompany });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure session ready
    await this.ensureReady();

    // Get session
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    try {
      // Navigate to job detail page
      const jobUrl = WELLFOUND_URLS.JOB_DETAIL(jobSlug);
      
      await this.sessionManager.navigate(this.platform, {
        url: jobUrl,
        waitForSelector: '[data-test="JobDetailPage"]',
        timeout: 30000,
      });

      // Extract job details
      const job = await extractJobDetail(session.page, jobSlug);

      logger.info('Job fetch complete', { jobSlug, title: job.title });

      // Fetch company details if requested
      let company: Company | undefined;
      if (includeCompany && job.companyId) {
        try {
          logger.info('Fetching company details', { companyId: job.companyId });
          company = await this.getCompany(job.companyId);
        } catch (error) {
          logger.warn('Failed to fetch company details, continuing without it', { 
            companyId: job.companyId, 
            error 
          });
        }
      }

      return { job, company };

    } catch (error) {
      logger.error('Job fetch failed', { jobSlug, error });
      
      // If it's already an OktyvError, rethrow it
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

      // Otherwise wrap in PARSE_ERROR
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to fetch Wellfound job',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Get company information
   */
  async getCompany(companySlug: string): Promise<Company> {
    logger.info('Fetching Wellfound company', { companySlug });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure session ready
    await this.ensureReady();

    // Get session
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    try {
      // Navigate to company page
      const companyUrl = WELLFOUND_URLS.COMPANY(companySlug);
      
      await this.sessionManager.navigate(this.platform, {
        url: companyUrl,
        waitForSelector: '[data-test="CompanyPage"]',
        timeout: 30000,
      });

      // Extract company details
      const company = await extractCompanyDetail(session.page, companySlug);

      logger.info('Company fetch complete', { companySlug, name: company.name });
      return company;

    } catch (error) {
      logger.error('Company fetch failed', { companySlug, error });
      
      // If it's already an OktyvError, rethrow it
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

      // Otherwise wrap in PARSE_ERROR
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to fetch Wellfound company',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Build Wellfound job search URL with parameters
   */
  private buildJobSearchUrl(params: JobSearchParams): string {
    const url = new URL(WELLFOUND_URLS.JOBS_SEARCH);

    // Keywords as search query
    if (params.keywords) {
      url.searchParams.set('q', params.keywords);
    }

    // Location
    if (params.location) {
      url.searchParams.set('location', params.location);
    }

    // Remote filter
    if (params.remote) {
      url.searchParams.set('remote', 'true');
    }

    // Job type filter (Wellfound uses different naming)
    if (params.jobType && params.jobType.length > 0) {
      const typeMap: Record<string, string> = {
        FULL_TIME: 'full-time',
        PART_TIME: 'part-time',
        CONTRACT: 'contract',
        INTERNSHIP: 'internship',
      };
      const types = params.jobType.map(t => typeMap[t]).filter(Boolean);
      if (types.length > 0) {
        url.searchParams.set('job_type', types.join(','));
      }
    }

    // Experience level filter
    if (params.experienceLevel && params.experienceLevel.length > 0) {
      const levelMap: Record<string, string> = {
        ENTRY_LEVEL: 'junior',
        MID_LEVEL: 'mid',
        SENIOR_LEVEL: 'senior',
        DIRECTOR: 'lead',
        EXECUTIVE: 'principal',
      };
      const levels = params.experienceLevel.map(l => levelMap[l]).filter(Boolean);
      if (levels.length > 0) {
        url.searchParams.set('experience', levels.join(','));
      }
    }

    // Salary minimum
    if (params.salaryMin) {
      url.searchParams.set('min_salary', params.salaryMin.toString());
    }

    // Pagination (Wellfound uses page number, not offset)
    if (params.offset) {
      const page = Math.floor(params.offset / 20) + 1; // 20 results per page
      url.searchParams.set('page', page.toString());
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
