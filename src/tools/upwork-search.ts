/**
 * Upwork Job Search Tool
 *
 * Extracts job listings from Upwork search results. Upwork heavily
 * JS-renders its job feed — we rely on DOM after hydration.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, JobLocation, Platform, type Job, type JobSearchParams } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('upwork-search');

const SELECTORS = {
  JOB_CARDS: 'article[data-test="JobTile"]',
  JOB_TITLE_LINK: 'h2 a.up-n-link, h2 a',
  JOB_TYPE: '[data-test="job-type-label"]',
  DURATION: '[data-test="duration-label"]',
  CONTRACTOR_TIER: '[data-test="contractor-tier-label"]',
  BUDGET: '[data-test="budget"]',
  IS_FIXED: '[data-test="is-fixed-price"]',
  DESCRIPTION: '[data-test="job-description-text"]',
  SKILL_TOKEN: '[data-test="attr-item"], [data-test="token"]',
  CLIENT_COUNTRY: '[data-test="client-country"]',
  TOTAL_SPENT: '[data-test="total-spent"]',
  PAYMENT_VERIFIED: '[data-test="client-payment-verification-status"]',
  RATING: '[data-test="rating-value"]',
  TOTAL_REVIEWS: '[data-test="total-reviews"]',
  POSTED_ON: '[data-test="posted-on"], [data-test="UpCRelativeTime"]',
  PROPOSALS: '[data-test="proposals-tier"], [data-test="proposals"]',
};

export async function extractJobListings(
  page: Page,
  params: JobSearchParams
): Promise<Job[]> {
  logger.info('Extracting Upwork job listings', { url: page.url() });

  try {
    await page.waitForSelector(SELECTORS.JOB_CARDS, { timeout: 15000 });

    const raw = await page.evaluate((selectors, limit) => {
      // @ts-expect-error - Running in browser context
      const cards = document.querySelectorAll(selectors.JOB_CARDS);
      const results: any[] = [];
      const max = Math.min(cards.length, limit || 20);

      const getText = (root: any, sel: string): string => {
        const el = root.querySelector(sel);
        return el?.textContent?.trim() || '';
      };
      const getAllText = (root: any, sel: string): string[] => {
        return Array.from(root.querySelectorAll(sel))
          .map((el: any) => el.textContent?.trim() || '')
          .filter(Boolean);
      };

      for (let i = 0; i < max; i++) {
        const card = cards[i];
        try {
          const link = card.querySelector(selectors.JOB_TITLE_LINK);
          if (!link) continue;
          const href = link.href;
          const idMatch = href.match(/\/jobs\/[^/]*(~[0-9a-f]+)/i);
          const jobId = idMatch ? idMatch[1] : href;

          results.push({
            jobId,
            url: href,
            title: link.textContent?.trim() || '',
            description: getText(card, selectors.DESCRIPTION),
            jobType: getText(card, selectors.JOB_TYPE),
            duration: getText(card, selectors.DURATION),
            contractorTier: getText(card, selectors.CONTRACTOR_TIER),
            budgetText: getText(card, selectors.BUDGET) || getText(card, selectors.IS_FIXED),
            skills: getAllText(card, selectors.SKILL_TOKEN),
            clientCountry: getText(card, selectors.CLIENT_COUNTRY),
            totalSpent: getText(card, selectors.TOTAL_SPENT),
            paymentVerified: getText(card, selectors.PAYMENT_VERIFIED),
            rating: getText(card, selectors.RATING),
            totalReviews: getText(card, selectors.TOTAL_REVIEWS),
            postedOn: getText(card, selectors.POSTED_ON),
            proposals: getText(card, selectors.PROPOSALS),
          });
        } catch {
          // skip broken cards
        }
      }
      return results;
    }, SELECTORS, params.limit || 20);

    const jobs: Job[] = raw.map((r: any) => transformCardToJob(r));
    logger.info('Extracted Upwork job cards', { count: jobs.length });
    return jobs;
  } catch (error) {
    logger.error('Failed to extract Upwork job listings', { error });
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract Upwork job listings',
      details: error,
      retryable: true,
    };
    throw oktyvError;
  }
}


/**
 * Transform a raw scraped card into our canonical Job.
 */
