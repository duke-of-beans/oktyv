/**
 * Wellfound Company Detail Tool
 * 
 * Extracts company information from Wellfound company pages.
 * Wellfound (formerly AngelList Talent) focuses on startups with funding data.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { CompanySize, Industry, Platform, type Company } from '../types/company.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('wellfound-company');

/**
 * Wellfound DOM selectors for company pages
 */
const SELECTORS = {
  NAME: '[data-test="CompanyName"]',
  TAGLINE: '[data-test="CompanyTagline"]',
  WEBSITE: '[data-test="CompanyWebsite"] a',
  DESCRIPTION: '[data-test="CompanyDescription"]',
  SIZE: '[data-test="CompanySize"]',
  INDUSTRY: '[data-test="CompanyIndustry"]',
  FOUNDED: '[data-test="CompanyFounded"]',
  LOCATION: '[data-test="CompanyLocation"]',
  FUNDING_STAGE: '[data-test="FundingStage"]',
  TOTAL_RAISED: '[data-test="TotalRaised"]',
  FOLLOWERS: '[data-test="FollowerCount"]',
  BENEFITS: '[data-test="CompanyBenefits"] li',
  SPECIALTIES: '[data-test="Specialties"] span',
};

/**
 * Extract company details from Wellfound company page
 */
export async function extractCompanyDetail(
  page: Page,
  companySlug: string
): Promise<Company> {
  logger.info('Extracting company detail', { companySlug, url: page.url() });

  try {
    // Wait for company info section
    await page.waitForSelector(SELECTORS.NAME, { timeout: 10000 });

    // Extract all company data
    const companyData = await page.evaluate((selectors) => {
      // Helper to safely get text content
      const getText = (selector: string): string => {
        // @ts-expect-error - Running in browser context
        const element = document.querySelector(selector);
        return element?.textContent?.trim() || '';
      };

      // Helper to get attribute
      const getAttr = (selector: string, attr: string): string => {
        // @ts-expect-error - Running in browser context
        const element = document.querySelector(selector);
        return element?.getAttribute(attr) || '';
      };

      // Helper to get all text from multiple elements
      const getAll = (selector: string): string[] => {
        // @ts-expect-error - Running in browser context
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el: any) => el.textContent?.trim() || '').filter(Boolean);
      };

      const name = getText(selectors.NAME);
      const tagline = getText(selectors.TAGLINE);
      const website = getAttr(selectors.WEBSITE, 'href');
      const description = getText(selectors.DESCRIPTION);
      const sizeText = getText(selectors.SIZE);
      const industryText = getText(selectors.INDUSTRY);
      const foundedText = getText(selectors.FOUNDED);
      const locationText = getText(selectors.LOCATION);
      const fundingStageText = getText(selectors.FUNDING_STAGE);
      const totalRaisedText = getText(selectors.TOTAL_RAISED);
      const followersText = getText(selectors.FOLLOWERS);
      const benefits = getAll(selectors.BENEFITS);
      const specialties = getAll(selectors.SPECIALTIES);

      return {
        name,
        tagline,
        website,
        description,
        sizeText,
        industryText,
        foundedText,
        locationText,
        fundingStageText,
        totalRaisedText,
        followersText,
        benefits,
        specialties,
      };
    }, SELECTORS);

    // Parse company size
    const size = parseCompanySize(companyData.sizeText);

    // Parse industry
    const industry = parseIndustry(companyData.industryText);

    // Parse founded year
    const founded = parseFounded(companyData.foundedText);

    // Parse location
    const location = parseLocation(companyData.locationText);

    // Parse funding info
    const funding = parseFunding(companyData.fundingStageText, companyData.totalRaisedText);

    // Parse follower count
    const followerCount = parseFollowerCount(companyData.followersText);

    // Build Company object
    const company: Company = {
      id: companySlug,
      name: companyData.name || companySlug,
      description: companyData.description,
      industry,
      size,
      url: page.url(),
      source: Platform.WELLFOUND,
      extractedDate: new Date(),
    };

    // Add optional fields
    if (companyData.tagline) {
      company.tagline = companyData.tagline;
    }

    if (companyData.website) {
      company.website = companyData.website;
    }

    if (founded) {
      company.founded = founded;
    }

    if (location.city || location.state || location.country) {
      company.headquarters = {
        city: location.city,
        state: location.state,
        country: location.country,
      };
    }

    if (funding) {
      company.funding = funding;
    }

    if (followerCount) {
      company.followerCount = followerCount;
    }

    if (companyData.specialties.length > 0) {
      company.specialties = companyData.specialties;
    }

    if (companyData.benefits.length > 0) {
      company.benefits = companyData.benefits;
    }

    logger.info('Successfully extracted company detail', { 
      companySlug, 
      name: company.name,
      industry: company.industry 
    });
    
    return company;

  } catch (error) {
    logger.error('Failed to extract company detail', { companySlug, error });
    
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract company details from Wellfound',
      details: error,
      retryable: true,
    };
    
    throw oktyvError;
  }
}

/**
 * Parse company size from text
 */
