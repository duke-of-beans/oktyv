/**
 * Upwork Job Detail Tool
 *
 * Extracts complete job information from an individual Upwork job posting page.
 * Strategy: document.body.innerText + regex. Upwork's data-test attributes are
 * unreliable on this page; the label text ("Bid range", "Payment method verified",
 * "Member since") is stable across their UI revisions.
 *
 * Bid range only renders for Freelancer Plus users — captured when present.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { JobType, JobLocation, Platform, type Job } from '../types/job.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('upwork-job');

export async function extractJobDetail(page: Page, jobId: string): Promise<Job> {
  logger.info('Extracting Upwork job detail', { jobId, url: page.url() });

  try {
    // Wait for any h4 to appear — Upwork renders the title as a naked h4.
    await page.waitForSelector('h4', { timeout: 15000 });

    const raw = await page.evaluate(() => {
      /* @ts-ignore - Browser context */
      const body = document.body.innerText;

      let title = '';
      /* @ts-ignore - Browser context */
      const h4s = document.querySelectorAll('h4');
      for (const h of Array.from(h4s) as any[]) {
        const t = (h.textContent || '').trim();
        if (t.length > 10 && t.length < 300) {
          title = t;
          break;
        }
      }

      /* @ts-ignore - Browser context */
      const descEl = document.querySelector('[data-test="Description"]');
      const description = ((descEl as any)?.textContent || '').trim();

      const skills: string[] = [];
      /* @ts-ignore - Browser context */
      const skillSection = document.querySelector('[data-test="Skills"]');
      if (skillSection) {
        const anchors = (skillSection as any).querySelectorAll('a, [class*="skill"]');
        for (const a of Array.from(anchors) as any[]) {
          const s = (a.textContent || '').trim();
          if (s && s.length < 80 && !skills.includes(s)) skills.push(s);
        }
      }

      return {
        title,
        description,
        skills,
        body,
        /* @ts-ignore - Browser context */
        pageUrl: window.location.href,
      };
    });

    const job = buildJobFromText(raw, jobId);
    logger.info('Upwork job detail extracted', { jobId, title: job.title, hasBidRange: !!job.upworkMeta?.bidRangeAvg });
    return job;
  } catch (error) {
    logger.error('Failed to extract Upwork job detail', { jobId, error });
    const oktyvError: OktyvError = {
      code: OktyvErrorCode.PARSE_ERROR,
      message: 'Failed to extract Upwork job detail',
      details: error,
      retryable: true,
    };
    throw oktyvError;
  }
}

