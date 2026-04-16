/**
 * Indeed Connector
 *
 * Wraps indeed-search.ts, indeed-job.ts, indeed-company.ts utility functions
 * into a BrowserSessionManager-backed connector class, matching the pattern
 * of LinkedInConnector and WellfoundConnector.
 */

import { BrowserSessionManager } from '../browser/session.js';
import { RateLimiter } from '../browser/rate-limiter.js';
import { extractJobListings } from '../tools/indeed-search.js';
import { extractJobDetail } from '../tools/indeed-job.js';
import { extractCompanyDetail } from '../tools/indeed-company.js';
import { createLogger } from '../utils/logger.js';
import type { Job, JobSearchParams } from '../types/job.js';
import { Platform } from '../types/job.js';
import type { Company } from '../types/company.js';

const logger = createLogger('indeed-connector');

export class IndeedConnector {
  constructor(
    private sessionManager: BrowserSessionManager,
    private rateLimiter: RateLimiter
  ) {}

  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    logger.info('Searching Indeed jobs', { params });
    const session = await this.sessionManager.getSession({ platform: Platform.INDEED });
    const page = session.page;
    const q = encodeURIComponent(params.keywords || '');
    const l = encodeURIComponent(params.location || '');
    const url = `https://www.indeed.com/jobs?q=${q}&l=${l}&limit=${params.limit || 10}`;
    await this.rateLimiter.waitForToken(Platform.INDEED);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return await extractJobListings(page, params);
  }

  async getJob(jobKey: string, includeCompany = false): Promise<{ job: Job; company?: Company }> {
    logger.info('Getting Indeed job detail', { jobKey });
    const session = await this.sessionManager.getSession({ platform: Platform.INDEED });
    const page = session.page;
    await this.rateLimiter.waitForToken(Platform.INDEED);
    await page.goto(`https://www.indeed.com/viewjob?jk=${jobKey}`, { waitUntil: 'networkidle2', timeout: 30000 });
    const job = await extractJobDetail(page, jobKey);
    let company: Company | undefined;
    if (includeCompany && job.companyId) {
      company = await this.getCompanyById(job.companyId);
    }
    return { job, company };
  }

  async getCompany(companyId: string): Promise<Company> {
    return this.getCompanyById(companyId);
  }

  private async getCompanyById(companyId: string): Promise<Company> {
    logger.info('Getting Indeed company', { companyId });
    const session = await this.sessionManager.getSession({ platform: Platform.INDEED });
    const page = session.page;
    await this.rateLimiter.waitForToken(Platform.INDEED);
    await page.goto(`https://www.indeed.com/cmp/${encodeURIComponent(companyId)}`, { waitUntil: 'networkidle2', timeout: 30000 });
    return await extractCompanyDetail(page, companyId);
  }
}
