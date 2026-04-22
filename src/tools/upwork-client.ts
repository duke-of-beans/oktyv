/**
 * Upwork Client Profile Tool
 *
 * Extracts client profile data from an Upwork client page. Upwork calls these
 * "clients" (not "companies"). Rare path — most useful client data is already
 * on the job detail page.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import type { Company } from '../types/company.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('upwork-client');

const SELECTORS = {
  NAME: '[data-test="client-name"], h1',
  LOCATION: '[data-test="client-location"], [data-test="client-country"]',
  JOBS_POSTED: '[data-test="jobs-posted"], [data-test="total-jobs"]',
  HIRE_RATE: '[data-test="hire-rate"]',
  TOTAL_SPENT: '[data-test="total-spent"], [data-test="client-spend"]',
  AVG_HOURLY: '[data-test="avg-hourly-rate"]',
  HOURS_BILLED: '[data-test="hours-billed"]',
  RATING: '[data-test="rating-value"]',
  REVIEW_COUNT: '[data-test="total-reviews"]',
  MEMBER_SINCE: '[data-test="member-since"]',
  PAYMENT_VERIFIED: '[data-test="payment-verified"]',
  INDUSTRY: '[data-test="industry"]',
  COMPANY_SIZE: '[data-test="company-size"]',
};

export async function extractClientDetail(page: Page, clientId: string): Promise<Company> {
  logger.info('Extracting Upwork client profile', { clientId, url: page.url() });

  try {
    await page.waitForSelector(SELECTORS.NAME, { timeout: 15000 });

    const raw = await page.evaluate((selectors) => {
      const getText = (sel: string): string => {
        // @ts-expect-error - Running in browser context
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || '';
      };
      return {
        name: getText(selectors.NAME),
        location: getText(selectors.LOCATION),
        jobsPosted: getText(selectors.JOBS_POSTED),
        hireRate: getText(selectors.HIRE_RATE),
        totalSpent: getText(selectors.TOTAL_SPENT),
        avgHourly: getText(selectors.AVG_HOURLY),
        hoursBilled: getText(selectors.HOURS_BILLED),
        rating: getText(selectors.RATING),
        reviewCount: getText(selectors.REVIEW_COUNT),
        memberSince: getText(selectors.MEMBER_SINCE),
        paymentVerified: getText(selectors.PAYMENT_VERIFIED),
        industry: getText(selectors.INDUSTRY),
        companySize: getText(selectors.COMPANY_SIZE),
        // @ts-expect-error - Running in browser context
        pageUrl: window.location.href,
      };
    }, SELECTORS);

    const company = {
      id: clientId,
      name: raw.name || 'Upwork Client',
      url: raw.pageUrl,
      raw,
    } as Company;

    logger.info('Upwork client extracted', { clientId, name: company.name });
    return company;
  } catch (error) {
    logger.error('Failed to extract Upwork client profile', { clientId, error });
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract Upwork client profile',
      details: error,
      retryable: true,
    };
    throw oktyvError;
  }
}
