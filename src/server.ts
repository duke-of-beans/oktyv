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
import { ApiEngine } from './tools/api/ApiEngine.js';
import { EmailEngine } from './tools/email/EmailEngine.js';
import { CronEngine } from './tools/cron/CronEngine.js';
import { DatabaseEngine } from './tools/database/DatabaseEngine.js';
import { IndeedConnector } from './connectors/indeed.js';
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
  private apiEngine: ApiEngine;
  private emailEngine: EmailEngine;
  private cronEngine: CronEngine;
  private databaseEngine: DatabaseEngine;
  private indeedConnector: IndeedConnector;
  private parallelEngine: ParallelExecutionEngine;
  private shellEngine: ShellEngine;

  constructor() {
    this.server = new McpServer({
      name: 'oktyv',
      version: '1.6.0',
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

    // Initialize API engine — pass vault bridge functions so OAuthManager can store tokens
    this.apiEngine = new ApiEngine(
      (vaultName: string, key: string) => this.vaultEngine.get(vaultName, key),
      (vaultName: string, key: string, value: string) => this.vaultEngine.set(vaultName, key, value)
    );

    // Initialize email engine
    this.emailEngine = new EmailEngine(
      (vault: string, key: string) => this.vaultEngine.get(vault, key),
      (url: string, options?: any) => this.apiEngine.request(url, options)
    );

    // Initialize cron engine
    this.cronEngine = new CronEngine();

    // Initialize database engine
    this.databaseEngine = new DatabaseEngine(
      (vault: string, key: string) => this.vaultEngine.get(vault, key)
    );

    // Initialize Indeed connector
    this.indeedConnector = new IndeedConnector(this.sessionManager, this.rateLimiter);

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

    // -- API Engine -----------------------------------------------------------

    this.server.tool(
      'api_request',
      'Make an authenticated HTTP request to any API. Reads credentials from vault when vaultName+credentialName provided. Supports GET/POST/PUT/PATCH/DELETE.',
      {
        url: z.string().url().describe('URL to request'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).optional().default('GET'),
        headers: z.record(z.string()).optional().describe('HTTP headers'),
        params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Query parameters'),
        data: z.any().optional().describe('Request body'),
        vaultName: z.string().optional().describe('Vault to pull bearer token from'),
        credentialName: z.string().optional().describe('Credential name in vault'),
        tokenPrefix: z.string().optional().default('Bearer').describe('Token prefix (Bearer, sso-key, etc.)'),
      },
      async (args) => this.handleApiRequest(args),
    );

    this.server.tool(
      'api_oauth_init',
      'Start an OAuth flow — returns the authorization URL for the user to visit. Supports google, github, stripe, slack, zoho.',
      {
        provider: z.enum(['google', 'github', 'stripe', 'slack', 'zoho']).describe('OAuth provider'),
        clientId: z.string().describe('OAuth client ID'),
        redirectUri: z.string().url().describe('Redirect URI'),
        scopes: z.array(z.string()).describe('Scopes to request'),
      },
      async (args) => this.handleApiOAuthInit(args),
    );

    this.server.tool(
      'api_oauth_callback',
      'Complete OAuth flow — exchange authorization code for tokens and store in vault.',
      {
        provider: z.enum(['google', 'github', 'stripe', 'slack', 'zoho']).describe('OAuth provider'),
        clientId: z.string().describe('OAuth client ID'),
        clientSecret: z.string().describe('OAuth client secret'),
        code: z.string().describe('Authorization code from callback'),
        redirectUri: z.string().url().describe('Redirect URI (must match init)'),
        userId: z.string().describe('Identifier to store tokens under (e.g. david)'),
      },
      async (args) => this.handleApiOAuthCallback(args),
    );

    this.server.tool(
      'api_oauth_refresh',
      'Refresh an expired OAuth access token using the stored refresh token.',
      {
        provider: z.enum(['google', 'github', 'stripe', 'slack', 'zoho']).describe('OAuth provider'),
        userId: z.string().describe('User identifier (must match what was used in callback)'),
        clientId: z.string().describe('OAuth client ID'),
        clientSecret: z.string().describe('OAuth client secret'),
      },
      async (args) => this.handleApiOAuthRefresh(args),
    );

    // -- Indeed Connector -------------------------------------------------------

    this.server.tool('indeed_search_jobs', 'Search for jobs on Indeed with keyword and location filters', {
      keywords: z.string().optional().describe('Job title, skills, or keywords'),
      location: z.string().optional().describe('City, state, or country'),
      remote: z.boolean().optional().describe('Filter for remote positions'),
      limit: z.number().min(1).max(50).optional().describe('Maximum results (default: 10)'),
    }, async (args) => this.handleIndeedSearchJobs(args));

    this.server.tool('indeed_get_job', 'Get full job details from Indeed by job key', {
      jobKey: z.string().describe('Indeed job key (jk= param from search results)'),
      includeCompany: z.boolean().optional().describe('Also fetch company details (default: false)'),
    }, async (args) => this.handleIndeedGetJob(args));

    this.server.tool('indeed_get_company', 'Get company profile from Indeed', {
      companyId: z.string().describe('Indeed company ID or slug'),
    }, async (args) => this.handleIndeedGetCompany(args));

    // -- Email Engine -----------------------------------------------------------

    this.server.tool('email_smtp_connect', 'Connect to SMTP server for sending email. Credentials from vault or direct.', {
      connectionId: z.string().describe('Unique identifier for this connection'),
      host: z.string().describe('SMTP server host (e.g. smtp.resend.com)'),
      port: z.number().describe('SMTP port (465 for SSL, 587 for TLS)'),
      secure: z.boolean().describe('Use SSL (true for port 465)'),
      vaultName: z.string().optional().describe('Vault name for credentials'),
      credentialName: z.string().optional().describe('Credential in vault (format: username:password)'),
      username: z.string().optional().describe('SMTP username (alternative to vault)'),
      password: z.string().optional().describe('SMTP password (alternative to vault)'),
    }, async (args) => this.handleEmailSmtpConnect(args));

    this.server.tool('email_smtp_send', 'Send email via connected SMTP server', {
      connectionId: z.string().describe('SMTP connection identifier'),
      from: z.string().email().describe('Sender email address'),
      to: z.array(z.string().email()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      text: z.string().optional().describe('Plain text body'),
      html: z.string().optional().describe('HTML body'),
      cc: z.array(z.string().email()).optional().describe('CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
      replyTo: z.string().email().optional().describe('Reply-To address'),
    }, async (args) => this.handleEmailSmtpSend(args));

    this.server.tool('email_imap_connect', 'Connect to IMAP server for reading email', {
      connectionId: z.string().describe('Unique identifier for this connection'),
      host: z.string().describe('IMAP server host (e.g. imap.gmail.com)'),
      port: z.number().describe('IMAP port (993 for SSL, 143 for TLS)'),
      secure: z.boolean().describe('Use SSL (true for port 993)'),
      vaultName: z.string().optional().describe('Vault name for credentials'),
      credentialName: z.string().optional().describe('Credential in vault (format: username:password)'),
      username: z.string().optional().describe('IMAP username (alternative to vault)'),
      password: z.string().optional().describe('IMAP password (alternative to vault)'),
    }, async (args) => this.handleEmailImapConnect(args));

    this.server.tool('email_imap_fetch', 'Fetch emails from IMAP server with optional filtering', {
      connectionId: z.string().describe('IMAP connection identifier'),
      folder: z.string().optional().describe('Mailbox folder (default: INBOX)'),
      criteria: z.array(z.string()).optional().describe('Search criteria e.g. ["UNSEEN"] or ["FROM", "example@email.com"]'),
      limit: z.number().optional().describe('Max emails to fetch (default: 10)'),
      markSeen: z.boolean().optional().describe('Mark as seen after fetching (default: false)'),
    }, async (args) => this.handleEmailImapFetch(args));

    this.server.tool('email_gmail_send', 'Send email via Gmail API (requires OAuth token in vault)', {
      userId: z.string().describe('Gmail user email address'),
      to: z.array(z.string().email()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (plain text or HTML)'),
      html: z.boolean().optional().describe('Whether body is HTML (default: false)'),
      cc: z.array(z.string().email()).optional().describe('CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
    }, async (args) => this.handleEmailGmailSend(args));

    this.server.tool('email_gmail_read', 'List and read emails from Gmail using search query', {
      userId: z.string().describe('Gmail user email address'),
      query: z.string().optional().describe('Gmail search query (e.g. "is:unread", "from:someone@example.com")'),
      maxResults: z.number().optional().describe('Max results (default: 10)'),
    }, async (args) => this.handleEmailGmailRead(args));

    this.server.tool('email_gmail_search', 'Search Gmail messages with advanced query syntax', {
      userId: z.string().describe('Gmail user email address'),
      query: z.string().describe('Gmail search query (e.g. "subject:invoice after:2025/01/01")'),
      maxResults: z.number().optional().describe('Max results (default: 10)'),
    }, async (args) => this.handleEmailGmailSearch(args));

    this.server.tool('email_parse', 'Parse a raw MIME email message and extract content', {
      raw: z.string().describe('Raw email message in MIME format'),
      includeAttachments: z.boolean().optional().describe('Extract attachments (default: true)'),
    }, async (args) => this.handleEmailParse(args));

    // -- Cron Engine ------------------------------------------------------------

    this.server.tool('cron_create_task', 'Create a scheduled task with cron expression, interval, or one-time execution', {
      name: z.string().describe('Task name'),
      description: z.string().optional().describe('Task description'),
      scheduleType: z.enum(['cron', 'interval', 'once']).describe('Schedule type'),
      cronExpression: z.string().optional().describe('Cron expression e.g. "0 9 * * *" for 9 AM daily'),
      interval: z.number().optional().describe('Interval in milliseconds (for interval type)'),
      executeAt: z.string().optional().describe('ISO datetime for one-time execution'),
      actionType: z.enum(['http', 'webhook', 'file', 'database', 'email']).describe('Action type to execute'),
      actionConfig: z.record(z.any()).describe('Action-specific configuration'),
      timezone: z.string().optional().describe('Timezone (default: UTC)'),
      retryCount: z.number().optional().describe('Retries on failure (default: 0)'),
      timeout: z.number().optional().describe('Execution timeout ms (default: 30000)'),
      enabled: z.boolean().optional().describe('Enable immediately (default: true)'),
    }, async (args) => this.handleCronCreateTask(args));

    this.server.tool('cron_list_tasks', 'List all scheduled tasks with optional filters', {
      enabled: z.boolean().optional().describe('Filter by enabled status'),
      scheduleType: z.enum(['cron', 'interval', 'once']).optional().describe('Filter by schedule type'),
      limit: z.number().optional().describe('Max results (default: 50)'),
    }, async (args) => this.handleCronListTasks(args));

    this.server.tool('cron_get_task', 'Get details of a specific scheduled task', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronGetTask(args));

    this.server.tool('cron_enable_task', 'Enable a scheduled task', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronEnableTask(args));

    this.server.tool('cron_disable_task', 'Disable a scheduled task', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronDisableTask(args));

    this.server.tool('cron_delete_task', 'Delete a scheduled task permanently', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronDeleteTask(args));

    this.server.tool('cron_execute_now', 'Execute a task immediately, ignoring its schedule', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronExecuteNow(args));

    this.server.tool('cron_update_task', 'Update an existing scheduled task', {
      taskId: z.string().describe('Task ID'),
      name: z.string().optional().describe('New name'),
      cronExpression: z.string().optional().describe('New cron expression'),
      interval: z.number().optional().describe('New interval ms'),
      actionConfig: z.record(z.any()).optional().describe('New action config'),
      timezone: z.string().optional().describe('New timezone'),
      timeout: z.number().optional().describe('New timeout ms'),
    }, async (args) => this.handleCronUpdateTask(args));

    this.server.tool('cron_get_history', 'Get execution history for a task', {
      taskId: z.string().describe('Task ID'),
      limit: z.number().optional().describe('Max results (default: 50)'),
    }, async (args) => this.handleCronGetHistory(args));

    this.server.tool('cron_get_statistics', 'Get execution statistics for a task', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronGetStatistics(args));

    this.server.tool('cron_clear_history', 'Clear execution history for a task', {
      taskId: z.string().describe('Task ID'),
    }, async (args) => this.handleCronClearHistory(args));

    this.server.tool('cron_validate_expression', 'Validate a cron expression and get next run times', {
      expression: z.string().describe('Cron expression to validate'),
      timezone: z.string().optional().describe('Timezone for next run calculation'),
    }, async (args) => this.handleCronValidateExpression(args));

    // -- Database Engine --------------------------------------------------------

    this.server.tool('db_connect', 'Connect to a database (PostgreSQL, MySQL, SQLite, MongoDB). Credentials from vault or direct connection string.', {
      connectionId: z.string().describe('Unique identifier for this connection'),
      type: z.enum(['postgresql', 'mysql', 'sqlite', 'mongodb']).describe('Database type'),
      vaultName: z.string().optional().describe('Vault name containing connection string'),
      credentialName: z.string().optional().describe('Credential name in vault'),
      connectionString: z.string().optional().describe('Direct connection string (alternative to vault)'),
      poolSize: z.number().optional().describe('Connection pool size (default: 10)'),
    }, async (args) => this.handleDbConnect(args));

    this.server.tool('db_query', 'Query records from a table or collection', {
      connectionId: z.string().describe('Connection identifier'),
      table: z.string().describe('Table name (SQL) or collection name (MongoDB)'),
      where: z.record(z.any()).optional().describe('Filter conditions'),
      select: z.array(z.string()).optional().describe('Columns to select (SQL only)'),
      orderBy: z.record(z.enum(['asc', 'desc'])).optional().describe('Sort order'),
      limit: z.number().optional().describe('Max records to return'),
      offset: z.number().optional().describe('Records to skip'),
    }, async (args) => this.handleDbQuery(args));

    this.server.tool('db_insert', 'Insert one or more records into a table or collection', {
      connectionId: z.string().describe('Connection identifier'),
      table: z.string().describe('Table or collection name'),
      data: z.union([z.record(z.any()), z.array(z.record(z.any()))]).describe('Record(s) to insert'),
    }, async (args) => this.handleDbInsert(args));

    this.server.tool('db_update', 'Update records matching the WHERE clause', {
      connectionId: z.string().describe('Connection identifier'),
      table: z.string().describe('Table or collection name'),
      where: z.record(z.any()).describe('Filter conditions (required)'),
      data: z.record(z.any()).describe('Data to update'),
    }, async (args) => this.handleDbUpdate(args));

    this.server.tool('db_delete', 'Delete records matching the WHERE clause', {
      connectionId: z.string().describe('Connection identifier'),
      table: z.string().describe('Table or collection name'),
      where: z.record(z.any()).describe('Filter conditions (required for safety)'),
    }, async (args) => this.handleDbDelete(args));

    this.server.tool('db_raw_query', 'Execute raw SQL with parameter binding (SQL databases only)', {
      connectionId: z.string().describe('Connection identifier'),
      query: z.string().describe('SQL query with $1, $2 placeholders'),
      params: z.array(z.any()).optional().describe('Query parameters'),
    }, async (args) => this.handleDbRawQuery(args));

    this.server.tool('db_aggregate', 'Execute MongoDB aggregation pipeline (MongoDB only)', {
      connectionId: z.string().describe('Connection identifier'),
      collection: z.string().describe('Collection name'),
      pipeline: z.array(z.record(z.any())).describe('Aggregation pipeline stages'),
    }, async (args) => this.handleDbAggregate(args));

    this.server.tool('db_disconnect', 'Disconnect and close a database connection', {
      connectionId: z.string().describe('Connection identifier'),
    }, async (args) => this.handleDbDisconnect(args));

    this.server.tool('db_transaction', 'Execute multiple operations in an ACID transaction with automatic deadlock retry', {
      connectionId: z.string().describe('Connection identifier'),
      operations: z.array(z.object({
        type: z.enum(['insert', 'update', 'delete', 'query']).describe('Operation type'),
        table: z.string().describe('Table or collection name'),
        data: z.record(z.any()).optional().describe('Data for insert/update'),
        where: z.record(z.any()).optional().describe('Filter for update/delete/query'),
        select: z.array(z.string()).optional().describe('Columns to select (query only)'),
        limit: z.number().optional().describe('Limit results (query only)'),
      })).describe('Operations to execute in transaction'),
      maxRetries: z.number().optional().describe('Max retries on deadlock (default: 3)'),
      timeout: z.number().optional().describe('Transaction timeout ms (default: 30000)'),
    }, async (args) => this.handleDbTransaction(args));

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
  // Handler Methods — API Engine
  // ============================================================================

  private async handleApiRequest(args: any): Promise<any> {
    try {
      logger.info('Handling api_request', { url: args.url, method: args.method });
      const headers: Record<string, string> = { ...(args.headers || {}) };
      if (args.vaultName && args.credentialName) {
        const token = await this.vaultEngine.get(args.vaultName, args.credentialName);
        const prefix = args.tokenPrefix || 'Bearer';
        headers['Authorization'] = `${prefix} ${token}`;
      }
      const result = await this.apiEngine.request(args.url, {
        method: args.method || 'GET',
        headers,
        params: args.params,
        data: args.data,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('api_request failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'api_request failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleApiOAuthInit(args: any): Promise<any> {
    try {
      logger.info('Handling api_oauth_init', { provider: args.provider });
      const oauth = this.apiEngine.getOAuthManager();
      const result = await oauth.buildAuthUrl(args.provider, args.clientId, args.redirectUri, args.scopes);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('api_oauth_init failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'api_oauth_init failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleApiOAuthCallback(args: any): Promise<any> {
    try {
      logger.info('Handling api_oauth_callback', { provider: args.provider, userId: args.userId });
      const oauth = this.apiEngine.getOAuthManager();
      const tokens = await oauth.exchangeCodeForTokens(
        args.provider, args.clientId, args.clientSecret, args.code, args.redirectUri
      );
      await oauth.storeTokens(args.provider, args.userId, tokens);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { stored: true, provider: args.provider, userId: args.userId, expiresAt: tokens.expires_at } }, null, 2) }] };
    } catch (error: any) {
      logger.error('api_oauth_callback failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'api_oauth_callback failed', retryable: false } }, null, 2) }] };
    }
  }

  private async handleApiOAuthRefresh(args: any): Promise<any> {
    try {
      logger.info('Handling api_oauth_refresh', { provider: args.provider, userId: args.userId });
      const oauth = this.apiEngine.getOAuthManager();
      const existing = await oauth.getTokens(args.provider, args.userId);
      if (!existing?.refresh_token) throw new Error('No refresh token found — re-authorize the OAuth flow');
      const tokens = await oauth.refreshTokens(args.provider, args.clientId, args.clientSecret, existing.refresh_token);
      await oauth.storeTokens(args.provider, args.userId, tokens);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { refreshed: true, provider: args.provider, userId: args.userId, expiresAt: tokens.expires_at } }, null, 2) }] };
    } catch (error: any) {
      logger.error('api_oauth_refresh failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message || 'api_oauth_refresh failed', retryable: false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Indeed Connector
  // ============================================================================

  private async handleIndeedSearchJobs(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_search_jobs', { args });
      const params = { keywords: args.keywords, location: args.location, remote: args.remote, limit: args.limit || 10 };
      const jobs = await this.indeedConnector.searchJobs(params);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { jobs, totalCount: jobs.length, platform: 'INDEED' } }, null, 2) }] };
    } catch (error: any) {
      logger.error('indeed_search_jobs failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message, retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleIndeedGetJob(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_get_job', { jobKey: args.jobKey });
      const result = await this.indeedConnector.getJob(args.jobKey, args.includeCompany || false);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('indeed_get_job failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message, retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  private async handleIndeedGetCompany(args: any): Promise<any> {
    try {
      logger.info('Handling indeed_get_company', { companyId: args.companyId });
      const result = await this.indeedConnector.getCompany(args.companyId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('indeed_get_company failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: error.code || OktyvErrorCode.UNKNOWN_ERROR, message: error.message, retryable: error.retryable !== false } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Email Engine
  // ============================================================================

  private async handleEmailSmtpConnect(args: any): Promise<any> {
    try {
      logger.info('Handling email_smtp_connect', { connectionId: args.connectionId, host: args.host });
      await this.emailEngine.smtpConnect({ connectionId: args.connectionId, host: args.host, port: args.port, secure: args.secure, vaultName: args.vaultName, credentialName: args.credentialName, username: args.username, password: args.password });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `SMTP connected: ${args.connectionId}` }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_smtp_connect failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailSmtpSend(args: any): Promise<any> {
    try {
      logger.info('Handling email_smtp_send', { connectionId: args.connectionId, to: args.to });
      const messageId = await this.emailEngine.smtpSend(args.connectionId, { from: args.from, to: args.to, subject: args.subject, text: args.text, html: args.html, cc: args.cc, bcc: args.bcc, replyTo: args.replyTo });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { messageId } }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_smtp_send failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailImapConnect(args: any): Promise<any> {
    try {
      logger.info('Handling email_imap_connect', { connectionId: args.connectionId, host: args.host });
      await this.emailEngine.imapConnect({ connectionId: args.connectionId, host: args.host, port: args.port, secure: args.secure, vaultName: args.vaultName, credentialName: args.credentialName, username: args.username, password: args.password });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `IMAP connected: ${args.connectionId}` }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_imap_connect failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailImapFetch(args: any): Promise<any> {
    try {
      logger.info('Handling email_imap_fetch', { connectionId: args.connectionId });
      const emails = await this.emailEngine.imapFetch(args.connectionId, { folder: args.folder, criteria: args.criteria, limit: args.limit, markSeen: args.markSeen });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { emails, count: emails.length } }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_imap_fetch failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailGmailSend(args: any): Promise<any> {
    try {
      logger.info('Handling email_gmail_send', { userId: args.userId });
      const messageId = await this.emailEngine.gmailSend(args.userId, { to: args.to, subject: args.subject, body: args.body, html: args.html, cc: args.cc, bcc: args.bcc });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { messageId } }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_gmail_send failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailGmailRead(args: any): Promise<any> {
    try {
      logger.info('Handling email_gmail_read', { userId: args.userId });
      const result = await this.emailEngine.gmailList(args.userId, { query: args.query, maxResults: args.maxResults });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_gmail_read failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailGmailSearch(args: any): Promise<any> {
    try {
      logger.info('Handling email_gmail_search', { userId: args.userId, query: args.query });
      const result = await this.emailEngine.gmailSearch(args.userId, args.query, args.maxResults);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_gmail_search failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleEmailParse(args: any): Promise<any> {
    try {
      logger.info('Handling email_parse');
      const result = await this.emailEngine.parseEmail(args.raw, { extractAttachments: args.includeAttachments, maxAttachmentSize: args.maxAttachmentSize });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('email_parse failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Cron Engine
  // ============================================================================

  private async handleCronCreateTask(args: any): Promise<any> {
    try {
      logger.info('Handling cron_create_task', { name: args.name });
      const task = this.cronEngine.createTask({ name: args.name, description: args.description, schedule: { type: args.scheduleType, expression: args.cronExpression, interval: args.interval, executeAt: args.executeAt ? new Date(args.executeAt) : undefined }, action: { type: args.actionType, config: args.actionConfig || {} }, options: { timezone: args.timezone, retryCount: args.retryCount, timeout: args.timeout, enabled: args.enabled } });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: task }, null, 2) }] };
    } catch (error: any) {
      logger.error('cron_create_task failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronListTasks(args: any): Promise<any> {
    try {
      logger.info('Handling cron_list_tasks');
      const tasks = this.cronEngine.taskManager.listTasks({ enabled: args.enabled, scheduleType: args.scheduleType, limit: args.limit });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { tasks, count: tasks.length } }, null, 2) }] };
    } catch (error: any) {
      logger.error('cron_list_tasks failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronGetTask(args: any): Promise<any> {
    try {
      const task = this.cronEngine.taskManager.getTask(args.taskId);
      if (!task) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { message: `Task not found: ${args.taskId}` } }, null, 2) }] };
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: task }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronEnableTask(args: any): Promise<any> {
    try {
      this.cronEngine.enableTask(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Task ${args.taskId} enabled` }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronDisableTask(args: any): Promise<any> {
    try {
      this.cronEngine.disableTask(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Task ${args.taskId} disabled` }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronDeleteTask(args: any): Promise<any> {
    try {
      this.cronEngine.deleteTask(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Task ${args.taskId} deleted` }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronExecuteNow(args: any): Promise<any> {
    try {
      await this.cronEngine.executeNow(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Task ${args.taskId} executed` }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronUpdateTask(args: any): Promise<any> {
    try {
      const task = this.cronEngine.updateTask(args.taskId, { name: args.name, schedule: { type: args.scheduleType || 'cron', expression: args.cronExpression, interval: args.interval }, action: args.actionConfig ? { type: args.actionType || 'http', config: args.actionConfig } : undefined, options: { timezone: args.timezone, timeout: args.timeout } });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: task }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronGetHistory(args: any): Promise<any> {
    try {
      const history = this.cronEngine.history.getHistory(args.taskId, args.limit);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { history, count: history.length } }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronGetStatistics(args: any): Promise<any> {
    try {
      const stats = this.cronEngine.history.getStatistics(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: stats }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronClearHistory(args: any): Promise<any> {
    try {
      this.cronEngine.history.clearHistory(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `History cleared for task ${args.taskId}` }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleCronValidateExpression(args: any): Promise<any> {
    try {
      const valid = this.cronEngine.scheduler.validate(args.expression);
      const nextRun = valid ? this.cronEngine.scheduler.getNextRun(args.expression, args.timezone) : null;
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { valid, nextRun, expression: args.expression } }, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  // ============================================================================
  // Handler Methods — Database Engine
  // ============================================================================

  private async handleDbConnect(args: any): Promise<any> {
    try {
      logger.info('Handling db_connect', { connectionId: args.connectionId, type: args.type });
      await this.databaseEngine.connect({ connectionId: args.connectionId, type: args.type, vaultName: args.vaultName, credentialName: args.credentialName, connectionString: args.connectionString, poolSize: args.poolSize });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Connected: ${args.connectionId} (${args.type})` }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_connect failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbQuery(args: any): Promise<any> {
    try {
      logger.info('Handling db_query', { connectionId: args.connectionId, table: args.table });
      const results = await this.databaseEngine.query(args.connectionId, args.table, { where: args.where, select: args.select, orderBy: args.orderBy, limit: args.limit, offset: args.offset });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { rows: results, count: results.length } }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_query failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbInsert(args: any): Promise<any> {
    try {
      logger.info('Handling db_insert', { connectionId: args.connectionId, table: args.table });
      const result = await this.databaseEngine.insert(args.connectionId, args.table, { data: args.data });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_insert failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbUpdate(args: any): Promise<any> {
    try {
      logger.info('Handling db_update', { connectionId: args.connectionId, table: args.table });
      const count = await this.databaseEngine.update(args.connectionId, args.table, { where: args.where, data: args.data });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { updatedCount: count } }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_update failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbDelete(args: any): Promise<any> {
    try {
      logger.info('Handling db_delete', { connectionId: args.connectionId, table: args.table });
      const count = await this.databaseEngine.delete(args.connectionId, args.table, { where: args.where });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { deletedCount: count } }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_delete failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbRawQuery(args: any): Promise<any> {
    try {
      logger.info('Handling db_raw_query', { connectionId: args.connectionId });
      const result = await this.databaseEngine.rawQuery(args.connectionId, args.query, args.params || []);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_raw_query failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbAggregate(args: any): Promise<any> {
    try {
      logger.info('Handling db_aggregate', { connectionId: args.connectionId, collection: args.collection });
      const result = await this.databaseEngine.aggregate(args.connectionId, args.collection, args.pipeline);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: { rows: result, count: result.length } }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_aggregate failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbDisconnect(args: any): Promise<any> {
    try {
      logger.info('Handling db_disconnect', { connectionId: args.connectionId });
      await this.databaseEngine.disconnect(args.connectionId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Disconnected: ${args.connectionId}` }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_disconnect failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
    }
  }

  private async handleDbTransaction(args: any): Promise<any> {
    try {
      logger.info('Handling db_transaction', { connectionId: args.connectionId, operations: args.operations?.length });
      const result = await this.databaseEngine.transaction(args.connectionId, args.operations, { maxRetries: args.maxRetries, timeout: args.timeout });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }, null, 2) }] };
    } catch (error: any) {
      logger.error('db_transaction failed', { error });
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: OktyvErrorCode.UNKNOWN_ERROR, message: error.message } }, null, 2) }] };
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
    registry.set('api_request', wrapHandler(this.handleApiRequest));
    registry.set('api_oauth_init', wrapHandler(this.handleApiOAuthInit));
    registry.set('api_oauth_callback', wrapHandler(this.handleApiOAuthCallback));
    registry.set('api_oauth_refresh', wrapHandler(this.handleApiOAuthRefresh));
    registry.set('indeed_search_jobs', wrapHandler(this.handleIndeedSearchJobs));
    registry.set('indeed_get_job', wrapHandler(this.handleIndeedGetJob));
    registry.set('indeed_get_company', wrapHandler(this.handleIndeedGetCompany));
    registry.set('email_smtp_connect', wrapHandler(this.handleEmailSmtpConnect));
    registry.set('email_smtp_send', wrapHandler(this.handleEmailSmtpSend));
    registry.set('email_imap_connect', wrapHandler(this.handleEmailImapConnect));
    registry.set('email_imap_fetch', wrapHandler(this.handleEmailImapFetch));
    registry.set('email_gmail_send', wrapHandler(this.handleEmailGmailSend));
    registry.set('email_gmail_read', wrapHandler(this.handleEmailGmailRead));
    registry.set('email_gmail_search', wrapHandler(this.handleEmailGmailSearch));
    registry.set('email_parse', wrapHandler(this.handleEmailParse));
    registry.set('cron_create_task', wrapHandler(this.handleCronCreateTask));
    registry.set('cron_list_tasks', wrapHandler(this.handleCronListTasks));
    registry.set('cron_get_task', wrapHandler(this.handleCronGetTask));
    registry.set('cron_enable_task', wrapHandler(this.handleCronEnableTask));
    registry.set('cron_disable_task', wrapHandler(this.handleCronDisableTask));
    registry.set('cron_delete_task', wrapHandler(this.handleCronDeleteTask));
    registry.set('cron_execute_now', wrapHandler(this.handleCronExecuteNow));
    registry.set('cron_update_task', wrapHandler(this.handleCronUpdateTask));
    registry.set('cron_get_history', wrapHandler(this.handleCronGetHistory));
    registry.set('cron_get_statistics', wrapHandler(this.handleCronGetStatistics));
    registry.set('cron_clear_history', wrapHandler(this.handleCronClearHistory));
    registry.set('cron_validate_expression', wrapHandler(this.handleCronValidateExpression));
    registry.set('db_connect', wrapHandler(this.handleDbConnect));
    registry.set('db_query', wrapHandler(this.handleDbQuery));
    registry.set('db_insert', wrapHandler(this.handleDbInsert));
    registry.set('db_update', wrapHandler(this.handleDbUpdate));
    registry.set('db_delete', wrapHandler(this.handleDbDelete));
    registry.set('db_raw_query', wrapHandler(this.handleDbRawQuery));
    registry.set('db_aggregate', wrapHandler(this.handleDbAggregate));
    registry.set('db_disconnect', wrapHandler(this.handleDbDisconnect));
    registry.set('db_transaction', wrapHandler(this.handleDbTransaction));

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
