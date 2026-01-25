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
import { VaultEngine } from './tools/vault/VaultEngine.js';
import { FileEngine } from './tools/file/FileEngine.js';
import { fileTools } from './tools/file/tools.js';
import { CronEngine } from './tools/cron/CronEngine.js';
import { cronTools } from './tools/cron/tools.js';

const logger = createLogger('server');

export class OktyvServer {
  private server: Server;
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private linkedInConnector: LinkedInConnector;
  private indeedConnector: IndeedConnector;
  private wellfoundConnector: WellfoundConnector;
  private genericConnector: GenericBrowserConnector;
  private vaultEngine: VaultEngine;
  private fileEngine: FileEngine;
  private cronEngine: CronEngine;

  constructor() {
    this.server = new Server(
      {
        name: 'oktyv',
        version: '1.0.0-alpha.2',
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

    // Initialize vault infrastructure
    this.vaultEngine = new VaultEngine();

    // Initialize file infrastructure
    this.fileEngine = new FileEngine();

    // Initialize cron infrastructure
    this.cronEngine = new CronEngine();

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
          // Vault Engine Tools
          {
            name: 'vault_set',
            description: 'Store an encrypted credential in a vault. Creates vault if it doesn\'t exist. Master key stored in OS keychain (Keychain/Credential Manager).',
            inputSchema: {
              type: 'object',
              properties: {
                vaultName: {
                  type: 'string',
                  description: 'Vault name (lowercase, alphanumeric, hyphens)',
                  pattern: '^[a-z0-9-]+$',
                  minLength: 1,
                  maxLength: 50,
                },
                credentialName: {
                  type: 'string',
                  description: 'Credential name (lowercase, alphanumeric, hyphens, underscores)',
                  pattern: '^[a-z0-9-_]+$',
                  minLength: 1,
                  maxLength: 100,
                },
                value: {
                  type: 'string',
                  description: 'Secret value to store (will be encrypted with AES-256-GCM)',
                  minLength: 1,
                  maxLength: 10000,
                },
              },
              required: ['vaultName', 'credentialName', 'value'],
            },
          },
          {
            name: 'vault_get',
            description: 'Retrieve and decrypt a credential from a vault. Returns the plaintext secret value.',
            inputSchema: {
              type: 'object',
              properties: {
                vaultName: {
                  type: 'string',
                  description: 'Vault name',
                },
                credentialName: {
                  type: 'string',
                  description: 'Credential name',
                },
              },
              required: ['vaultName', 'credentialName'],
            },
          },
          {
            name: 'vault_list',
            description: 'List all credential names in a vault (values not included for security). Returns array of credential names.',
            inputSchema: {
              type: 'object',
              properties: {
                vaultName: {
                  type: 'string',
                  description: 'Vault name',
                },
              },
              required: ['vaultName'],
            },
          },
          {
            name: 'vault_delete',
            description: 'Delete a credential from a vault. This is permanent and cannot be undone.',
            inputSchema: {
              type: 'object',
              properties: {
                vaultName: {
                  type: 'string',
                  description: 'Vault name',
                },
                credentialName: {
                  type: 'string',
                  description: 'Credential name to delete',
                },
              },
              required: ['vaultName', 'credentialName'],
            },
          },
          {
            name: 'vault_delete_vault',
            description: 'Delete an entire vault including all credentials and master key. This is permanent and cannot be undone. Use with caution.',
            inputSchema: {
              type: 'object',
              properties: {
                vaultName: {
                  type: 'string',
                  description: 'Vault name to delete',
                },
              },
              required: ['vaultName'],
            },
          },
          {
            name: 'vault_list_vaults',
            description: 'List all vaults. Returns array of vault names.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // File Engine Tools
          ...fileTools,

          // Cron Engine Tools
          ...cronTools,
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

          // Vault Engine Tools
          case 'vault_set':
            return await this.handleVaultSet(args);

          case 'vault_get':
            return await this.handleVaultGet(args);

          case 'vault_list':
            return await this.handleVaultList(args);

          case 'vault_delete':
            return await this.handleVaultDelete(args);

          case 'vault_delete_vault':
            return await this.handleVaultDeleteVault(args);

          case 'vault_list_vaults':
            return await this.handleVaultListVaults(args);

          // File Engine Tools
          case 'file_read':
            return await this.handleFileRead(args);

          case 'file_write':
            return await this.handleFileWrite(args);

          case 'file_copy':
            return await this.handleFileCopy(args);

          case 'file_move':
            return await this.handleFileMove(args);

          case 'file_delete':
            return await this.handleFileDelete(args);

          case 'file_list':
            return await this.handleFileList(args);

          case 'file_stat':
            return await this.handleFileStat(args);

          case 'file_watch':
            return await this.handleFileWatch(args);

          case 'file_unwatch':
            return await this.handleFileUnwatch(args);

          case 'file_archive_create':
            return await this.handleFileArchiveCreate(args);

          case 'file_archive_extract':
            return await this.handleFileArchiveExtract(args);

          case 'file_archive_list':
            return await this.handleFileArchiveList(args);

          case 'file_hash':
            return await this.handleFileHash(args);

          case 'file_s3_upload':
            return await this.handleFileS3Upload(args);

          case 'file_s3_download':
            return await this.handleFileS3Download(args);

          case 'file_s3_list':
            return await this.handleFileS3List(args);

          case 'file_batch_operation':
            return await this.handleFileBatchOperation(args);

          // Cron Engine Tools
          case 'cron_create_task':
            return await this.handleCronCreateTask(args);

          case 'cron_update_task':
            return await this.handleCronUpdateTask(args);

          case 'cron_delete_task':
            return await this.handleCronDeleteTask(args);

          case 'cron_list_tasks':
            return await this.handleCronListTasks(args);

          case 'cron_get_task':
            return await this.handleCronGetTask(args);

          case 'cron_enable_task':
            return await this.handleCronEnableTask(args);

          case 'cron_disable_task':
            return await this.handleCronDisableTask(args);

          case 'cron_execute_now':
            return await this.handleCronExecuteNow(args);

          case 'cron_get_history':
            return await this.handleCronGetHistory(args);

          case 'cron_get_statistics':
            return await this.handleCronGetStatistics(args);

          case 'cron_clear_history':
            return await this.handleCronClearHistory(args);

          case 'cron_validate_expression':
            return await this.handleCronValidateExpression(args);

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

  // Vault Engine Handlers

  private async handleVaultSet(args: any): Promise<any> {
    try {
      logger.info('Handling vault_set', { vaultName: args.vaultName, credentialName: args.credentialName });

      await this.vaultEngine.set(args.vaultName, args.credentialName, args.value);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Credential "${args.credentialName}" stored in vault "${args.vaultName}"`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault set failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to store credential',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleVaultGet(args: any): Promise<any> {
    try {
      logger.info('Handling vault_get', { vaultName: args.vaultName, credentialName: args.credentialName });

      const value = await this.vaultEngine.get(args.vaultName, args.credentialName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              credentialName: args.credentialName,
              value,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault get failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to retrieve credential',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleVaultList(args: any): Promise<any> {
    try {
      logger.info('Handling vault_list', { vaultName: args.vaultName });

      const credentials = await this.vaultEngine.list(args.vaultName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              vaultName: args.vaultName,
              credentials,
              count: credentials.length,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault list failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to list credentials',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleVaultDelete(args: any): Promise<any> {
    try {
      logger.info('Handling vault_delete', { vaultName: args.vaultName, credentialName: args.credentialName });

      await this.vaultEngine.delete(args.vaultName, args.credentialName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Credential "${args.credentialName}" deleted from vault "${args.vaultName}"`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault delete failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to delete credential',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleVaultDeleteVault(args: any): Promise<any> {
    try {
      logger.info('Handling vault_delete_vault', { vaultName: args.vaultName });

      await this.vaultEngine.deleteVault(args.vaultName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Vault "${args.vaultName}" and all its credentials permanently deleted`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault delete vault failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to delete vault',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleVaultListVaults(_args: any): Promise<any> {
    try {
      logger.info('Handling vault_list_vaults');

      const vaults = await this.vaultEngine.listVaults();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              vaults,
              count: vaults.length,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Vault list vaults failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'VAULT_ERROR',
                message: error.message || 'Failed to list vaults',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  // ============================================================================
  // Cron Engine Handlers
  // ============================================================================

  private async handleCronCreateTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_create_task', { name: args.name });

      const task = this.cronEngine.createTask({
        name: args.name,
        description: args.description,
        schedule: {
          type: args.scheduleType,
          expression: args.cronExpression,
          interval: args.interval,
          executeAt: args.executeAt ? new Date(args.executeAt) : undefined,
        },
        action: {
          type: args.actionType,
          config: args.actionConfig,
        },
        options: {
          timezone: args.timezone,
          retryCount: args.retryCount,
          retryDelay: args.retryDelay,
          timeout: args.timeout,
          enabled: args.enabled,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              task,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron create task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to create task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronUpdateTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_update_task', { taskId: args.taskId });

      const updates: any = {};

      if (args.name) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;
      
      if (args.cronExpression || args.interval || args.executeAt) {
        updates.schedule = {};
        if (args.cronExpression) updates.schedule.expression = args.cronExpression;
        if (args.interval) updates.schedule.interval = args.interval;
        if (args.executeAt) updates.schedule.executeAt = new Date(args.executeAt);
      }

      if (args.actionConfig) {
        updates.action = { config: args.actionConfig };
      }

      if (args.timezone || args.retryCount !== undefined || args.timeout) {
        updates.options = {};
        if (args.timezone) updates.options.timezone = args.timezone;
        if (args.retryCount !== undefined) updates.options.retryCount = args.retryCount;
        if (args.timeout) updates.options.timeout = args.timeout;
      }

      const task = this.cronEngine.updateTask(args.taskId, updates);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              task,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron update task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to update task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronDeleteTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_delete_task', { taskId: args.taskId });

      this.cronEngine.deleteTask(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Task ${args.taskId} deleted`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron delete task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to delete task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronListTasks(args: any): Promise<any> {
    try {
      logger.info('Handling cron_list_tasks', { args });

      const tasks = this.cronEngine.taskManager.listTasks({
        enabled: args.enabled,
        scheduleType: args.scheduleType,
        actionType: args.actionType,
        limit: args.limit || 50,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              tasks,
              count: tasks.length,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron list tasks failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to list tasks',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronGetTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_get_task', { taskId: args.taskId });

      const task = this.cronEngine.taskManager.getTask(args.taskId);

      if (!task) {
        throw new Error(`Task not found: ${args.taskId}`);
      }

      // Get next run time if task is enabled
      let nextRun = null;
      if (task.schedule.type === 'cron' && task.schedule.expression) {
        nextRun = this.cronEngine.scheduler.getNextRun(
          task.schedule.expression,
          task.options.timezone
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              task,
              nextRun,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron get task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to get task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronEnableTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_enable_task', { taskId: args.taskId });

      this.cronEngine.enableTask(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Task ${args.taskId} enabled`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron enable task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to enable task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronDisableTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_disable_task', { taskId: args.taskId });

      this.cronEngine.disableTask(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Task ${args.taskId} disabled`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron disable task failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to disable task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronExecuteNow(args: any): Promise<any> {
    try {
      logger.info('Handling cron_execute_now', { taskId: args.taskId });

      await this.cronEngine.executeNow(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Task ${args.taskId} executed`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron execute now failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to execute task',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronGetHistory(args: any): Promise<any> {
    try {
      logger.info('Handling cron_get_history', { taskId: args.taskId });

      const history = this.cronEngine.history.getHistory(
        args.taskId,
        args.limit || 50
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              history,
              count: history.length,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron get history failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to get history',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronGetStatistics(args: any): Promise<any> {
    try {
      logger.info('Handling cron_get_statistics', { taskId: args.taskId });

      const stats = this.cronEngine.history.getStatistics(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              statistics: stats,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron get statistics failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to get statistics',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronClearHistory(args: any): Promise<any> {
    try {
      logger.info('Handling cron_clear_history', { taskId: args.taskId });

      const deletedCount = this.cronEngine.history.clearHistory(args.taskId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Cleared ${deletedCount} execution records`,
              deletedCount,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron clear history failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to clear history',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleCronValidateExpression(args: any): Promise<any> {
    try {
      logger.info('Handling cron_validate_expression', { expression: args.expression });

      const isValid = this.cronEngine.scheduler.validate(args.expression);
      const nextRun = isValid 
        ? this.cronEngine.scheduler.getNextRun(args.expression, args.timezone)
        : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              valid: isValid,
              nextRun,
              expression: args.expression,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Cron validate expression failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'CRON_ERROR',
                message: error.message || 'Failed to validate expression',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  // ============================================================================
  // File Engine Handlers
  // ============================================================================

  private async handleFileRead(args: any): Promise<any> {
    try {
      logger.info('Handling file_read', { path: args.path });

      const content = await this.fileEngine.local.read(args.path, {
        encoding: args.encoding as BufferEncoding || 'utf-8',
        start: args.start,
        end: args.end,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              content,
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File read failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to read file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileWrite(args: any): Promise<any> {
    try {
      logger.info('Handling file_write', { path: args.path });

      await this.fileEngine.local.write(args.path, args.content, {
        encoding: args.encoding as BufferEncoding || 'utf-8',
        mode: args.mode || 'overwrite',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `File written successfully`,
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File write failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to write file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileCopy(args: any): Promise<any> {
    try {
      logger.info('Handling file_copy', { source: args.source, destination: args.destination });

      await this.fileEngine.local.copy(args.source, args.destination, {
        recursive: args.recursive || false,
        overwrite: args.overwrite || false,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Copied successfully`,
              source: args.source,
              destination: args.destination,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File copy failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to copy file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileMove(args: any): Promise<any> {
    try {
      logger.info('Handling file_move', { source: args.source, destination: args.destination });

      await this.fileEngine.local.move(args.source, args.destination, args.overwrite || false);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Moved successfully`,
              source: args.source,
              destination: args.destination,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File move failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to move file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileDelete(args: any): Promise<any> {
    try {
      logger.info('Handling file_delete', { path: args.path });

      await this.fileEngine.local.delete(args.path, args.recursive || false);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Deleted successfully`,
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File delete failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to delete file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileList(args: any): Promise<any> {
    try {
      logger.info('Handling file_list', { path: args.path });

      const files = await this.fileEngine.local.list(args.path, args.recursive || false, args.pattern);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              files,
              count: files.length,
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File list failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to list files',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileStat(args: any): Promise<any> {
    try {
      logger.info('Handling file_stat', { path: args.path });

      const stats = await this.fileEngine.local.stat(args.path);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              stats,
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File stat failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to get file stats',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileWatch(args: any): Promise<any> {
    try {
      logger.info('Handling file_watch', { path: args.path });

      const watchId = `watch-${Date.now()}`;
      const paths = Array.isArray(args.path) ? args.path : [args.path];
      
      this.fileEngine.watch.watch(
        watchId,
        paths,
        (event: string, filePath: string) => {
          logger.info('File watch event', { watchId, event, filePath });
        },
        {
          events: args.events || ['add', 'change', 'unlink'],
          recursive: args.recursive || false,
          ignored: args.ignored,
          debounce: args.debounce || 300,
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              watchId,
              message: `Watching ${args.path}`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File watch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to watch file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileUnwatch(args: any): Promise<any> {
    try {
      logger.info('Handling file_unwatch', { watchId: args.watchId });

      this.fileEngine.watch.unwatch(args.watchId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Stopped watching`,
              watchId: args.watchId,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File unwatch failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to unwatch file',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileArchiveCreate(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_create', { destination: args.destination });

      await this.fileEngine.archive.create({
        sources: args.sources,
        destination: args.destination,
        format: args.format || 'zip',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Archive created successfully`,
              destination: args.destination,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File archive create failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to create archive',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileArchiveExtract(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_extract', { archive: args.archive });

      await this.fileEngine.archive.extract({
        archive: args.archive,
        destination: args.destination,
        format: args.format,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Archive extracted successfully`,
              destination: args.destination,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File archive extract failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to extract archive',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileArchiveList(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_list', { archive: args.archive });

      const entries = await this.fileEngine.archive.list(
        args.archive,
        args.format
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              entries,
              count: entries.length,
              archive: args.archive,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File archive list failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to list archive',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileHash(args: any): Promise<any> {
    try {
      logger.info('Handling file_hash', { path: args.path });

      const hash = await this.fileEngine.hash.hash(args.path, args.algorithm || 'sha256');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              hash,
              algorithm: args.algorithm || 'sha256',
              path: args.path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File hash failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to calculate hash',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileS3Upload(args: any): Promise<any> {
    try {
      logger.info('Handling file_s3_upload', { filePath: args.filePath });

      await this.fileEngine.cloud.uploadToS3({
        filePath: args.filePath,
        bucket: args.bucket,
        key: args.key,
        credentials: args.credentials,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Uploaded to S3 successfully`,
              key: args.key,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File S3 upload failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to upload to S3',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileS3Download(args: any): Promise<any> {
    try {
      logger.info('Handling file_s3_download', { key: args.key });

      await this.fileEngine.cloud.downloadFromS3({
        bucket: args.bucket,
        key: args.key,
        destination: args.destination,
        credentials: args.credentials,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Downloaded from S3 successfully`,
              localPath: args.localPath,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File S3 download failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to download from S3',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileS3List(args: any): Promise<any> {
    try {
      logger.info('Handling file_s3_list', { bucket: args.bucket });

      const objects = await this.fileEngine.cloud.listS3Objects({
        bucket: args.bucket,
        prefix: args.prefix,
        credentials: args.credentials,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              objects,
              count: objects.length,
              bucket: args.bucket,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File S3 list failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to list S3 objects',
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  private async handleFileBatchOperation(args: any): Promise<any> {
    try {
      logger.info('Handling file_batch_operation', { operation: args.operation });

      // Convert sources to batch items
      const items = args.sources.map((source: string) => ({
        source,
        destination: args.destination,
      }));

      // Create executor based on operation
      let executor: (item: any) => Promise<void>;
      
      if (args.operation === 'copy') {
        executor = async (item) => {
          await this.fileEngine.local.copy(item.source, item.destination, {
            recursive: args.options?.recursive || false,
            overwrite: args.options?.overwrite || false,
          });
        };
      } else if (args.operation === 'move') {
        executor = async (item) => {
          await this.fileEngine.local.move(item.source, item.destination, args.options?.overwrite || false);
        };
      } else if (args.operation === 'delete') {
        executor = async (item) => {
          await this.fileEngine.local.delete(item.source, args.options?.recursive || false);
        };
      } else {
        throw new Error(`Unknown batch operation: ${args.operation}`);
      }

      const results = await this.fileEngine.batch.execute(
        {
          operation: args.operation,
          items,
          concurrency: args.options?.concurrency || 5,
          continueOnError: args.options?.continueOnError !== false,
        },
        executor
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              results,
              operation: args.operation,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('File batch operation failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || 'FILE_ERROR',
                message: error.message || 'Failed to execute batch operation',
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
    
    // Close cron engine
    this.cronEngine.close();
    
    await this.server.close();
    logger.info('Server closed');
  }
}
