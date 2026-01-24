/**
 * Oktyv MCP Server
 * 
 * Main server class that implements the Model Context Protocol.
 * Registers tools and handles browser session management.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from './utils/logger.js';
import { BrowserSessionManager } from './browser/session.js';
import { RateLimiter } from './browser/rate-limiter.js';
import { LinkedInConnector } from './connectors/linkedin.js';
import { IndeedConnector } from './connectors/indeed.js';
import { WellfoundConnector } from './connectors/wellfound.js';
import { GenericBrowserConnector } from './connectors/generic.js';
import type { JobSearchParams } from './types/job.js';
import { OktyvErrorCode } from './types/mcp.js';

const logger = createLogger('server');

export class OktyvServer {
  private server: Server;
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private linkedInConnector: LinkedInConnector;
  private indeedConnector: IndeedConnector;
  private wellfoundConnector: WellfoundConnector;
  private genericConnector: GenericBrowserConnector;

  constructor() {
    this.server = new Server(
      {
        name: 'oktyv',
        version: '0.1.0-alpha.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize browser infrastructure
    this.sessionManager = new BrowserSessionManager();
    this.rateLimiter = new RateLimiter();
    this.linkedInConnector = new LinkedInConnector(this.sessionManager, this.rateLimiter);
    this.indeedConnector = new IndeedConnector(this.sessionManager, this.rateLimiter);
    this.wellfoundConnector = new WellfoundConnector(this.sessionManager, this.rateLimiter);
    this.genericConnector = new GenericBrowserConnector(this.sessionManager, this.rateLimiter);

    // Register handlers
    this.setupHandlers();

    logger.info('Oktyv Server initialized');
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Received list_tools request');
      
      return {
        tools: [
          {
            name: 'linkedin_search_jobs',
            description: 'Search for jobs on LinkedIn with filters',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'string',
                  description: 'Job title, skills, or keywords to search for',
                },
                location: {
                  type: 'string',
                  description: 'City, state, or country',
                },
                remote: {
                  type: 'boolean',
                  description: 'Filter for remote positions only',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 10)',
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: [],
            },
          },
          {
            name: 'linkedin_get_job',
            description: 'Get detailed information about a specific job posting',
            inputSchema: {
              type: 'object',
              properties: {
                jobId: {
                  type: 'string',
                  description: 'LinkedIn job ID',
                },
                includeCompany: {
                  type: 'boolean',
                  description: 'Whether to fetch company details (default: false)',
                },
              },
              required: ['jobId'],
            },
          },
          {
            name: 'linkedin_get_company',
            description: 'Get detailed information about a company on LinkedIn',
            inputSchema: {
              type: 'object',
              properties: {
                companyId: {
                  type: 'string',
                  description: 'LinkedIn company ID or vanity name',
                },
              },
              required: ['companyId'],
            },
          },
          {
            name: 'indeed_search_jobs',
            description: 'Search for jobs on Indeed with filters',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'string',
                  description: 'Job title, skills, or keywords to search for',
                },
                location: {
                  type: 'string',
                  description: 'City, state, or country',
                },
                remote: {
                  type: 'boolean',
                  description: 'Filter for remote positions only',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 10)',
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: [],
            },
          },
          {
            name: 'indeed_get_job',
            description: 'Get detailed information about a specific job posting on Indeed',
            inputSchema: {
              type: 'object',
              properties: {
                jobKey: {
                  type: 'string',
                  description: 'Indeed job key (from search results)',
                },
                includeCompany: {
                  type: 'boolean',
                  description: 'Whether to fetch company details (default: false)',
                },
              },
              required: ['jobKey'],
            },
          },
          {
            name: 'indeed_get_company',
            description: 'Get detailed information about a company on Indeed',
            inputSchema: {
              type: 'object',
              properties: {
                companyName: {
                  type: 'string',
                  description: 'Indeed company name or ID',
                },
              },
              required: ['companyName'],
            },
          },
          {
            name: 'wellfound_search_jobs',
            description: 'Search for jobs on Wellfound (formerly AngelList Talent) - startup-focused job board',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'string',
                  description: 'Job title, skills, or keywords to search for',
                },
                location: {
                  type: 'string',
                  description: 'City, state, or country',
                },
                remote: {
                  type: 'boolean',
                  description: 'Filter for remote positions only',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 10)',
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: [],
            },
          },
          {
            name: 'wellfound_get_job',
            description: 'Get detailed information about a specific job posting on Wellfound',
            inputSchema: {
              type: 'object',
              properties: {
                jobSlug: {
                  type: 'string',
                  description: 'Wellfound job slug (from search results)',
                },
                includeCompany: {
                  type: 'boolean',
                  description: 'Whether to fetch company details (default: false)',
                },
              },
              required: ['jobSlug'],
            },
          },
          {
            name: 'wellfound_get_company',
            description: 'Get detailed information about a company on Wellfound, including funding info',
            inputSchema: {
              type: 'object',
              properties: {
                companySlug: {
                  type: 'string',
                  description: 'Wellfound company slug',
                },
              },
              required: ['companySlug'],
            },
          },
          {
            name: 'browser_navigate',
            description: 'Navigate to any URL in the browser',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'URL to navigate to',
                },
                waitForSelector: {
                  type: 'string',
                  description: 'CSS selector to wait for after navigation (optional)',
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds (default: 30000)',
                },
              },
              required: ['url'],
            },
          },
          {
            name: 'browser_click',
            description: 'Click on an element using a CSS selector',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of element to click',
                },
                waitForNavigation: {
                  type: 'boolean',
                  description: 'Wait for page navigation after click (default: false)',
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds (default: 10000)',
                },
              },
              required: ['selector'],
            },
          },
          {
            name: 'browser_type',
            description: 'Type text into an input field',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of input field',
                },
                text: {
                  type: 'string',
                  description: 'Text to type',
                },
                delay: {
                  type: 'number',
                  description: 'Delay between keystrokes in ms (default: 50)',
                },
                clear: {
                  type: 'boolean',
                  description: 'Clear existing text first (default: false)',
                },
              },
              required: ['selector', 'text'],
            },
          },
          {
            name: 'browser_extract',
            description: 'Extract data from page using CSS selectors',
            inputSchema: {
              type: 'object',
              properties: {
                selectors: {
                  type: 'object',
                  description: 'Map of keys to CSS selectors (e.g., {"title": "h1", "price": ".price"})',
                },
                multiple: {
                  type: 'boolean',
                  description: 'Extract from all matching elements (default: false)',
                },
              },
              required: ['selectors'],
            },
          },
          {
            name: 'browser_screenshot',
            description: 'Capture a screenshot of the current page',
            inputSchema: {
              type: 'object',
              properties: {
                fullPage: {
                  type: 'boolean',
                  description: 'Capture full scrollable page (default: false)',
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector of specific element to screenshot (optional)',
                },
              },
              required: [],
            },
          },
          {
            name: 'browser_pdf',
            description: 'Generate a PDF of the current page',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  description: 'Paper format: Letter, Legal, or A4 (default: Letter)',
                  enum: ['Letter', 'Legal', 'A4'],
                },
                landscape: {
                  type: 'boolean',
                  description: 'Use landscape orientation (default: false)',
                },
              },
              required: [],
            },
          },
          {
            name: 'browser_form_fill',
            description: 'Fill out a form with provided data',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'object',
                  description: 'Map of CSS selectors to values (e.g., {"#email": "user@example.com"})',
                },
                submitSelector: {
                  type: 'string',
                  description: 'CSS selector of submit button (optional)',
                },
                submitWaitForNavigation: {
                  type: 'boolean',
                  description: 'Wait for navigation after submit (default: false)',
                },
              },
              required: ['fields'],
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info('Received tool call', { tool: name, args });

      try {
        switch (name) {
          case 'linkedin_search_jobs':
            return await this.handleLinkedInSearchJobs(args);

          case 'linkedin_get_job':
            return await this.handleLinkedInGetJob(args);

          case 'linkedin_get_company':
            return await this.handleLinkedInGetCompany(args);

          case 'indeed_search_jobs':
            return await this.handleIndeedSearchJobs(args);

          case 'indeed_get_job':
            return await this.handleIndeedGetJob(args);

          case 'indeed_get_company':
            return await this.handleIndeedGetCompany(args);

          case 'wellfound_search_jobs':
            return await this.handleWellfoundSearchJobs(args);

          case 'wellfound_get_job':
            return await this.handleWellfoundGetJob(args);

          case 'wellfound_get_company':
            return await this.handleWellfoundGetCompany(args);

          case 'browser_navigate':
            return await this.handleBrowserNavigate(args);

          case 'browser_click':
            return await this.handleBrowserClick(args);

          case 'browser_type':
            return await this.handleBrowserType(args);

          case 'browser_extract':
            return await this.handleBrowserExtract(args);

          case 'browser_screenshot':
            return await this.handleBrowserScreenshot(args);

          case 'browser_pdf':
            return await this.handleBrowserPdf(args);

          case 'browser_form_fill':
            return await this.handleBrowserFormFill(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution failed', { tool: name, error });
        throw error;
      }
    });
  }

  private async handleLinkedInSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_search_jobs', { args });

      // Parse and validate parameters
      const params: JobSearchParams = {
        keywords: args.keywords,
        location: args.location,
        remote: args.remote,
        jobType: args.jobType,
        experienceLevel: args.experienceLevel,
        salaryMin: args.salaryMin,
        postedWithin: args.postedWithin,
        limit: args.limit || 10,
        offset: args.offset || 0,
      };

      // Call connector
      const jobs = await this.linkedInConnector.searchJobs(params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                jobs,
                totalCount: jobs.length, // TODO: Get actual total from LinkedIn
                hasMore: jobs.length >= (params.limit || 10),
                nextOffset: (params.offset || 0) + jobs.length,
                query: params,
                searchedAt: new Date(),
                platform: 'LINKEDIN',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('LinkedIn job search failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleLinkedInGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_get_job', { args });

      const { jobId, includeCompany = false } = args;

      if (!jobId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'jobId is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const result = await this.linkedInConnector.getJob(jobId, includeCompany);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('LinkedIn job fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleLinkedInGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_get_company', { args });

      const { companyId } = args;

      if (!companyId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'companyId is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const company = await this.linkedInConnector.getCompany(companyId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: company,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('LinkedIn company fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleIndeedSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_search_jobs', { args });

      // Parse and validate parameters
      const params: JobSearchParams = {
        keywords: args.keywords,
        location: args.location,
        remote: args.remote,
        jobType: args.jobType,
        experienceLevel: args.experienceLevel,
        salaryMin: args.salaryMin,
        postedWithin: args.postedWithin,
        limit: args.limit || 10,
        offset: args.offset || 0,
      };

      // Call connector
      const jobs = await this.indeedConnector.searchJobs(params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                jobs,
                totalCount: jobs.length,
                hasMore: jobs.length >= (params.limit || 10),
                nextOffset: (params.offset || 0) + jobs.length,
                query: params,
                searchedAt: new Date(),
                platform: 'INDEED',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Indeed job search failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleIndeedGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_get_job', { args });

      const { jobKey, includeCompany = false } = args;

      if (!jobKey) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'jobKey is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const result = await this.indeedConnector.getJob(jobKey, includeCompany);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Indeed job fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleIndeedGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_get_company', { args });

      const { companyName } = args;

      if (!companyName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'companyName is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const company = await this.indeedConnector.getCompany(companyName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: company,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Indeed company fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleWellfoundSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_search_jobs', { args });

      // Parse and validate parameters
      const params: JobSearchParams = {
        keywords: args.keywords,
        location: args.location,
        remote: args.remote,
        jobType: args.jobType,
        experienceLevel: args.experienceLevel,
        salaryMin: args.salaryMin,
        postedWithin: args.postedWithin,
        limit: args.limit || 10,
        offset: args.offset || 0,
      };

      // Call connector
      const jobs = await this.wellfoundConnector.searchJobs(params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                jobs,
                totalCount: jobs.length,
                hasMore: jobs.length >= (params.limit || 10),
                nextOffset: (params.offset || 0) + jobs.length,
                query: params,
                searchedAt: new Date(),
                platform: 'WELLFOUND',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Wellfound job search failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleWellfoundGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_get_job', { args });

      const { jobSlug, includeCompany = false } = args;

      if (!jobSlug) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'jobSlug is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const result = await this.wellfoundConnector.getJob(jobSlug, includeCompany);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Wellfound job fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleWellfoundGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_get_company', { args });

      const { companySlug } = args;

      if (!companySlug) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'companySlug is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Call connector
      const company = await this.wellfoundConnector.getCompany(companySlug);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: company,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Wellfound company fetch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserNavigate(args: any): Promise<any> {
    try {
      logger.info('Handling browser_navigate', { args });

      const { url, waitForSelector, timeout } = args;

      if (!url) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'url is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      await this.genericConnector.navigate(url, { waitForSelector, timeout });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                url,
                message: 'Navigation successful',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser navigate failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserClick(args: any): Promise<any> {
    try {
      logger.info('Handling browser_click', { args });

      const { selector, waitForNavigation, timeout } = args;

      if (!selector) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'selector is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      await this.genericConnector.click(selector, { waitForNavigation, timeout });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                selector,
                message: 'Click successful',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser click failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserType(args: any): Promise<any> {
    try {
      logger.info('Handling browser_type', { args });

      const { selector, text, delay, clear } = args;

      if (!selector || !text) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'selector and text are required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      await this.genericConnector.type(selector, text, { delay, clear });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                selector,
                textLength: text.length,
                message: 'Type successful',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser type failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserExtract(args: any): Promise<any> {
    try {
      logger.info('Handling browser_extract', { args });

      const { selectors, multiple } = args;

      if (!selectors || typeof selectors !== 'object') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'selectors object is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      const data = await this.genericConnector.extract(selectors, { multiple });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: data,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser extract failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserScreenshot(args: any): Promise<any> {
    try {
      logger.info('Handling browser_screenshot', { args });

      const { fullPage, selector } = args;

      const base64Image = await this.genericConnector.screenshot({ fullPage, selector });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                image: base64Image,
                format: 'png',
                encoding: 'base64',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser screenshot failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserPdf(args: any): Promise<any> {
    try {
      logger.info('Handling browser_pdf', { args });

      const { format, landscape } = args;

      const base64Pdf = await this.genericConnector.generatePdf({ format, landscape });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                pdf: base64Pdf,
                format: format || 'Letter',
                encoding: 'base64',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser PDF generation failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleBrowserFormFill(args: any): Promise<any> {
    try {
      logger.info('Handling browser_form_fill', { args });

      const { fields, submitSelector, submitWaitForNavigation } = args;

      if (!fields || typeof fields !== 'object') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'fields object is required',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      await this.genericConnector.fillForm(fields, { submitSelector, submitWaitForNavigation });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              result: {
                fieldsCount: Object.keys(fields).length,
                submitted: !!submitSelector,
                message: 'Form fill successful',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Browser form fill failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'An unknown error occurred',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  async connect(transport: StdioServerTransport): Promise<void> {
    await this.server.connect(transport);
    logger.info('Server connected to transport');
  }

  async close(): Promise<void> {
    logger.info('Closing server and cleaning up sessions...');
    
    // Close all browser sessions via session manager
    await this.sessionManager.closeAllSessions();
    
    await this.server.close();
    logger.info('Server closed');
  }
}
