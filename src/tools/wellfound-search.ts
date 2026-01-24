/**
 * Wellfound Job Search Tool
 * 
 * Extracts job listings from Wellfound search results with pagination support.
 * Wellfound (formerly AngelList Talent) is startup-focused.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, JobLocation, Platform, type Job, type JobSearchParams } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('wellfound-search');

/**
 * Wellfound DOM selectors for job search
 */
const SELECTORS = {
  JOB_CARDS: '[data-test="JobSearchResults"] > div',
  JOB_CARD: '[data-test="JobCard"]',
  JOB_LINK: 'a[data-test="JobTitle"]',
  COMPANY_NAME: '[data-test="CompanyName"]',
  LOCATION: '[data-test="JobLocation"]',
  SALARY: '[data-test="SalaryRange"]',
  JOB_TYPE: '[data-test="JobType"]',
  COMPANY_SIZE: '[data-test="CompanySize"]',
  FUNDING: '[data-test="CompanyFunding"]',
};

/**
 * Extract job listings from Wellfound search results page
 */
export async function extractJobListings(
  page: Page,
  params: JobSearchParams
): Promise<Job[]> {
  logger.info('Extracting job listings from page', { url: page.url() });

  try {
    // Wait for job results to load
    await page.waitForSelector(SELECTORS.JOB_CARDS, { timeout: 10000 });

    // Get all job card elements
    const jobs = await page.evaluate((selectors, limit) => {
      // @ts-expect-error - Running in browser context
      const jobCards = document.querySelectorAll(selectors.JOB_CARDS);
      const results: any[] = [];

      const maxCards = Math.min(jobCards.length, limit || 10);

      for (let i = 0; i < maxCards; i++) {
        const card = jobCards[i];

        try {
          // Extract job link and slug
          // @ts-expect-error - Running in browser context
          const linkElement = card.querySelector(selectors.JOB_LINK) as HTMLAnchorElement;
          if (!linkElement) continue;

          const href = linkElement.href;
          const slugMatch = href.match(/\/l\/([^/?]+)/);
          if (!slugMatch) continue;

          const jobSlug = slugMatch[1];

          // Extract title
          const title = linkElement.textContent?.trim() || '';

          // Extract company
          const companyElement = card.querySelector(selectors.COMPANY_NAME);
          const company = companyElement?.textContent?.trim() || '';

          // Extract company slug from company link
          let companySlug = '';
          const companyLink = card.querySelector('[data-test="CompanyName"] a');
          if (companyLink) {
            const companyHref = (companyLink as any).href;
            const companyMatch = companyHref.match(/\/company\/([^/?]+)/);
            if (companyMatch) {
              companySlug = companyMatch[1];
            }
          }

          // Extract location
          const locationElement = card.querySelector(selectors.LOCATION);
          const location = locationElement?.textContent?.trim() || '';

          // Determine location type
          let locationType = 'ONSITE';
          const locationLower = location.toLowerCase();
          if (locationLower.includes('remote')) {
            locationType = 'REMOTE';
          } else if (locationLower.includes('hybrid')) {
            locationType = 'HYBRID';
          }

          // Extract salary if available
          const salaryElement = card.querySelector(selectors.SALARY);
          const salaryText = salaryElement?.textContent?.trim() || '';

          // Extract job type if available
          const jobTypeElement = card.querySelector(selectors.JOB_TYPE);
          const jobTypeText = jobTypeElement?.textContent?.trim() || '';

          // Extract company size
          const companySizeElement = card.querySelector(selectors.COMPANY_SIZE);
          const companySizeText = companySizeElement?.textContent?.trim() || '';

          // Extract funding info
          const fundingElement = card.querySelector(selectors.FUNDING);
          const fundingText = fundingElement?.textContent?.trim() || '';

          // Build job object
          const job = {
            jobSlug,
            title,
            company,
            companySlug,
            location,
            locationType,
            url: href,
            salaryText,
            jobTypeText,
            companySizeText,
            fundingText,
          };

          results.push(job);
        } catch (error) {
          console.error('Error extracting job card:', error);
        }
      }

      return results;
    }, SELECTORS, params.limit || 10);

    // Transform raw data into Job objects
    const transformedJobs: Job[] = jobs.map((rawJob: any) => {
      // Parse location
      const locationParts = parseLocation(rawJob.location);

      // Parse salary if available
      const salary = parseSalary(rawJob.salaryText);

      // Parse job type
      const jobType = parseJobType(rawJob.jobTypeText);

      // Posted date (Wellfound doesn't show this in search, use current date)
      const postedDate = new Date();

      const job: Job = {
        id: rawJob.jobSlug,
        title: rawJob.title,
        company: rawJob.company,
        companyId: rawJob.companySlug || undefined,
        location: {
          ...locationParts,
          locationType: rawJob.locationType as JobLocation,
        },
        type: jobType,
        description: '', // Full description will be filled by getJob()
        postedDate,
        url: rawJob.url,
        source: Platform.WELLFOUND,
        extractedDate: new Date(),
      };

      // Add salary if available
      if (salary) {
        job.salary = salary;
      }

      return job;
    });

    logger.info('Successfully extracted job listings', { count: transformedJobs.length });
    return transformedJobs;

  } catch (error) {
    logger.error('Failed to extract job listings', { error });
    
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract job listings from Wellfound',
      details: error,
      retryable: true,
    };
    
    throw oktyvError;
  }
}

