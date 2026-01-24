/**
 * Wellfound Job Detail Tool
 * 
 * Extracts full job details from Wellfound job posting pages.
 * Wellfound (formerly AngelList Talent) focuses on startups.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, JobLocation, Platform, ExperienceLevel, type Job } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('wellfound-job');

/**
 * Wellfound DOM selectors for job detail pages
 */
const SELECTORS = {
  TITLE: '[data-test="JobTitle"]',
  COMPANY: '[data-test="CompanyName"]',
  LOCATION: '[data-test="JobLocation"]',
  DESCRIPTION: '[data-test="JobDescription"]',
  SALARY: '[data-test="SalaryRange"]',
  JOB_TYPE: '[data-test="JobType"]',
  EXPERIENCE: '[data-test="ExperienceLevel"]',
  SKILLS: '[data-test="Skills"] span',
  REQUIREMENTS: '[data-test="Requirements"]',
  BENEFITS: '[data-test="Benefits"] li',
  POSTED_DATE: '[data-test="PostedDate"]',
  APPLICANT_COUNT: '[data-test="ApplicantCount"]',
  COMPANY_LINK: '[data-test="CompanyName"] a',
};

/**
 * Extract full job details from Wellfound job posting page
 */
export async function extractJobDetail(
  page: Page,
  jobSlug: string
): Promise<Job> {
  logger.info('Extracting job detail', { jobSlug, url: page.url() });

  try {
    // Wait for key elements
    await page.waitForSelector(SELECTORS.TITLE, { timeout: 10000 });

    // Extract all job data
    const jobData = await page.evaluate((selectors) => {
      // Helper to safely get text content
      const getText = (selector: string): string => {
        // @ts-expect-error - Running in browser context
        const element = document.querySelector(selector);
        return element?.textContent?.trim() || '';
      };

      // Helper to safely get HTML content
      const getHTML = (selector: string): string => {
        // @ts-expect-error - Running in browser context
        const element = document.querySelector(selector);
        return element?.innerHTML?.trim() || '';
      };

      // Helper to get all text from multiple elements
      const getAll = (selector: string): string[] => {
        // @ts-expect-error - Running in browser context
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el: any) => el.textContent?.trim() || '').filter(Boolean);
      };

      // Extract basic info
      const title = getText(selectors.TITLE);
      const company = getText(selectors.COMPANY);
      const location = getText(selectors.LOCATION);
      const descriptionHTML = getHTML(selectors.DESCRIPTION);
      const descriptionText = getText(selectors.DESCRIPTION);
      const salaryText = getText(selectors.SALARY);
      const jobTypeText = getText(selectors.JOB_TYPE);
      const experienceText = getText(selectors.EXPERIENCE);
      const postedDateText = getText(selectors.POSTED_DATE);
      const applicantCountText = getText(selectors.APPLICANT_COUNT);

      // Extract skills
      const skills = getAll(selectors.SKILLS);

      // Extract requirements (often in description)
      const requirementsText = getText(selectors.REQUIREMENTS);

      // Extract benefits
      const benefits = getAll(selectors.BENEFITS);

      // Try to find company slug from link
      let companySlug = '';
      // @ts-expect-error - Running in browser context
      const companyLink = document.querySelector(selectors.COMPANY_LINK) as HTMLAnchorElement;
      if (companyLink) {
        const match = companyLink.href.match(/\/company\/([^/?]+)/);
        if (match) {
          companySlug = match[1];
        }
      }

      return {
        title,
        company,
        companySlug,
        location,
        descriptionHTML,
        descriptionText,
        salaryText,
        jobTypeText,
        experienceText,
        postedDateText,
        applicantCountText,
        skills,
        requirementsText,
        benefits,
      };
    }, SELECTORS);

    // Parse location
    const locationParts = parseLocation(jobData.location);
    const locationType = parseLocationType(jobData.location);

    // Parse salary
    const salary = parseSalary(jobData.salaryText);

    // Parse job type
    const jobType = parseJobType(jobData.jobTypeText);

    // Parse experience level
    const experienceLevel = parseExperienceLevel(jobData.experienceText);

    // Parse posted date
    const postedDate = parsePostedDate(jobData.postedDateText);

    // Parse applicant count
    const applicantCount = parseApplicantCount(jobData.applicantCountText);

    // Extract requirements from text
    const requirements = extractRequirements(jobData.requirementsText || jobData.descriptionText);

    // Build Job object
    const job: Job = {
      id: jobSlug,
      title: jobData.title,
      company: jobData.company,
      companyId: jobData.companySlug || undefined,
      location: {
        ...locationParts,
        locationType,
      },
      type: jobType,
      description: jobData.descriptionHTML,
      summary: jobData.descriptionText.substring(0, 500),
      postedDate,
      url: page.url(),
      source: Platform.WELLFOUND,
      extractedDate: new Date(),
    };

    // Add optional fields
    if (salary) {
      job.salary = salary;
    }

    if (experienceLevel) {
      job.experienceLevel = experienceLevel;
    }

    if (applicantCount) {
      job.applicantCount = applicantCount;
    }

    if (jobData.skills.length > 0) {
      job.skills = jobData.skills.slice(0, 20);
    }

    if (requirements.length > 0) {
      job.requirements = requirements;
    }

    if (jobData.benefits.length > 0) {
      job.benefits = jobData.benefits;
    }

    logger.info('Successfully extracted job detail', { 
      jobSlug, 
      title: job.title,
      company: job.company 
    });
    
    return job;

  } catch (error) {
    logger.error('Failed to extract job detail', { jobSlug, error });
    
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract job details from Wellfound',
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

  const cleaned = locationStr
    .replace(/Remote/gi, '')
    .replace(/Hybrid/gi, '')
    .trim();

  const parts = cleaned.split(',').map(p => p.trim());

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
 * Parse location type from location string
 */
function parseLocationType(locationStr: string): JobLocation {
  const lower = locationStr.toLowerCase();
  
  if (lower.includes('remote')) {
    return JobLocation.REMOTE;
  }
  if (lower.includes('hybrid')) {
    return JobLocation.HYBRID;
  }
  
  return JobLocation.ONSITE;
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

  const numbers = salaryText.match(/\$?([\d,]+)k?/gi);
  if (!numbers || numbers.length === 0) return undefined;

  const cleanNumbers = numbers.map(n => {
    const num = parseFloat(n.replace(/[$,k]/gi, ''));
    return n.toLowerCase().includes('k') ? num * 1000 : num;
  });

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

  return JobType.FULL_TIME;
}

/**
 * Parse experience level from text
 */
function parseExperienceLevel(experienceText: string): ExperienceLevel | undefined {
  if (!experienceText) return undefined;

  const lower = experienceText.toLowerCase();

  if (lower.includes('entry') || lower.includes('junior') || lower.includes('0-2 years')) {
    return ExperienceLevel.ENTRY_LEVEL;
  }
  if (lower.includes('mid') || lower.includes('2-5 years') || lower.includes('3-5 years')) {
    return ExperienceLevel.MID_LEVEL;
  }
  if (lower.includes('senior') || lower.includes('5+ years') || lower.includes('7+ years')) {
    return ExperienceLevel.SENIOR_LEVEL;
  }
  if (lower.includes('lead') || lower.includes('director') || lower.includes('principal')) {
    return ExperienceLevel.DIRECTOR;
  }
  if (lower.includes('exec') || lower.includes('vp') || lower.includes('c-level')) {
    return ExperienceLevel.EXECUTIVE;
  }
  if (lower.includes('intern')) {
    return ExperienceLevel.INTERNSHIP;
  }

  return undefined;
}

/**
 * Parse posted date from text
 */
function parsePostedDate(postedDateText: string): Date {
  if (!postedDateText) return new Date();

  // Wellfound shows relative dates: "Posted 2 days ago", "Posted today"
  const daysAgoMatch = postedDateText.match(/(\d+)\s*day/i);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  }

  const hoursAgoMatch = postedDateText.match(/(\d+)\s*hour/i);
  if (hoursAgoMatch) {
    const hoursAgo = parseInt(hoursAgoMatch[1], 10);
    const date = new Date();
    date.setHours(date.getHours() - hoursAgo);
    return date;
  }

  if (postedDateText.toLowerCase().includes('today')) {
    return new Date();
  }

  return new Date();
}

/**
 * Parse applicant count from text
 */
function parseApplicantCount(applicantCountText: string): number | undefined {
  if (!applicantCountText) return undefined;

  const match = applicantCountText.match(/(\d+)\+?/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * Extract requirements from description text
 */
function extractRequirements(description: string): string[] {
  const requirements: string[] = [];

  if (!description) return requirements;

  // Common requirement patterns
  const requirementPatterns = [
    /(?:requirements?|qualifications?|must have|required):?\s*([^\.]+)/gi,
    /(?:bachelor's|master's|phd)\s+(?:degree)?\s+in\s+([^\.]+)/gi,
    /(?:\d+\+?\s+years)\s+(?:of\s+)?(?:experience|exp)/gi,
  ];

  for (const pattern of requirementPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const requirement = match[0].trim();
      if (requirement.length > 5 && requirement.length < 200 && !requirements.includes(requirement)) {
        requirements.push(requirement);
      }
    }
  }

  return requirements.slice(0, 10);
}
