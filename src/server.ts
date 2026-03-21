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
import { WellfoundConnector } from './connectors/wellfound.js';
import { GenericBrowserConnector } from './connectors/generic.js';
import type { JobSearchParams } from './types/job.js';
import { OktyvErrorCode } from './types/mcp.js';
import { VaultEngine } from './tools/vault/VaultEngine.js';
import { FileEngine } from './tools/file/FileEngine.js';
import { fileTools } from './tools/file/tools.js';
import { ParallelExecutionEngine } from './engines/parallel/ParallelExecutionEngine.js';
import { VisualInspectionConnector } from './connectors/visual-inspection.js';
import { ensureScreenshotsBaseExists } from './browser/session-manager.js';

const logger = createLogger('server');

export class OktyvServer {
  private server: Server;
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private linkedInConnector: LinkedInConnector;
  private wellfoundConnector: WellfoundConnector;
  private genericConnector: GenericBrowserConnector;
  private visualConnector: VisualInspectionConnector;
  private vaultEngine: VaultEngine;
  private fileEngine: FileEngine;
  private parallelEngine: ParallelExecutionEngine;

  constructor() {
    this.server = new Server(
      {
        name: 'oktyv',
        version: '1.3.0',
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
    this.wellfoundConnector = new WellfoundConnector(this.sessionManager, this.rateLimiter);
    this.genericConnector = new GenericBrowserConnector(this.sessionManager, this.rateLimiter);
    this.visualConnector = new VisualInspectionConnector(this.sessionManager, this.rateLimiter);

    // Ensure temp screenshots dir exists on startup (D:\ only, never C:\)
    ensureScreenshotsBaseExists().catch(err =>
      logger.warn('Could not create screenshots base dir', { err })
    );

    // Initialize vault infrastructure
    this.vaultEngine = new VaultEngine();

    // Initialize file infrastructure
    this.fileEngine = new FileEngine();

    // Initialize parallel execution infrastructure
    // Tool registry will be populated after setupHandlers()
    const toolRegistry = new Map<string, (params: Record<string, any>) => Promise<any>>();
    this.parallelEngine = new ParallelExecutionEngine(toolRegistry);

    // Register handlers
    this.setupHandlers();
    
    // Populate tool registry with all available tools
    this.populateToolRegistry(toolRegistry);

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
          // Indeed tools removed - redundant with cloud connector
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
          // Visual Inspection Tools
          {
            name: 'browser_scroll_capture',
            description: 'Scroll a fully-rendered page in viewport increments and capture each section as a PNG. Temp files are auto-deleted after returning results (cleanup=true by default). No C:\\ paths.',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'URL to navigate to before capturing (optional — reuses current page if omitted)',
                },
                outputDir: {
                  type: 'string',
                  description: 'Override default temp directory (optional)',
                },
                viewportWidth: {
                  type: 'number',
                  description: 'Viewport width in pixels (default: 1280)',
                },
                viewportHeight: {
                  type: 'number',
                  description: 'Viewport height per capture in pixels (default: 900)',
                },
                overlap: {
                  type: 'number',
                  description: 'Overlap between captures in px (default: 100)',
                },
                waitAfterScroll: {
                  type: 'number',
                  description: 'ms to wait after scroll before capture (default: 300)',
                },
                cleanup: {
                  type: 'boolean',
                  description: 'Delete temp files after returning result (default: true)',
                },
              },
              required: [],
            },
          },
          {
            name: 'browser_selector_capture',
            description: 'Capture specific DOM elements by CSS selector — element bounding box only. Temp files auto-deleted (cleanup=true default).',
            inputSchema: {
              type: 'object',
              properties: {
                selectors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'CSS selectors to capture (one screenshot per matched element)',
                },
                url: {
                  type: 'string',
                  description: 'URL to navigate to first (optional)',
                },
                outputDir: {
                  type: 'string',
                  description: 'Override default temp directory (optional)',
                },
                padding: {
                  type: 'number',
                  description: 'Extra px around element bounding box (default: 8)',
                },
                cleanup: {
                  type: 'boolean',
                  description: 'Delete temp files after returning result (default: true)',
                },
              },
              required: ['selectors'],
            },
          },
          {
            name: 'browser_computed_styles',
            description: 'Extract computed CSS properties for matching elements. ZERO disk I/O — pure data. Use to verify fonts loaded, colors correct, layout dimensions. Most powerful QA tool.',
            inputSchema: {
              type: 'object',
              properties: {
                selectors: {
                  type: 'object',
                  description: 'Map of human labels to selector configs. e.g. {"hero-font": {"selector": "h1", "properties": ["font-family", "font-size"]}}',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      selector: { type: 'string', description: 'CSS selector' },
                      properties: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'CSS property names to inspect (e.g. ["font-family", "color"])',
                      },
                      multiple: {
                        type: 'boolean',
                        description: 'Inspect all matching elements (default: first only)',
                      },
                    },
                    required: ['selector', 'properties'],
                  },
                },
                url: {
                  type: 'string',
                  description: 'URL to navigate to first (optional)',
                },
              },
              required: ['selectors'],
            },
          },
          {
            name: 'browser_batch_audit',
            description: 'Parallel visual audit across multiple URLs. Hardware-limited concurrency (default maxConcurrent: 3). Supports scroll, selector, and computed-styles modes per target.',
            inputSchema: {
              type: 'object',
              properties: {
                targets: {
                  type: 'array',
                  description: 'Array of audit targets',
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string', description: 'URL to audit' },
                      label: { type: 'string', description: 'Human label for this target' },
                      captureMode: {
                        type: 'string',
                        enum: ['scroll', 'selector', 'styles', 'scroll+styles', 'selector+styles'],
                        description: 'What to capture for this target',
                      },
                      selectors: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'CSS selectors (for selector/selector+styles mode)',
                      },
                      styleSelectors: {
                        type: 'object',
                        description: 'Style selectors map (for styles/scroll+styles/selector+styles mode)',
                        additionalProperties: {
                          type: 'object',
                          properties: {
                            selector: { type: 'string' },
                            properties: { type: 'array', items: { type: 'string' } },
                          },
                          required: ['selector', 'properties'],
                        },
                      },
                      scrollOptions: {
                        type: 'object',
                        description: 'Optional scroll capture overrides',
                      },
                    },
                    required: ['url', 'label', 'captureMode'],
                  },
                },
                maxConcurrent: {
                  type: 'number',
                  description: 'Max concurrent browser pages (default: 3)',
                },
                outputDir: {
                  type: 'string',
                  description: 'Shared base output dir for this batch (optional)',
                },
                cleanup: {
                  type: 'boolean',
                  description: 'Delete all temp files after batch completes (default: true)',
                },
              },
              required: ['targets'],
            },
          },
          {
            name: 'browser_session_cleanup',
            description: 'Explicitly delete a temp screenshot session directory (for when cleanup=false was used). Returns number of files deleted.',
            inputSchema: {
              type: 'object',
              properties: {
                sessionDir: {
                  type: 'string',
                  description: 'Full path to the session directory to delete (must be under D:/Dev/oktyv/screenshots/temp/)',
                },
              },
              required: ['sessionDir'],
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
          // TEMPORARILY DISABLED: CronEngine requires better-sqlite3 (native module compatibility)
          // ...cronTools,

          // API Engine Tools - REMOVED (not actively used)

          // Database Engine Tools - REMOVED (not actively used)

          // Email Engine Tools - REMOVED (not actively used)

          // Parallel Execution Engine
          {
            name: 'parallel_execute',
            description: 'Execute multiple Oktyv operations concurrently with dependency management. Supports DAG-based execution with automatic level detection, variable substitution between tasks, and configurable concurrency control.',
            inputSchema: {
              type: 'object',
              properties: {
                tasks: {
                  type: 'array',
                  description: 'Array of tasks to execute. Each task specifies a tool to run with parameters and optional dependencies.',
                  items: {
                    type: 'object',
                    properties: {
                      id: {
                        type: 'string',
                        description: 'Unique identifier for this task (used for dependency references and variable substitution)',
                      },
                      tool: {
                        type: 'string',
                        description: 'Name of the Oktyv tool to execute (e.g., "file_move", "email_gmail_send")',
                      },
                      params: {
                        type: 'object',
                        description: 'Parameters to pass to the tool. Supports variable substitution from previous task results using ${taskId.result.field} syntax.',
                      },
                      dependsOn: {
                        type: 'array',
                        description: 'Optional array of task IDs that must complete successfully before this task runs',
                        items: {
                          type: 'string',
                        },
                      },
                      timeout: {
                        type: 'number',
                        description: 'Optional timeout in milliseconds for this specific task',
                      },
                    },
                    required: ['id', 'tool', 'params'],
                  },
                },
                config: {
                  type: 'object',
                  description: 'Optional execution configuration',
                  properties: {
                    maxConcurrent: {
                      type: 'number',
                      description: 'Maximum number of tasks to run concurrently (default: 10)',
                    },
                    continueOnError: {
                      type: 'boolean',
                      description: 'Whether to continue executing remaining tasks after a failure (default: true)',
                    },
                    timeout: {
                      type: 'number',
                      description: 'Overall execution timeout in milliseconds',
                    },
                  },
                },
              },
              required: ['tasks'],
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

          // Visual Inspection Tools
          case 'browser_scroll_capture':
            return await this.handleBrowserScrollCapture(args);

          case 'browser_selector_capture':
            return await this.handleBrowserSelectorCapture(args);

          case 'browser_computed_styles':
            return await this.handleBrowserComputedStyles(args);

          case 'browser_batch_audit':
            return await this.handleBrowserBatchAudit(args);

          case 'browser_session_cleanup':
            return await this.handleBrowserSessionCleanup(args);

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

          // File Engine Tools (trimmed)
          case 'file_copy':
            return await this.handleFileCopy(args);

          case 'file_delete':
            return await this.handleFileDelete(args);

          case 'file_archive_create':
            return await this.handleFileArchiveCreate(args);

          case 'file_archive_extract':
            return await this.handleFileArchiveExtract(args);

          case 'file_archive_list':
            return await this.handleFileArchiveList(args);

          case 'file_hash':
            return await this.handleFileHash(args);

          // API, Database, Email, Cron Engine Tools - REMOVED

          // Parallel Execution Engine
          case 'parallel_execute':
            return await this.handleParallelExecute(args);

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

  // Visual Inspection Handlers

  private async handleBrowserScrollCapture(args: any): Promise<any> {
    try {
      logger.info('Handling browser_scroll_capture', { args });
      const result = await this.visualConnector.scrollCapture(args);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }],
      };
    } catch (error: any) {
      logger.error('browser_scroll_capture failed', { error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'scroll_capture failed', retryable: false },
          }, null, 2),
        }],
      };
    }
  }

  private async handleBrowserSelectorCapture(args: any): Promise<any> {
    try {
      logger.info('Handling browser_selector_capture', { args });
      if (!args.selectors || !Array.isArray(args.selectors)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selectors array is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.selectorCapture(args);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }],
      };
    } catch (error: any) {
      logger.error('browser_selector_capture failed', { error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'selector_capture failed', retryable: false },
          }, null, 2),
        }],
      };
    }
  }

  private async handleBrowserComputedStyles(args: any): Promise<any> {
    try {
      logger.info('Handling browser_computed_styles', { args });
      if (!args.selectors || typeof args.selectors !== 'object') {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selectors object is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.computedStyles(args);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }],
      };
    } catch (error: any) {
      logger.error('browser_computed_styles failed', { error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'computed_styles failed', retryable: false },
          }, null, 2),
        }],
      };
    }
  }

  private async handleBrowserBatchAudit(args: any): Promise<any> {
    try {
      logger.info('Handling browser_batch_audit', { targetCount: args.targets?.length });
      if (!args.targets || !Array.isArray(args.targets) || args.targets.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'targets array is required and must not be empty', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.batchAudit(args);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }],
      };
    } catch (error: any) {
      logger.error('browser_batch_audit failed', { error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'batch_audit failed', retryable: false },
          }, null, 2),
        }],
      };
    }
  }

  private async handleBrowserSessionCleanup(args: any): Promise<any> {
    try {
      logger.info('Handling browser_session_cleanup', { sessionDir: args.sessionDir });
      if (!args.sessionDir) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'sessionDir is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.sessionCleanup(args.sessionDir);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }],
      };
    } catch (error: any) {
      logger.error('browser_session_cleanup failed', { error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'session_cleanup failed', retryable: false },
          }, null, 2),
        }],
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

  private async handleParallelExecute(args: any): Promise<any> {
    try {
      logger.info('Handling parallel_execute', {
        taskCount: args.tasks?.length,
        config: args.config
      });

      // Validate request
      if (!args.tasks || !Array.isArray(args.tasks) || args.tasks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: OktyvErrorCode.INVALID_PARAMETERS,
                  message: 'tasks array is required and must not be empty',
                  retryable: false,
                },
              }, null, 2),
            },
          ],
        };
      }

      // Execute parallel tasks
      const result = await this.parallelEngine.execute({
        tasks: args.tasks,
        config: args.config,
      });

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
      logger.error('Parallel execution failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: error.code || OktyvErrorCode.UNKNOWN_ERROR,
                message: error.message || 'Parallel execution failed',
                retryable: error.retryable !== false,
              },
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * Populate tool registry for parallel execution
   * Maps each tool name to an executor function
   */
  private populateToolRegistry(registry: Map<string, (params: Record<string, any>) => Promise<any>>): void {
    // Helper to wrap handler methods for parallel execution
    const wrapHandler = (handler: (args: any) => Promise<any>) => {
      return async (params: Record<string, any>) => {
        const result = await handler.call(this, params);
        // Extract actual result from MCP response format
        if (result.content && result.content[0] && result.content[0].text) {
          const parsed = JSON.parse(result.content[0].text);
          if (parsed.success) {
            return parsed.result;
          } else {
            const error: any = new Error(parsed.error?.message || 'Tool execution failed');
            error.code = parsed.error?.code;
            throw error;
          }
        }
        throw new Error('Invalid tool response format');
      };
    };

    // Register all LinkedIn tools
    registry.set('linkedin_search_jobs', wrapHandler(this.handleLinkedInSearchJobs));
    registry.set('linkedin_get_job', wrapHandler(this.handleLinkedInGetJob));
    registry.set('linkedin_get_company', wrapHandler(this.handleLinkedInGetCompany));

    // Register all Wellfound tools
    registry.set('wellfound_search_jobs', wrapHandler(this.handleWellfoundSearchJobs));
    registry.set('wellfound_get_job', wrapHandler(this.handleWellfoundGetJob));
    registry.set('wellfound_get_company', wrapHandler(this.handleWellfoundGetCompany));

    // Register all Generic Browser tools
    registry.set('browser_navigate', wrapHandler(this.handleBrowserNavigate));
    registry.set('browser_click', wrapHandler(this.handleBrowserClick));
    registry.set('browser_type', wrapHandler(this.handleBrowserType));
    registry.set('browser_extract', wrapHandler(this.handleBrowserExtract));
    registry.set('browser_screenshot', wrapHandler(this.handleBrowserScreenshot));
    registry.set('browser_pdf', wrapHandler(this.handleBrowserPdf));
    registry.set('browser_form_fill', wrapHandler(this.handleBrowserFormFill));
    registry.set('browser_scroll_capture', wrapHandler(this.handleBrowserScrollCapture));
    registry.set('browser_selector_capture', wrapHandler(this.handleBrowserSelectorCapture));
    registry.set('browser_computed_styles', wrapHandler(this.handleBrowserComputedStyles));
    registry.set('browser_batch_audit', wrapHandler(this.handleBrowserBatchAudit));
    registry.set('browser_session_cleanup', wrapHandler(this.handleBrowserSessionCleanup));

    // Register all Vault tools
    registry.set('vault_set', wrapHandler(this.handleVaultSet));
    registry.set('vault_get', wrapHandler(this.handleVaultGet));
    registry.set('vault_delete', wrapHandler(this.handleVaultDelete));
    registry.set('vault_list', wrapHandler(this.handleVaultList));
    registry.set('vault_list_vaults', wrapHandler(this.handleVaultListVaults));
    registry.set('vault_delete_vault', wrapHandler(this.handleVaultDeleteVault));

    // Register kept File tools
    registry.set('file_copy', wrapHandler(this.handleFileCopy));
    registry.set('file_delete', wrapHandler(this.handleFileDelete));
    registry.set('file_hash', wrapHandler(this.handleFileHash));
    registry.set('file_archive_create', wrapHandler(this.handleFileArchiveCreate));
    registry.set('file_archive_extract', wrapHandler(this.handleFileArchiveExtract));
    registry.set('file_archive_list', wrapHandler(this.handleFileArchiveList));

    logger.info('Tool registry populated for parallel execution', {
      toolCount: registry.size
    });
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