function parseCompanySize(sizeText: string): CompanySize {
  if (!sizeText) return CompanySize.UNKNOWN;

  // Wellfound shows: "1-10 employees", "11-50 employees", etc.
  const match = sizeText.match(/(\d+)\s*-?\s*(\d+)?/);
  if (!match) return CompanySize.UNKNOWN;

  const min = parseInt(match[1], 10);
  const max = match[2] ? parseInt(match[2], 10) : min;

  if (max <= 10) return CompanySize.STARTUP;
  if (max <= 50) return CompanySize.SMALL;
  if (max <= 200) return CompanySize.MEDIUM;
  if (max <= 1000) return CompanySize.LARGE;
  return CompanySize.ENTERPRISE;
}

/**
 * Parse industry from text
 */
function parseIndustry(industryText: string): Industry {
  if (!industryText) return Industry.UNKNOWN;

  const lower = industryText.toLowerCase();

  if (lower.includes('tech') || lower.includes('software') || lower.includes('it') || lower.includes('saas')) {
    return Industry.TECHNOLOGY;
  }
  if (lower.includes('finance') || lower.includes('fintech') || lower.includes('bank')) {
    return Industry.FINANCE;
  }
  if (lower.includes('health') || lower.includes('medical') || lower.includes('biotech')) {
    return Industry.HEALTHCARE;
  }
  if (lower.includes('retail') || lower.includes('ecommerce') || lower.includes('commerce')) {
    return Industry.RETAIL;
  }
  if (lower.includes('education') || lower.includes('edtech')) {
    return Industry.EDUCATION;
  }
  if (lower.includes('manufact')) {
    return Industry.MANUFACTURING;
  }
  if (lower.includes('consult')) {
    return Industry.CONSULTING;
  }
  if (lower.includes('media') || lower.includes('entertainment')) {
    return Industry.MEDIA;
  }
  if (lower.includes('hospitality') || lower.includes('travel')) {
    return Industry.HOSPITALITY;
  }
  if (lower.includes('cannabis') || lower.includes('cbd')) {
    return Industry.CANNABIS;
  }

  return Industry.OTHER;
}

/**
 * Parse founded year from text
 */
function parseFounded(foundedText: string): number | undefined {
  if (!foundedText) return undefined;

  const match = foundedText.match(/(\d{4})/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * Parse location from text
 */
function parseLocation(locationText: string): {
  city?: string;
  state?: string;
  country?: string;
} {
  if (!locationText) return {};

  const parts = locationText.split(',').map(p => p.trim());

  if (parts.length === 0) return {};
  if (parts.length === 1) {
    if (parts[0].length === 2 || parts[0] === 'United States') {
      return { country: parts[0] };
    }
    return { city: parts[0] };
  }
  if (parts.length === 2) {
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
 * Parse funding information
 */
function parseFunding(fundingStageText: string, totalRaisedText: string): {
  stage?: 'SEED' | 'SERIES_A' | 'SERIES_B' | 'SERIES_C' | 'SERIES_D' | 'IPO' | 'ACQUIRED';
  totalRaised?: number;
  currency?: string;
} | undefined {
  if (!fundingStageText && !totalRaisedText) return undefined;

  const funding: any = {};

  // Parse funding stage
  if (fundingStageText) {
    const lower = fundingStageText.toLowerCase();
    
    if (lower.includes('seed')) {
      funding.stage = 'SEED';
    } else if (lower.includes('series a')) {
      funding.stage = 'SERIES_A';
    } else if (lower.includes('series b')) {
      funding.stage = 'SERIES_B';
    } else if (lower.includes('series c')) {
      funding.stage = 'SERIES_C';
    } else if (lower.includes('series d')) {
      funding.stage = 'SERIES_D';
    } else if (lower.includes('ipo') || lower.includes('public')) {
      funding.stage = 'IPO';
    } else if (lower.includes('acquired')) {
      funding.stage = 'ACQUIRED';
    }
  }

  // Parse total raised amount
  if (totalRaisedText) {
    // Wellfound shows: "$10M", "$1.5B", etc.
    const match = totalRaisedText.match(/\$?([\d.]+)\s*([KMB])/i);
    if (match) {
      let amount = parseFloat(match[1]);
      const multiplier = match[2].toUpperCase();

      if (multiplier === 'K') {
        amount *= 1000;
      } else if (multiplier === 'M') {
        amount *= 1000000;
      } else if (multiplier === 'B') {
        amount *= 1000000000;
      }

      funding.totalRaised = amount;
      funding.currency = 'USD';
    }
  }

  return Object.keys(funding).length > 0 ? funding : undefined;
}

/**
 * Parse follower count from text
 */
function parseFollowerCount(followersText: string): number | undefined {
  if (!followersText) return undefined;

  // Extract number with potential multiplier
  const match = followersText.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return undefined;

  let count = parseFloat(match[1]);
  const multiplier = match[2]?.toUpperCase();

  if (multiplier === 'K') {
    count *= 1000;
  } else if (multiplier === 'M') {
    count *= 1000000;
  } else if (multiplier === 'B') {
    count *= 1000000000;
  }

  return Math.floor(count);
}
