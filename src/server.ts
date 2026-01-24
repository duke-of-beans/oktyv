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
