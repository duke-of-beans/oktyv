/**
 * LinkedIn Job Detail Tool
 * 
 * Extracts complete job information from individual job posting pages.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, JobLocation, ExperienceLevel, Platform, type Job } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('linkedin-job');

/**
 * LinkedIn DOM selectors for job detail page
 */
const SELECTORS = {
  JOB_TITLE: '.job-details-jobs-unified-top-card__job-title',
  COMPANY_NAME: '.job-details-jobs-unified-top-card__company-name a',
  COMPANY_LINK: '.job-details-jobs-unified-top-card__company-name a',
  LOCATION: '.job-details-jobs-unified-top-card__bullet',
  JOB_DESCRIPTION: '.jobs-description__content',
  JOB_CRITERIA: '.job-details-jobs-unified-top-card__job-insight',
  POSTED_TIME: '.job-details-jobs-unified-top-card__posted-date',
  APPLICANT_COUNT: '.job-details-jobs-unified-top-card__applicant-count',
  SALARY: '.job-details-jobs-unified-top-card__job-insight--highlight',
};

/**
 * Extract complete job details from LinkedIn job page
 */
export async function extractJobDetail(page: Page, jobId: string): Promise<Job> {
  logger.info('Extracting job detail', { jobId, url: page.url() });

  try {
    // Wait for job details to load
    await page.waitForSelector(SELECTORS.JOB_TITLE, { timeout: 10000 });

    // Extract all job information
    const jobData = await page.evaluate((selectors) => {
      const getText = (selector: string): string => {
        /* @ts-ignore - Browser context */
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || '';
      };

      const getAllText = (selector: string): string[] => {
        /* @ts-ignore - Browser context */
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el: any) => el.textContent?.trim() || '');
      };

      // Basic info
      const title = getText(selectors.JOB_TITLE);
      const companyName = getText(selectors.COMPANY_NAME);
      
      // Company link
      /* @ts-ignore - Browser context */
      const companyLinkEl = document.querySelector(selectors.COMPANY_LINK) as any;
      const companyUrl = companyLinkEl?.getAttribute('href') || '';
      const companyIdMatch = companyUrl.match(/\/company\/([^\/]+)/);
      const companyId = companyIdMatch ? companyIdMatch[1] : '';

      // Location info
      const locationTexts = getAllText(selectors.LOCATION);
      const locationText = locationTexts.find(t => 
        t && !t.includes('applicant') && !t.includes('ago')
      ) || '';

      // Job description (full HTML)
      /* @ts-ignore - Browser context */
      const descEl = document.querySelector(selectors.JOB_DESCRIPTION) as any;
      const description = descEl?.innerHTML || '';

      // Job criteria (seniority, employment type, etc.)
      const criteriaTexts = getAllText(selectors.JOB_CRITERIA);

      // Posted date
      const postedText = getText(selectors.POSTED_TIME);

      // Applicant count
      const applicantText = getText(selectors.APPLICANT_COUNT);

      // Salary if available
      const salaryText = getText(selectors.SALARY);

      return {
        title,
        companyName,
        companyId,
        locationText,
        description,
        criteriaTexts,
        postedText,
        applicantText,
        salaryText,
      };
    }, SELECTORS);

    // Parse location
    const location = parseJobLocation(jobData.locationText);

    // Parse job type and experience level from criteria
    const { jobType, experienceLevel } = parseJobCriteria(jobData.criteriaTexts);

    // Parse posted date
    const postedDate = parsePostedDate(jobData.postedText);

    // Parse applicant count
    const applicantCount = parseApplicantCount(jobData.applicantText);

    // Build Job object
    const job: Job = {
      id: jobId,
      title: jobData.title,
      company: jobData.companyName,
      companyId: jobData.companyId || undefined,
      description: jobData.description,
      type: jobType,
      location,
      url: page.url(),
      source: Platform.LINKEDIN,
      postedDate,
      extractedDate: new Date(),
    };

    // Add experience level if detected
    if (experienceLevel) {
      job.experienceLevel = experienceLevel;
    }

    // Add applicant count if available
    if (applicantCount) {
      job.applicantCount = applicantCount;
    }

    // Parse and add salary if available
    if (jobData.salaryText) {
      const salary = parseSalaryFromDetail(jobData.salaryText);
      if (salary) {
        job.salary = salary;
      }
    }

    // Extract skills and requirements from description
    const { skills, requirements } = extractSkillsAndRequirements(jobData.description);
    if (skills.length > 0) {
      job.skills = skills;
    }
    if (requirements.length > 0) {
      job.requirements = requirements;
    }

    logger.info('Successfully extracted job detail', { jobId, title: job.title });
    return job;

  } catch (error) {
    logger.error('Failed to extract job detail', { jobId, error });
    
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract job details from LinkedIn',
      details: error,
      retryable: true,
    };
    
    throw oktyvError;
  }
}

/**
 * Parse location text into structured format
 */
function parseJobLocation(locationText: string): {
  city?: string;
  state?: string;
  country?: string;
  locationType: JobLocation;
} {
  let locationType = JobLocation.ONSITE;

  // Check for remote/hybrid
  if (locationText.toLowerCase().includes('remote')) {
    locationType = JobLocation.REMOTE;
  } else if (locationText.toLowerCase().includes('hybrid')) {
    locationType = JobLocation.HYBRID;
  }

  // Clean up location text
  const cleaned = locationText
    .replace(/\(Remote\)/i, '')
    .replace(/\(Hybrid\)/i, '')
    .replace(/Remote/i, '')
    .replace(/Hybrid/i, '')
    .trim();

  // Parse city, state, country
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { locationType };
  }
  if (parts.length === 1) {
    return { city: parts[0], locationType };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1], locationType };
  }
  
  return {
    city: parts[0],
    state: parts[1],
    country: parts[2],
    locationType,
  };
}