/**
 * Parse location string into structured format
 */
function parseLocation(locationStr: string): {
  city?: string;
  state?: string;
  country?: string;
} {
  if (!locationStr) return {};

  // Remove location type markers
  const cleaned = locationStr
    .replace(/Remote/gi, '')
    .replace(/Hybrid/gi, '')
    .trim();

  // Wellfound often shows: "San Francisco" or "San Francisco, CA" or "United States"
  const parts = cleaned.split(',').map(p => p.trim());

  if (parts.length === 0) return {};
  if (parts.length === 1) {
    // Could be city or country
    if (parts[0].length === 2 || parts[0] === 'United States') {
      return { country: parts[0] };
    }
    return { city: parts[0] };
  }
  if (parts.length === 2) {
    // City, State or City, Country
    if (parts[1].length === 2) {
      return {
        city: parts[0],
        state: parts[1],
        country: 'US',
      };
    }
    return {
      city: parts[0],
      country: parts[1],
    };
  }
  if (parts.length === 3) {
    return {
      city: parts[0],
      state: parts[1],
      country: parts[2],
    };
  }

  return { city: parts[0] };
}

/**
 * Parse salary string into structured format
 */
function parseSalary(salaryText: string): {
  min?: number;
  max?: number;
  currency: string;
  period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
} | undefined {
  if (!salaryText) return undefined;

  // Wellfound shows: "$120k - $180k" or "$150k"
  const numbers = salaryText.match(/\$?([\d,]+)k?/gi);
  if (!numbers || numbers.length === 0) return undefined;

  const cleanNumbers = numbers.map(n => {
    const num = parseFloat(n.replace(/[$,k]/gi, ''));
    // If it has 'k', multiply by 1000
    return n.toLowerCase().includes('k') ? num * 1000 : num;
  });

  // Wellfound typically shows annual salary
  const period = 'YEARLY';

  if (cleanNumbers.length === 1) {
    return {
      min: cleanNumbers[0],
      currency: 'USD',
      period,
    };
  }

  return {
    min: Math.min(...cleanNumbers),
    max: Math.max(...cleanNumbers),
    currency: 'USD',
    period,
  };
}

/**
 * Parse job type from text
 */
function parseJobType(jobTypeText: string): JobType {
  if (!jobTypeText) return JobType.FULL_TIME;

  const lower = jobTypeText.toLowerCase();

  if (lower.includes('part-time') || lower.includes('part time')) {
    return JobType.PART_TIME;
  }
  if (lower.includes('contract') || lower.includes('contractor')) {
    return JobType.CONTRACT;
  }
  if (lower.includes('intern')) {
    return JobType.INTERNSHIP;
  }

  // Default to full-time (most common on Wellfound)
  return JobType.FULL_TIME;
}

/**
 * Scroll to load more jobs (if lazy loading)
 */
export async function scrollToLoadMore(page: Page, targetCount: number): Promise<void> {
  logger.debug('Scrolling to load more jobs', { targetCount });

  let previousHeight = 0;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    // Scroll to bottom
    await page.evaluate(() => {
      // @ts-expect-error - Running in browser context
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for potential new content
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check if we've loaded enough
    const currentCount = await page.evaluate((selector) => {
      // @ts-expect-error - Running in browser context
      return document.querySelectorAll(selector).length;
    }, SELECTORS.JOB_CARDS);

    logger.debug('Scroll check', { currentCount, targetCount, attempts });

    if (currentCount >= targetCount) {
      break;
    }

    // Check if page height changed
    const newHeight = await page.evaluate(() => {
      // @ts-expect-error - Running in browser context
      return document.body.scrollHeight;
    });
    if (newHeight === previousHeight) {
      // No new content loaded
      break;
    }

    previousHeight = newHeight;
    attempts++;
  }

  logger.debug('Finished scrolling', { attempts });
}
