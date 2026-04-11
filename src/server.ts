/**
 * Oktyv MCP Server
 *
 * Main server class implementing the Model Context Protocol.
 * Migrated from deprecated Server API to McpServer (SDK 1.25.x).
 * Each tool is registered declaratively with Zod schemas.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
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
import { ParallelExecutionEngine } from './engines/parallel/ParallelExecutionEngine.js';
import { ShellEngine } from './engines/shell/ShellEngine.js';
import { VisualInspectionConnector } from './connectors/visual-inspection.js';
import { ensureScreenshotsBaseExists } from './browser/session-manager.js';

const logger = createLogger('server');

export class OktyvServer {
  private server: McpServer;
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private linkedInConnector: LinkedInConnector;
  private wellfoundConnector: WellfoundConnector;
  private genericConnector: GenericBrowserConnector;
  private visualConnector: VisualInspectionConnector;
  private vaultEngine: VaultEngine;
  private fileEngine: FileEngine;
  private parallelEngine: ParallelExecutionEngine;
  private shellEngine: ShellEngine;

  constructor() {
    this.server = new McpServer({
      name: 'oktyv',
      version: '1.4.0',
    });

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
    const toolRegistry = new Map<string, (params: Record<string, any>) => Promise<any>>();
    this.parallelEngine = new ParallelExecutionEngine(toolRegistry);

    // Register all tools declaratively with Zod schemas
    this.registerTools();

    // Initialize shell engine
    this.shellEngine = new ShellEngine();

    // Populate tool registry for parallel execution engine
    this.populateToolRegistry(toolRegistry);

    logger.info('Oktyv Server initialized');
  }

  // ============================================================================
  // Tool Registration — McpServer declarative API with Zod schemas
  // ============================================================================

  private registerTools(): void {

    // ── LinkedIn ──────────────────────────────────────────────────────────────

    this.server.tool(
      'linkedin_search_jobs',
      'Search for jobs on LinkedIn with filters',
      {
        keywords: z.string().optional().describe('Job title, skills, or keywords to search for'),
        location: z.string().optional().describe('City, state, or country'),
        remote: z.boolean().optional().describe('Filter for remote positions only'),
        limit: z.number().min(1).max(50).optional().describe('Maximum number of results (default: 10)'),
      },
      async (args) => this.handleLinkedInSearchJobs(args),
    );

    this.server.tool(
      'linkedin_get_job',
      'Get detailed information about a specific LinkedIn job posting',
      {
        jobId: z.string().describe('LinkedIn job ID'),
        includeCompany: z.boolean().optional().describe('Whether to fetch company details (default: false)'),
      },
      async (args) => this.handleLinkedInGetJob(args),
    );

    this.server.tool(
      'linkedin_get_company',
      'Get detailed information about a company on LinkedIn',
      {
        companyId: z.string().describe('LinkedIn company ID or vanity name'),
      },
      async (args) => this.handleLinkedInGetCompany(args),
    );

    // ── Wellfound ─────────────────────────────────────────────────────────────

    this.server.tool(
      'wellfound_search_jobs',
      'Search for jobs on Wellfound (formerly AngelList Talent) — startup-focused job board',
      {
        keywords: z.string().optional().describe('Job title, skills, or keywords to search for'),
        location: z.string().optional().describe('City, state, or country'),
        remote: z.boolean().optional().describe('Filter for remote positions only'),
        limit: z.number().min(1).max(50).optional().describe('Maximum number of results (default: 10)'),
      },
      async (args) => this.handleWellfoundSearchJobs(args),
    );

    this.server.tool(
      'wellfound_get_job',
      'Get detailed information about a specific job posting on Wellfound',
      {
        jobSlug: z.string().describe('Wellfound job slug (from search results)'),
        includeCompany: z.boolean().optional().describe('Whether to fetch company details (default: false)'),
      },
      async (args) => this.handleWellfoundGetJob(args),
    );

    this.server.tool(
      'wellfound_get_company',
      'Get detailed information about a company on Wellfound, including funding info',
      {
        companySlug: z.string().describe('Wellfound company slug'),
      },
      async (args) => this.handleWellfoundGetCompany(args),
    );

    // ── Generic Browser ───────────────────────────────────────────────────────

    this.server.tool(
      'browser_navigate',
      'Navigate to any URL in the browser',
      {
        url: z.string().describe('URL to navigate to'),
        waitForSelector: z.string().optional().describe('CSS selector to wait for after navigation'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
      },
      async (args) => this.handleBrowserNavigate(args),
    );

    this.server.tool(
      'browser_click',
      'Click on an element using a CSS selector',
      {
        selector: z.string().describe('CSS selector of element to click'),
        waitForNavigation: z.boolean().optional().describe('Wait for page navigation after click (default: false)'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 10000)'),
      },
      async (args) => this.handleBrowserClick(args),
    );

    this.server.tool(
      'browser_type',
      'Type text into an input field',
      {
        selector: z.string().describe('CSS selector of input field'),
        text: z.string().describe('Text to type'),
        delay: z.number().optional().describe('Delay between keystrokes in ms (default: 50)'),
        clear: z.boolean().optional().describe('Clear existing text first (default: false)'),
      },
      async (args) => this.handleBrowserType(args),
    );

    this.server.tool(
      'browser_extract',
      'Extract data from page using CSS selectors',
      {
        selectors: z.record(z.string()).describe('Map of keys to CSS selectors'),
        multiple: z.boolean().optional().describe('Extract from all matching elements (default: false)'),
      },
      async (args) => this.handleBrowserExtract(args),
    );

    this.server.tool(
      'browser_screenshot',
      'Capture a screenshot of the current page',
      {
        fullPage: z.boolean().optional().describe('Capture full scrollable page (default: false)'),
        selector: z.string().optional().describe('CSS selector of specific element to screenshot'),
      },
      async (args) => this.handleBrowserScreenshot(args),
    );

    this.server.tool(
      'browser_pdf',
      'Generate a PDF of the current page',
      {
        format: z.enum(['Letter', 'Legal', 'A4']).optional().describe('Paper format (default: Letter)'),
        landscape: z.boolean().optional().describe('Use landscape orientation (default: false)'),
      },
      async (args) => this.handleBrowserPdf(args),
    );

    this.server.tool(
      'browser_form_fill',
      'Fill out a form with provided data',
      {
        fields: z.record(z.string()).describe('Map of CSS selectors to values'),
        submitSelector: z.string().optional().describe('CSS selector of submit button'),
        submitWaitForNavigation: z.boolean().optional().describe('Wait for navigation after submit (default: false)'),
      },
      async (args) => this.handleBrowserFormFill(args),
    );

    // ── Visual Inspection ─────────────────────────────────────────────────────

    this.server.tool(
      'browser_scroll_capture',
      'Scroll a fully-rendered page in viewport increments and capture each section as a PNG. Temp files auto-deleted (cleanup=true default). No C:\\ paths.',
      {
        url: z.string().optional().describe('URL to navigate to before capturing (omit to reuse current page)'),
        outputDir: z.string().optional().describe('Override default temp directory'),
        viewportWidth: z.number().optional().describe('Viewport width in pixels (default: 1280)'),
        viewportHeight: z.number().optional().describe('Viewport height per capture in pixels (default: 900)'),
        overlap: z.number().optional().describe('Overlap between captures in px (default: 100)'),
        waitAfterScroll: z.number().optional().describe('ms to wait after scroll before capture (default: 300)'),
        cleanup: z.boolean().optional().describe('Delete temp files after returning result (default: true)'),
      },
      async (args) => this.handleBrowserScrollCapture(args),
    );

    this.server.tool(
      'browser_selector_capture',
      'Capture specific DOM elements by CSS selector — element bounding box only. Temp files auto-deleted.',
      {
        selectors: z.array(z.string()).describe('CSS selectors to capture (one screenshot per matched element)'),
        url: z.string().optional().describe('URL to navigate to first'),
        outputDir: z.string().optional().describe('Override default temp directory'),
        padding: z.number().optional().describe('Extra px around element bounding box (default: 8)'),
        cleanup: z.boolean().optional().describe('Delete temp files after returning result (default: true)'),
      },
      async (args) => this.handleBrowserSelectorCapture(args),
    );

    this.server.tool(
      'browser_computed_styles',
      'Extract computed CSS properties for matching elements. ZERO disk I/O — pure data. Use to verify fonts, colors, layout dimensions.',
      {
        selectors: z.record(
          z.object({
            selector: z.string().describe('CSS selector'),
            properties: z.array(z.string()).describe('CSS property names to inspect'),
            multiple: z.boolean().optional().describe('Inspect all matching elements (default: first only)'),
          })
        ).describe('Map of human labels to selector configs'),
        url: z.string().optional().describe('URL to navigate to first'),
      },
      async (args) => this.handleBrowserComputedStyles(args),
    );

    this.server.tool(
      'browser_batch_audit',
      'Parallel visual audit across multiple URLs. Hardware-limited concurrency (default maxConcurrent: 3).',
      {
        targets: z.array(
          z.object({
            url: z.string().describe('URL to audit'),
            label: z.string().describe('Human label for this target'),
            captureMode: z.enum(['scroll', 'selector', 'styles', 'scroll+styles', 'selector+styles']).describe('What to capture'),
            selectors: z.array(z.string()).optional().describe('CSS selectors (for selector/selector+styles mode)'),
            styleSelectors: z.record(
              z.object({ selector: z.string(), properties: z.array(z.string()) })
            ).optional().describe('Style selectors map (for styles/* mode)'),
            scrollOptions: z.record(z.any()).optional().describe('Optional scroll capture overrides'),
          })
        ).describe('Array of audit targets'),
        maxConcurrent: z.number().optional().describe('Max concurrent browser pages (default: 3)'),
        outputDir: z.string().optional().describe('Shared base output dir for this batch'),
        cleanup: z.boolean().optional().describe('Delete all temp files after batch completes (default: true)'),
      },
      async (args) => this.handleBrowserBatchAudit(args),
    );

    this.server.tool(
      'browser_session_cleanup',
      'Explicitly delete a temp screenshot session directory (for when cleanup=false was used).',
      {
        sessionDir: z.string().describe('Full path to the session directory to delete (must be under D:/Dev/oktyv/screenshots/temp/)'),
      },
      async (args) => this.handleBrowserSessionCleanup(args),
    );

    this.server.tool(
      'image_read',
      'Read a local image file and return it as base64. Supports PNG, JPG, GIF, WebP, BMP, SVG. D:\\ paths only — C:\\ is rejected.',
      {
        path: z.string().describe('Absolute path to image file on D:\\. Supported: .png .jpg .jpeg .gif .webp .bmp .svg'),
      },
      async (args) => this.handleImageRead(args),
    );

    // ── Vault Engine ──────────────────────────────────────────────────────────

    this.server.tool(
      'vault_set',
      'Store an encrypted credential in a vault. Creates vault if it does not exist. Master key stored in OS keychain.',
      {
        vaultName: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).describe('Vault name (lowercase, alphanumeric, hyphens)'),
        credentialName: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/).describe('Credential name (lowercase, alphanumeric, hyphens, underscores)'),
        value: z.string().min(1).max(10000).describe('Secret value to store (encrypted with AES-256-GCM)'),
      },
      async (args) => this.handleVaultSet(args),
    );

    this.server.tool(
      'vault_get',
      'Retrieve and decrypt a credential from a vault. Returns the plaintext secret value.',
      {
        vaultName: z.string().describe('Vault name'),
        credentialName: z.string().describe('Credential name'),
      },
      async (args) => this.handleVaultGet(args),
    );

    this.server.tool(
      'vault_list',
      'List all credential names in a vault (values not included for security).',
      {
        vaultName: z.string().describe('Vault name'),
      },
      async (args) => this.handleVaultList(args),
    );

    this.server.tool(
      'vault_delete',
      'Delete a credential from a vault. Permanent.',
      {
        vaultName: z.string().describe('Vault name'),
        credentialName: z.string().describe('Credential name to delete'),
      },
      async (args) => this.handleVaultDelete(args),
    );

    this.server.tool(
      'vault_delete_vault',
      'Delete an entire vault including all credentials and master key. Permanent — cannot be undone.',
      {
        vaultName: z.string().describe('Vault name to delete'),
      },
      async (args) => this.handleVaultDeleteVault(args),
    );

    this.server.tool(
      'vault_list_vaults',
      'List all vaults. Returns array of vault names.',
      {},
      async (args) => this.handleVaultListVaults(args),
    );

    // ── File Engine ───────────────────────────────────────────────────────────

    this.server.tool(
      'file_copy',
      'Copy file or directory',
      {
        source: z.string().describe('Source path'),
        destination: z.string().describe('Destination path'),
        recursive: z.boolean().optional().describe('Copy directories recursively (default: false)'),
        overwrite: z.boolean().optional().describe('Overwrite if destination exists (default: false)'),
      },
      async (args) => this.handleFileCopy(args),
    );

    this.server.tool(
      'file_delete',
      'Delete file or directory',
      {
        path: z.string().describe('Path to delete'),
        recursive: z.boolean().optional().describe('Delete directories recursively (default: false)'),
      },
      async (args) => this.handleFileDelete(args),
    );

    this.server.tool(
      'file_archive_create',
      'Create archive (ZIP, TAR, TAR.GZ)',
      {
        format: z.enum(['zip', 'tar', 'tar.gz']).describe('Archive format'),
        sources: z.array(z.string()).describe('Files/directories to archive'),
        destination: z.string().describe('Output archive path'),
      },
      async (args) => this.handleFileArchiveCreate(args),
    );

    this.server.tool(
      'file_archive_extract',
      'Extract archive',
      {
        archive: z.string().describe('Archive path'),
        destination: z.string().describe('Extraction destination'),
        format: z.enum(['zip', 'tar', 'tar.gz']).optional().describe('Archive format (auto-detect if not provided)'),
      },
      async (args) => this.handleFileArchiveExtract(args),
    );

    this.server.tool(
      'file_archive_list',
      'List archive contents',
      {
        archive: z.string().describe('Archive path'),
        format: z.enum(['zip', 'tar', 'tar.gz']).optional().describe('Archive format (auto-detect if not provided)'),
      },
      async (args) => this.handleFileArchiveList(args),
    );

    this.server.tool(
      'file_hash',
      'Calculate file hash',
      {
        path: z.string().describe('File path'),
        algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().describe('Hash algorithm (default: sha256)'),
      },
      async (args) => this.handleFileHash(args),
    );

    // ── Parallel Execution Engine ─────────────────────────────────────────────

    this.server.tool(
      'parallel_execute',
      'Execute multiple Oktyv operations concurrently with dependency management. Supports DAG-based execution, variable substitution, and configurable concurrency.',
      {
        tasks: z.array(
          z.object({
            id: z.string().describe('Unique identifier for this task (used for dependency references)'),
            tool: z.string().describe('Name of the Oktyv tool to execute'),
            params: z.record(z.any()).describe('Parameters to pass to the tool. Supports ${taskId.result.field} substitution.'),
            dependsOn: z.array(z.string()).optional().describe('Task IDs that must complete successfully before this task runs'),
            timeout: z.number().optional().describe('Timeout in milliseconds for this specific task'),
          })
        ).describe('Array of tasks to execute'),
        config: z.object({
          maxConcurrent: z.number().optional().describe('Maximum number of tasks to run concurrently (default: 10)'),
          continueOnError: z.boolean().optional().describe('Continue executing remaining tasks after a failure (default: true)'),
          timeout: z.number().optional().describe('Overall execution timeout in milliseconds'),
        }).optional().describe('Optional execution configuration'),
      },
      async (args) => this.handleParallelExecute(args),
    );

    // -- Shell Engine ----------------------------------------------------------

    this.server.tool(
      'shell_batch',
      'Execute multiple shell commands concurrently with optional dependency ordering. Returns stdout, stderr, exit code, and timing for each command.',
      {
        commands: z.array(
          z.object({
            id: z.string().describe('Unique identifier'),
            cmd: z.string().describe('Shell command string'),
            cwd: z.string().optional().describe('Working directory'),
            env: z.record(z.string()).optional().describe('Extra environment variables'),
            timeout: z.number().optional().describe('Per-command timeout ms'),
            shell: z.enum(['powershell', 'cmd', 'bash', 'sh']).optional().describe('Shell override'),
            dependsOn: z.array(z.string()).optional().describe('Command IDs to wait for'),
          })
        ).min(1).describe('Commands to execute'),
        config: z.object({
          maxConcurrent: z.number().optional().describe('Max simultaneous processes (default: 5)'),
          failureMode: z.enum(['continue', 'stop']).optional().describe('Stop or continue on failure'),
          defaultTimeout: z.number().optional().describe('Default timeout ms (default: 300000)'),
          defaultShell: z.string().optional().describe('Default shell'),
        }).optional(),
      },
      async (args) => this.handleShellBatch(args),
    );

    logger.info('All tools registered');
  }

  // ============================================================================
  // Handler Methods — LinkedIn
  // ============================================================================

  private async handleLinkedInSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_search_jobs', { args });
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
      const jobs = await this.linkedInConnector.searchJobs(params);
      return {
        content: [{
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
              platform: 'LINKEDIN',
            },
          }, null, 2),
        }],
      };
    } catch (error: any) {
      logger.error('LinkedIn job search failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleLinkedInGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_get_job', { args });
      const { jobId, includeCompany = false } = args;
      if (!jobId) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'jobId is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.linkedInConnector.getJob(jobId, includeCompany);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('LinkedIn job fetch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleLinkedInGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling linkedin_get_company', { args });
      const { companyId } = args;
      if (!companyId) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'companyId is required', retryable: false } }, null, 2) }] };
      }
      const company = await this.linkedInConnector.getCompany(companyId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: company }, null, 2) }] };
    } catch (error: any) {
      logger.error('LinkedIn company fetch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Wellfound
  // ============================================================================

  private async handleWellfoundSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_search_jobs', { args });
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
      const jobs = await this.wellfoundConnector.searchJobs(params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: { jobs, totalCount: jobs.length, hasMore: jobs.length >= (params.limit || 10), nextOffset: (params.offset || 0) + jobs.length, query: params, searchedAt: new Date(), platform: 'WELLFOUND' },
          }, null, 2),
        }],
      };
    } catch (error: any) {
      logger.error('Wellfound job search failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleWellfoundGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_get_job', { args });
      const { jobSlug, includeCompany = false } = args;
      if (!jobSlug) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'jobSlug is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.wellfoundConnector.getJob(jobSlug, includeCompany);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('Wellfound job fetch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleWellfoundGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling wellfound_get_company', { args });
      const { companySlug } = args;
      if (!companySlug) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'companySlug is required', retryable: false } }, null, 2) }] };
      }
      const company = await this.wellfoundConnector.getCompany(companySlug);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: company }, null, 2) }] };
    } catch (error: any) {
      logger.error('Wellfound company fetch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Generic Browser
  // ============================================================================

  private async handleBrowserNavigate(args: any): Promise<any> {
    try {
      logger.info('Handling browser_navigate', { args });
      const { url, waitForSelector, timeout } = args;
      if (!url) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'url is required', retryable: false } }, null, 2) }] };
      }
      await this.genericConnector.navigate(url, { waitForSelector, timeout });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { url, message: 'Navigation successful' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser navigate failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserClick(args: any): Promise<any> {
    try {
      logger.info('Handling browser_click', { args });
      const { selector, waitForNavigation, timeout } = args;
      if (!selector) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selector is required', retryable: false } }, null, 2) }] };
      }
      await this.genericConnector.click(selector, { waitForNavigation, timeout });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { selector, message: 'Click successful' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser click failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserType(args: any): Promise<any> {
    try {
      logger.info('Handling browser_type', { args });
      const { selector, text, delay, clear } = args;
      if (!selector || !text) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selector and text are required', retryable: false } }, null, 2) }] };
      }
      await this.genericConnector.type(selector, text, { delay, clear });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { selector, textLength: text.length, message: 'Type successful' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser type failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserExtract(args: any): Promise<any> {
    try {
      logger.info('Handling browser_extract', { args });
      const { selectors, multiple } = args;
      if (!selectors || typeof selectors !== 'object') {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selectors object is required', retryable: false } }, null, 2) }] };
      }
      const data = await this.genericConnector.extract(selectors, { multiple });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: data }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser extract failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserScreenshot(args: any): Promise<any> {
    try {
      logger.info('Handling browser_screenshot', { args });
      const { fullPage, selector } = args;
      const base64Image = await this.genericConnector.screenshot({ fullPage, selector });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { image: base64Image, format: 'png', encoding: 'base64' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser screenshot failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserPdf(args: any): Promise<any> {
    try {
      logger.info('Handling browser_pdf', { args });
      const { format, landscape } = args;
      const base64Pdf = await this.genericConnector.generatePdf({ format, landscape });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { pdf: base64Pdf, format: format || 'Letter', encoding: 'base64' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser PDF generation failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleBrowserFormFill(args: any): Promise<any> {
    try {
      logger.info('Handling browser_form_fill', { args });
      const { fields, submitSelector, submitWaitForNavigation } = args;
      if (!fields || typeof fields !== 'object') {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'fields object is required', retryable: false } }, null, 2) }] };
      }
      await this.genericConnector.fillForm(fields, { submitSelector, submitWaitForNavigation });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { fieldsCount: Object.keys(fields).length, submitted: !!submitSelector, message: 'Form fill successful' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('Browser form fill failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'An unknown error occurred', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Visual Inspection
  // ============================================================================

  private async handleBrowserScrollCapture(args: any): Promise<any> {
    try {
      logger.info('Handling browser_scroll_capture', { args });
      const result = await this.visualConnector.scrollCapture(args);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('browser_scroll_capture failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'scroll_capture failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleBrowserSelectorCapture(args: any): Promise<any> {
    try {
      logger.info('Handling browser_selector_capture', { args });
      if (!args.selectors || !Array.isArray(args.selectors)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selectors array is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.selectorCapture(args);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('browser_selector_capture failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'selector_capture failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleBrowserComputedStyles(args: any): Promise<any> {
    try {
      logger.info('Handling browser_computed_styles', { args });
      if (!args.selectors || typeof args.selectors !== 'object') {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'selectors object is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.computedStyles(args);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('browser_computed_styles failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'computed_styles failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleBrowserBatchAudit(args: any): Promise<any> {
    try {
      logger.info('Handling browser_batch_audit', { targetCount: args.targets?.length });
      if (!args.targets || !Array.isArray(args.targets) || args.targets.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'targets array is required and must not be empty', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.batchAudit(args);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('browser_batch_audit failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'batch_audit failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleBrowserSessionCleanup(args: any): Promise<any> {
    try {
      logger.info('Handling browser_session_cleanup', { sessionDir: args.sessionDir });
      if (!args.sessionDir) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'sessionDir is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.sessionCleanup(args.sessionDir);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('browser_session_cleanup failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'session_cleanup failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleImageRead(args: any): Promise<any> {
    try {
      logger.info('Handling image_read', { path: args.path });
      if (!args.path) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'path is required', retryable: false } }, null, 2) }] };
      }
      const result = await this.visualConnector.imageRead(args.path);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('image_read failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'image_read failed', retryable: false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Vault Engine
  // ============================================================================

  private async handleVaultSet(args: any): Promise<any> {
    try {
      logger.info('Handling vault_set', { vaultName: args.vaultName, credentialName: args.credentialName });
      await this.vaultEngine.set(args.vaultName, args.credentialName, args.value);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Credential "${args.credentialName}" stored in vault "${args.vaultName}"` }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault set failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to store credential' } }, null, 2) }] };
    }
  }

  private async handleVaultGet(args: any): Promise<any> {
    try {
      logger.info('Handling vault_get', { vaultName: args.vaultName, credentialName: args.credentialName });
      const value = await this.vaultEngine.get(args.vaultName, args.credentialName);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, credentialName: args.credentialName, value }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault get failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to retrieve credential' } }, null, 2) }] };
    }
  }

  private async handleVaultList(args: any): Promise<any> {
    try {
      logger.info('Handling vault_list', { vaultName: args.vaultName });
      const credentials = await this.vaultEngine.list(args.vaultName);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, vaultName: args.vaultName, credentials, count: credentials.length }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault list failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to list credentials' } }, null, 2) }] };
    }
  }

  private async handleVaultDelete(args: any): Promise<any> {
    try {
      logger.info('Handling vault_delete', { vaultName: args.vaultName, credentialName: args.credentialName });
      await this.vaultEngine.delete(args.vaultName, args.credentialName);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Credential "${args.credentialName}" deleted from vault "${args.vaultName}"` }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault delete failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to delete credential' } }, null, 2) }] };
    }
  }

  private async handleVaultDeleteVault(args: any): Promise<any> {
    try {
      logger.info('Handling vault_delete_vault', { vaultName: args.vaultName });
      await this.vaultEngine.deleteVault(args.vaultName);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Vault "${args.vaultName}" and all its credentials permanently deleted` }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault delete vault failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to delete vault' } }, null, 2) }] };
    }
  }

  private async handleVaultListVaults(_args: any): Promise<any> {
    try {
      logger.info('Handling vault_list_vaults');
      const vaults = await this.vaultEngine.listVaults();
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, vaults, count: vaults.length }, null, 2) }] };
    } catch (error: any) {
      logger.error('Vault list vaults failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'VAULT_ERROR', message: error.message || 'Failed to list vaults' } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — File Engine
  // ============================================================================

  private async handleFileCopy(args: any): Promise<any> {
    try {
      logger.info('Handling file_copy', { source: args.source, destination: args.destination });
      await this.fileEngine.local.copy(args.source, args.destination, { recursive: args.recursive || false, overwrite: args.overwrite || false });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Copied successfully', source: args.source, destination: args.destination }, null, 2) }] };
    } catch (error: any) {
      logger.error('File copy failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to copy file' } }, null, 2) }] };
    }
  }

  private async handleFileDelete(args: any): Promise<any> {
    try {
      logger.info('Handling file_delete', { path: args.path });
      await this.fileEngine.local.delete(args.path, args.recursive || false);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Deleted successfully', path: args.path }, null, 2) }] };
    } catch (error: any) {
      logger.error('File delete failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to delete file' } }, null, 2) }] };
    }
  }

  private async handleFileArchiveCreate(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_create', { destination: args.destination });
      await this.fileEngine.archive.create({ sources: args.sources, destination: args.destination, format: args.format || 'zip' });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Archive created successfully', destination: args.destination }, null, 2) }] };
    } catch (error: any) {
      logger.error('File archive create failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to create archive' } }, null, 2) }] };
    }
  }

  private async handleFileArchiveExtract(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_extract', { archive: args.archive });
      await this.fileEngine.archive.extract({ archive: args.archive, destination: args.destination, format: args.format });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Archive extracted successfully', destination: args.destination }, null, 2) }] };
    } catch (error: any) {
      logger.error('File archive extract failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to extract archive' } }, null, 2) }] };
    }
  }

  private async handleFileArchiveList(args: any): Promise<any> {
    try {
      logger.info('Handling file_archive_list', { archive: args.archive });
      const entries = await this.fileEngine.archive.list(args.archive, args.format);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, entries, count: entries.length, archive: args.archive }, null, 2) }] };
    } catch (error: any) {
      logger.error('File archive list failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to list archive' } }, null, 2) }] };
    }
  }

  private async handleFileHash(args: any): Promise<any> {
    try {
      logger.info('Handling file_hash', { path: args.path });
      const hash = await this.fileEngine.hash.hash(args.path, args.algorithm || 'sha256');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, hash, algorithm: args.algorithm || 'sha256', path: args.path }, null, 2) }] };
    } catch (error: any) {
      logger.error('File hash failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || 'FILE_ERROR', message: error.message || 'Failed to calculate hash' } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Parallel Execution Engine
  // ============================================================================

  private async handleParallelExecute(args: any): Promise<any> {
    try {
      logger.info('Handling parallel_execute', { taskCount: args.tasks?.length, config: args.config });
      if (!args.tasks || !Array.isArray(args.tasks) || args.tasks.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'tasks array is required and must not be empty', retryable: false } }, null, 2) }] };
      }
      const result = await this.parallelEngine.execute({ tasks: args.tasks, config: args.config });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('Parallel execution failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'Parallel execution failed', retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleShellBatch(args: any): Promise<any> {
    try {
      logger.info('Handling shell_batch', { commandCount: args.commands?.length });
      if (!args.commands || !Array.isArray(args.commands) || args.commands.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.INVALID_PARAMETERS, message: 'commands array is required and must not be empty', retryable: false } }, null, 2) }] };
      }
      const result = await this.shellEngine.execute({ commands: args.commands, config: args.config });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('shell_batch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'shell_batch failed' } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Tool Registry for Parallel Execution Engine
  // ============================================================================

  private populateToolRegistry(registry: Map<string, (params: Record<string, any>) => Promise<any>>): void {
    const wrapHandler = (handler: (args: any) => Promise<any>) => {
      return async (params: Record<string, any>) => {
        const result = await handler.call(this, params);
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

    registry.set('linkedin_search_jobs', wrapHandler(this.handleLinkedInSearchJobs));
    registry.set('linkedin_get_job', wrapHandler(this.handleLinkedInGetJob));
    registry.set('linkedin_get_company', wrapHandler(this.handleLinkedInGetCompany));
    registry.set('wellfound_search_jobs', wrapHandler(this.handleWellfoundSearchJobs));
    registry.set('wellfound_get_job', wrapHandler(this.handleWellfoundGetJob));
    registry.set('wellfound_get_company', wrapHandler(this.handleWellfoundGetCompany));
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
    registry.set('image_read', wrapHandler(this.handleImageRead));
    registry.set('vault_set', wrapHandler(this.handleVaultSet));
    registry.set('vault_get', wrapHandler(this.handleVaultGet));
    registry.set('vault_delete', wrapHandler(this.handleVaultDelete));
    registry.set('vault_list', wrapHandler(this.handleVaultList));
    registry.set('vault_list_vaults', wrapHandler(this.handleVaultListVaults));
    registry.set('vault_delete_vault', wrapHandler(this.handleVaultDeleteVault));
    registry.set('file_copy', wrapHandler(this.handleFileCopy));
    registry.set('file_delete', wrapHandler(this.handleFileDelete));
    registry.set('file_hash', wrapHandler(this.handleFileHash));
    registry.set('file_archive_create', wrapHandler(this.handleFileArchiveCreate));
    registry.set('file_archive_extract', wrapHandler(this.handleFileArchiveExtract));
    registry.set('file_archive_list', wrapHandler(this.handleFileArchiveList));

    logger.info('Tool registry populated for parallel execution', { toolCount: registry.size });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async connect(transport: StdioServerTransport): Promise<void> {
    await this.server.connect(transport);
    logger.info('Server connected to transport');
  }

  async close(): Promise<void> {
    logger.info('Closing server and cleaning up sessions...');
    await this.sessionManager.closeAllSessions();
    await this.server.close();
    logger.info('Server closed');
  }
}