function buildJobFromText(
  r: { title: string; description: string; skills: string[]; body: string; pageUrl: string },
  jobId: string
): Job {
  const body = r.body;
  const m = (re: RegExp) => body.match(re);

  const projectTypeMatch = m(/\b(Hourly|Fixed-price)\b/);

  const rateMatch = m(/\$([\d.,]+)\s*[-–]\s*\$([\d.,]+)\s*\/?\s*hr/i) || m(/\$([\d.,]+)\s*\/\s*hr/i);
  let salary;
  if (rateMatch) {
    const min = parseFloat(rateMatch[1].replace(/,/g, ''));
    const max = rateMatch[2] ? parseFloat(rateMatch[2].replace(/,/g, '')) : min;
    salary = { min, max, currency: 'USD', period: 'HOURLY' as const };
  }

  let clientCountry: string | undefined;
  const aboutIdx = body.indexOf('About the client');
  if (aboutIdx !== -1) {
    const tail = body.slice(aboutIdx, aboutIdx + 600);
    const countryMatch = tail.match(/\n\s*(USA|United States|Canada|United Kingdom|UK|Australia|Germany|France|Netherlands|India|Philippines|Brazil|Mexico|Spain|Italy|Poland|Ukraine|Japan|Singapore|UAE|South Africa|New Zealand|Ireland|Sweden|Norway|Denmark|Finland|[A-Z][a-z]+)\b/);
    if (countryMatch) clientCountry = countryMatch[1];
  }

  const job: Job = {
    id: jobId,
    url: r.pageUrl,
    source: Platform.UPWORK,
    title: r.title,
    company: clientCountry || 'Upwork Client',
    description: r.description,
    type: JobType.CONTRACT,
    location: { country: clientCountry, locationType: JobLocation.REMOTE },
    postedDate: parsePostedTime(body),
    extractedDate: new Date(),
    skills: r.skills.slice(0, 30),
  };
  if (salary) job.salary = salary;

  const meta: NonNullable<Job['upworkMeta']> = {};

  const bid = m(/Bid range\s*[-–]\s*High\s*\$?([\d.,]+)\s*\|\s*Avg\s*\$?([\d.,]+)\s*\|\s*Low\s*\$?([\d.,]+)/i);
  if (bid) {
    meta.bidRangeHigh = parseFloat(bid[1].replace(/,/g, ''));
    meta.bidRangeAvg = parseFloat(bid[2].replace(/,/g, ''));
    meta.bidRangeLow = parseFloat(bid[3].replace(/,/g, ''));
  }

  const conn = m(/Send a proposal for:\s*(\d+)\s*Connects/i);
  if (conn) meta.connectsRequired = parseInt(conn[1], 10);

  const prop = m(/Proposals:\s*(?:.*?)(\d+\s*to\s*\d+|Less than\s*\d+|\d+\+|\d+)/i);
  if (prop) meta.proposalsRange = prop[1].trim();

  const interv = m(/Interviewing:\s*(\d+)/i);
  if (interv) meta.clientInterviewing = parseInt(interv[1], 10);

  const invSent = m(/Invites sent:\s*(\d+)/i);
  if (invSent) meta.clientInvitesSent = parseInt(invSent[1], 10);

  const lastViewed = m(/Last viewed by client[^\d]*?(\d+\s*\w+\s*ago|today|yesterday|just now)/i);
  if (lastViewed) meta.clientLastViewed = lastViewed[1].trim();

  const hrsWk = m(/(Less than \d+|More than \d+|\d+\s*to\s*\d+)\s*hrs\/week/i);
  if (hrsWk) meta.hoursPerWeek = hrsWk[0].trim();

  const duration = m(/(\d+\s*to\s*\d+\s*months?|Less than \d+\s*months?|More than \d+\s*months?|\d+\s*to\s*\d+\s*weeks?|Less than \d+\s*weeks?)/i);
  if (duration) meta.duration = duration[1].trim();

  const expLvl = m(/\b(Entry level|Intermediate|Expert)\b/);
  if (expLvl) meta.upworkExperienceLevel = expLvl[1];

  if (projectTypeMatch) meta.projectType = projectTypeMatch[1];

  if (/Payment method verified/i.test(body)) meta.paymentVerified = true;
  if (/Phone number verified/i.test(body)) meta.phoneVerified = true;

  const rating = m(/Rating is\s*([\d.]+)\s*out of\s*5/i);
  if (rating) meta.clientRating = parseFloat(rating[1]);

  const reviews = m(/([\d.]+)\s*of\s*(\d+)\s*reviews/i);
  if (reviews) meta.clientReviewCount = parseInt(reviews[2], 10);

  const jobsPosted = m(/(\d+)\s*jobs?\s*posted/i);
  if (jobsPosted) meta.clientJobsPosted = parseInt(jobsPosted[1], 10);

  const hireRate = m(/(\d+)\s*%\s*hire rate/i);
  if (hireRate) meta.clientHireRate = `${hireRate[1]}%`;

  const hireTotals = m(/(\d+)\s*hires?,\s*(\d+)\s*active/i);
  if (hireTotals) {
    meta.clientTotalHires = parseInt(hireTotals[1], 10);
    meta.clientActiveHires = parseInt(hireTotals[2], 10);
  }

  const memberSince = m(/Member since\s+([A-Z][a-z]+\s+\d+,\s*\d{4})/i);
  if (memberSince) meta.clientMemberSince = memberSince[1];

  if (clientCountry) meta.clientCountry = clientCountry;

  if (Object.keys(meta).length > 0) job.upworkMeta = meta;
  return job;
}

function parsePostedTime(body: string): Date {
  const now = new Date();
  const m = body.match(/Posted\s+(yesterday|today|just now|(\d+)\s+(minute|hour|day|week|month)s?\s+ago)/i);
  if (!m) return now;
  const phrase = m[1].toLowerCase();
  if (phrase === 'today' || phrase === 'just now') return now;
  if (phrase === 'yesterday') return new Date(now.getTime() - 86400000);
  const num = parseInt(m[2], 10);
  const unit = m[3].toLowerCase();
  const mult: Record<string, number> = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 };
  return new Date(now.getTime() - num * (mult[unit] || 0));
}
