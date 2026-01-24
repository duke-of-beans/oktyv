/**
 * MCP-specific types and interfaces
 * Based on @modelcontextprotocol/sdk
 */

import type { Job, JobSearchParams, JobSearchResult } from './job.js';
import type { Company } from './company.js';

/**
 * Error types that can be returned by Oktyv tools
 */
export enum OktyvErrorCode {
  // Authentication
  NOT_LOGGED_IN = 'NOT_LOGGED_IN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  
  // Not Found
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  COMPANY_NOT_FOUND = 'COMPANY_NOT_FOUND',
  PAGE_NOT_FOUND = 'PAGE_NOT_FOUND',
  
  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  
  // Parsing
  PARSE_ERROR = 'PARSE_ERROR',
  DOM_STRUCTURE_CHANGED = 'DOM_STRUCTURE_CHANGED',
  INVALID_DATA = 'INVALID_DATA',
  
  // Browser
  BROWSER_LAUNCH_FAILED = 'BROWSER_LAUNCH_FAILED',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  NAVIGATION_ERROR = 'NAVIGATION_ERROR',
  BROWSER_CRASHED = 'BROWSER_CRASHED',
  INTERACTION_ERROR = 'INTERACTION_ERROR',
  SCREENSHOT_ERROR = 'SCREENSHOT_ERROR',
  PDF_ERROR = 'PDF_ERROR',
  SCRIPT_ERROR = 'SCRIPT_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Platform
  PLATFORM_BLOCKED = 'PLATFORM_BLOCKED',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  TERMS_CHANGED = 'TERMS_CHANGED',
  
  // Validation
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

export interface OktyvError {
  code: OktyvErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
  retryAfter?: number;  // Seconds to wait before retry
}

/**
 * Tool input/output schemas
 */

// linkedin_search_jobs
export interface LinkedInSearchJobsInput extends JobSearchParams {
  platform: 'linkedin';
}

export interface LinkedInSearchJobsOutput {
  success: boolean;
  result?: JobSearchResult;
  error?: OktyvError;
}

// linkedin_get_job
export interface LinkedInGetJobInput {
  platform: 'linkedin';
  jobId: string;
  includeCompany?: boolean;  // Whether to fetch company details too
}

export interface LinkedInGetJobOutput {
  success: boolean;
  result?: {
    job: Job;
    company?: Company;
  };
  error?: OktyvError;
}

// linkedin_get_company
export interface LinkedInGetCompanyInput {
  platform: 'linkedin';
  companyId: string;
}

export interface LinkedInGetCompanyOutput {
  success: boolean;
  result?: Company;
  error?: OktyvError;
}

// indeed_search_jobs (future)
export interface IndeedSearchJobsInput extends JobSearchParams {
  platform: 'indeed';
}

export interface IndeedSearchJobsOutput {
  success: boolean;
  result?: JobSearchResult;
  error?: OktyvError;
}

/**
 * Browser session state
 */
export interface BrowserSession {
  id: string;
  platform: string;
  browser: any;  // Puppeteer Browser instance
  page: any;     // Puppeteer Page instance
  isLoggedIn: boolean;
  lastActivity: Date;
  cookiesPath: string;
}

/**
 * Rate limiter state
 */
export interface RateLimitConfig {
  maxRequests: number;      // Max requests per window
  windowMs: number;         // Time window in milliseconds
  platform: string;
}

export interface RateLimitState {
  tokens: number;           // Available tokens
  lastRefill: Date;
  nextRefill: Date;
}
