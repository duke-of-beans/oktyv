/**
 * LinkedIn Job Search Tool
 * 
 * Extracts job listings from LinkedIn search results with pagination support.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, Platform, type Job, type JobSearchParams } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('linkedin-search');

/**
 * LinkedIn DOM selectors for job search
 */
const SELECTORS = {
  JOB_CARDS: 'ul.jobs-search__results-list > li',
  JOB_CARD_LINK: 'a.job-card-list__title',
  JOB_TITLE: '.job-card-list__title',
  COMPANY_NAME: '.job-card-container__company-name',
  LOCATION: '.job-card-container__metadata-item',
  POSTED_DATE: 'time',
  SALARY: '.job-card-container__salary-info',
  JOB_TYPE: '.job-card-container__job-insight-text',
};

/**
 * Extract job listings from LinkedIn search results page
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
          // Extract job ID from link
          // @ts-expect-error - Running in browser context
          const linkElement = card.querySelector(selectors.JOB_CARD_LINK) as HTMLAnchorElement;
          if (!linkElement) continue;

          const href = linkElement.href;
          const jobIdMatch = href.match(/\/jobs\/view\/(\d+)/);
          if (!jobIdMatch) continue;

          const jobId = jobIdMatch[1];

          // Extract title
          const titleElement = card.querySelector(selectors.JOB_TITLE);
          const title = titleElement?.textContent?.trim() || '';

          // Extract company
          const companyElement = card.querySelector(selectors.COMPANY_NAME);
          const company = companyElement?.textContent?.trim() || '';

          // Extract location
          const locationElements = card.querySelectorAll(selectors.LOCATION);
          let location = '';
          let locationType = 'ONSITE';
          
          for (const el of locationElements) {
            const text = el.textContent?.trim() || '';
            if (text && !text.includes('ago')) {
              location = text;
              if (text.toLowerCase().includes('remote')) {
                locationType = 'REMOTE';
              } else if (text.toLowerCase().includes('hybrid')) {
                locationType = 'HYBRID';
              }
              break;
            }
          }

          // Extract posted date
          const timeElement = card.querySelector(selectors.POSTED_DATE);
          const postedDateStr = timeElement?.getAttribute('datetime') || '';
          
          // Extract salary if available
          const salaryElement = card.querySelector(selectors.SALARY);
          const salaryText = salaryElement?.textContent?.trim() || '';

          // Build job object
          const job = {
            id: jobId,
            title,
            company,
            location,
            locationType,
            url: href,
            postedDateStr,
            salaryText,
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

      // Parse posted date
      const postedDate = rawJob.postedDateStr 
        ? new Date(rawJob.postedDateStr) 
        : new Date();

      // Parse salary if available
      const salary = parseSalary(rawJob.salaryText);

      // Determine job type (default to FULL_TIME if not specified)
      const jobType = JobType.FULL_TIME;

      const job: Job = {
        id: rawJob.id,
        title: rawJob.title,
        company: rawJob.company,
        location: {
          ...locationParts,
          locationType: rawJob.locationType as any,
        },
        type: jobType,
        description: '', // Will be filled in by getJob()
        postedDate,
        url: rawJob.url,
        source: Platform.LINKEDIN,
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
      message: 'Failed to extract job listings from LinkedIn',
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

  // Remove "Remote" or "Hybrid" if present
  const cleaned = locationStr
    .replace(/\(Remote\)/i, '')
    .replace(/\(Hybrid\)/i, '')
    .trim();

  // Try to parse "City, State" or "City, Country"
  const parts = cleaned.split(',').map(p => p.trim());

  if (parts.length === 0) return {};
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  if (parts.length === 2) {
    return {
      city: parts[0],
      state: parts[1],
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

  // LinkedIn typically shows salary as "$100K - $150K/yr"
  const rangeMatch = salaryText.match(/\$?([\d,]+)K?\s*-\s*\$?([\d,]+)K?/);
  if (!rangeMatch) return undefined;

  const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
  const max = parseFloat(rangeMatch[2].replace(/,/g, ''));

  // Determine if it's in thousands
  const isK = salaryText.includes('K');
  const multiplier = isK ? 1000 : 1;

  // Determine period
  let period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'YEARLY';
  if (salaryText.includes('/hr') || salaryText.includes('hour')) {
    period = 'HOURLY';
  } else if (salaryText.includes('/mo') || salaryText.includes('month')) {
    period = 'MONTHLY';
  }

  return {
    min: min * multiplier,
    max: max * multiplier,
    currency: 'USD',
    period,
  };
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
    await new Promise(resolve => setTimeout(resolve, 1000));

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