function transformCardToJob(r: any): Job {
  const isHourly = /\/hr|hour/i.test(r.budgetText) || /hourly/i.test(r.jobType);
  const salary = parseBudget(r.budgetText, isHourly);

  const job: Job = {
    id: r.jobId,
    url: r.url,
    source: Platform.UPWORK,
    title: r.title,
    company: r.clientCountry || 'Upwork Client',
    description: r.description,
    type: JobType.CONTRACT,
    location: {
      country: r.clientCountry || undefined,
      locationType: JobLocation.REMOTE,
    },
    postedDate: parseRelativeTime(r.postedOn),
    extractedDate: new Date(),
    skills: Array.isArray(r.skills) ? r.skills.slice(0, 20) : [],
  };

  if (salary) job.salary = salary;

  const upworkMeta: NonNullable<Job['upworkMeta']> = {};
  if (r.proposals) upworkMeta.proposalsRange = r.proposals.replace(/^proposals?:?\s*/i, '').trim();
  if (r.duration) upworkMeta.duration = r.duration;
  if (r.contractorTier) upworkMeta.upworkExperienceLevel = r.contractorTier;
  if (r.clientCountry) upworkMeta.clientCountry = r.clientCountry;
  if (r.totalSpent) upworkMeta.clientSpent = r.totalSpent;
  if (r.rating) {
    const n = parseFloat(r.rating);
    if (!isNaN(n)) upworkMeta.clientRating = n;
  }
  if (r.totalReviews) {
    const n = parseInt(r.totalReviews.replace(/\D/g, ''), 10);
    if (!isNaN(n)) upworkMeta.clientReviewCount = n;
  }
  if (/verified/i.test(r.paymentVerified)) upworkMeta.paymentVerified = true;

  if (Object.keys(upworkMeta).length > 0) job.upworkMeta = upworkMeta;
  return job;
}


function parseBudget(txt: string, isHourly: boolean) {
  if (!txt) return undefined;
  const rangeMatch = txt.match(/\$?([\d,.]+)\s*-\s*\$?([\d,.]+)/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    return { min, max, currency: 'USD', period: (isHourly ? 'HOURLY' : 'YEARLY') as 'HOURLY' | 'YEARLY' };
  }
  const singleMatch = txt.match(/\$?([\d,.]+)/);
  if (singleMatch) {
    const v = parseFloat(singleMatch[1].replace(/,/g, ''));
    return { min: v, max: v, currency: 'USD', period: (isHourly ? 'HOURLY' : 'YEARLY') as 'HOURLY' | 'YEARLY' };
  }
  return undefined;
}

function parseRelativeTime(txt: string): Date {
  const now = new Date();
  if (!txt) return now;
  const lower = txt.toLowerCase();
  if (lower.includes('yesterday')) return new Date(now.getTime() - 86400000);
  if (lower.includes('last week')) return new Date(now.getTime() - 604800000);
  if (lower.includes('last month')) return new Date(now.getTime() - 2592000000);
  const num = parseInt((lower.match(/(\d+)/) || ['0'])[0], 10);
  if (lower.includes('minute')) return new Date(now.getTime() - num * 60000);
  if (lower.includes('hour')) return new Date(now.getTime() - num * 3600000);
  if (lower.includes('day')) return new Date(now.getTime() - num * 86400000);
  if (lower.includes('week')) return new Date(now.getTime() - num * 604800000);
  if (lower.includes('month')) return new Date(now.getTime() - num * 2592000000);
  return now;
}


/**
 * Scroll to trigger loading more jobs in Upwork's infinite list.
 */
export async function scrollToLoadMore(page: Page, targetCount: number): Promise<void> {
  logger.debug('Scrolling Upwork results', { targetCount });
  let previousCount = 0;
  let attempts = 0;
  const maxAttempts = 8;

  while (attempts < maxAttempts) {
    await page.evaluate(() => {
      // @ts-expect-error - Running in browser context
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(res => setTimeout(res, 1200));

    const currentCount = await page.evaluate((sel) => {
      // @ts-expect-error - Running in browser context
      return document.querySelectorAll(sel).length;
    }, SELECTORS.JOB_CARDS);

    logger.debug('Scroll tick', { currentCount, targetCount, attempts });
    if (currentCount >= targetCount) break;
    if (currentCount === previousCount) break;
    previousCount = currentCount;
    attempts++;
  }
  logger.debug('Scroll complete', { attempts });
}