/**
 * Parse job criteria to extract job type and experience level
 */
function parseJobCriteria(criteriaTexts: string[]): {
  jobType: JobType;
  experienceLevel?: ExperienceLevel;
} {
  let jobType = JobType.FULL_TIME;
  let experienceLevel: ExperienceLevel | undefined;

  for (const text of criteriaTexts) {
    const lower = text.toLowerCase();

    // Job type
    if (lower.includes('full-time') || lower.includes('full time')) {
      jobType = JobType.FULL_TIME;
    } else if (lower.includes('part-time') || lower.includes('part time')) {
      jobType = JobType.PART_TIME;
    } else if (lower.includes('contract')) {
      jobType = JobType.CONTRACT;
    } else if (lower.includes('temporary')) {
      jobType = JobType.TEMPORARY;
    } else if (lower.includes('internship')) {
      jobType = JobType.INTERNSHIP;
    }

    // Experience level
    if (lower.includes('entry level') || lower.includes('entry-level')) {
      experienceLevel = ExperienceLevel.ENTRY_LEVEL;
    } else if (lower.includes('mid-senior') || lower.includes('mid level')) {
      experienceLevel = ExperienceLevel.MID_LEVEL;
    } else if (lower.includes('senior')) {
      experienceLevel = ExperienceLevel.SENIOR_LEVEL;
    } else if (lower.includes('director')) {
      experienceLevel = ExperienceLevel.DIRECTOR;
    } else if (lower.includes('executive')) {
      experienceLevel = ExperienceLevel.EXECUTIVE;
    }
  }

  return { jobType, experienceLevel };
}

/**
 * Parse posted date text (e.g., "2 days ago", "1 week ago")
 */
function parsePostedDate(postedText: string): Date {
  const now = new Date();
  const lower = postedText.toLowerCase();

  // Extract number
  const numberMatch = lower.match(/(\d+)/);
  const num = numberMatch ? parseInt(numberMatch[1], 10) : 0;

  if (lower.includes('hour')) {
    return new Date(now.getTime() - num * 60 * 60 * 1000);
  } else if (lower.includes('day')) {
    return new Date(now.getTime() - num * 24 * 60 * 60 * 1000);
  } else if (lower.includes('week')) {
    return new Date(now.getTime() - num * 7 * 24 * 60 * 60 * 1000);
  } else if (lower.includes('month')) {
    return new Date(now.getTime() - num * 30 * 24 * 60 * 60 * 1000);
  }

  return now;
}

/**
 * Parse applicant count text (e.g., "Over 100 applicants")
 */
function parseApplicantCount(applicantText: string): number | undefined {
  if (!applicantText) return undefined;

  const numberMatch = applicantText.match(/(\d+)/);
  if (numberMatch) {
    return parseInt(numberMatch[1], 10);
  }

  return undefined;
}

/**
 * Parse salary from job detail page
 */
function parseSalaryFromDetail(salaryText: string): {
  min?: number;
  max?: number;
  currency: string;
  period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
} | undefined {
  if (!salaryText) return undefined;

  // LinkedIn format: "$100,000/yr - $150,000/yr"
  const rangeMatch = salaryText.match(/\$?([\d,]+)\s*(?:\/\w+)?\s*-\s*\$?([\d,]+)/);
  if (!rangeMatch) return undefined;

  const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
  const max = parseFloat(rangeMatch[2].replace(/,/g, ''));

  // Determine period
  let period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'YEARLY';
  if (salaryText.includes('/hr') || salaryText.includes('hour')) {
    period = 'HOURLY';
  } else if (salaryText.includes('/mo') || salaryText.includes('month')) {
    period = 'MONTHLY';
  } else if (salaryText.includes('/day')) {
    period = 'DAILY';
  } else if (salaryText.includes('/week')) {
    period = 'WEEKLY';
  }

  return {
    min,
    max,
    currency: 'USD',
    period,
  };
}

/**
 * Extract skills and requirements from job description HTML
 */
function extractSkillsAndRequirements(descriptionHtml: string): {
  skills: string[];
  requirements: string[];
} {
  // Strip HTML tags for text analysis
  const text = descriptionHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  const skills: string[] = [];
  const requirements: string[] = [];

  // Common skill patterns
  const skillPatterns = [
    /(?:experience (?:with|in)|proficiency (?:with|in)|knowledge of|familiar with)\s+([^.,;]+)/gi,
    /(?:skills?|technologies?):\s*([^.]+)/gi,
  ];

  for (const pattern of skillPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const skillText = match[1].trim();
      // Split on common delimiters
      const items = skillText.split(/,|;|\band\b|\bor\b/).map(s => s.trim()).filter(Boolean);
      skills.push(...items);
    }
  }

  // Common requirement patterns
  const reqPatterns = [
    /(?:must have|required|requires?|qualification):\s*([^.]+)/gi,
    /(?:bachelor'?s?|master'?s?|phd|degree) (?:in|of) ([^.,;]+)/gi,
    /(\d+)\+?\s*years? (?:of )?(?:experience|exp)/gi,
  ];

  for (const pattern of reqPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      requirements.push(match[0].trim());
    }
  }

  // Deduplicate and limit
  const uniqueSkills = [...new Set(skills)].slice(0, 20);
  const uniqueRequirements = [...new Set(requirements)].slice(0, 10);

  return {
    skills: uniqueSkills,
    requirements: uniqueRequirements,
  };
}
