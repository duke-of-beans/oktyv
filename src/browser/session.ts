/**
 * Browser Session Manager
 * 
 * Manages Puppeteer browser instances with persistent sessions,
 * login detection, and graceful cleanup.
 */

// @ts-ignore — puppeteer-extra ships its own types but CJS/ESM interop is fussy
import puppeteerExtra from 'puppeteer-extra';
// @ts-ignore — same reason
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import vanillaPuppeteer from 'puppeteer';

// Register stealth plugin on the extra wrapper. This patches navigator.webdriver,
// canvas fingerprint, WebGL vendor, chrome.runtime, and 15+ other automation tells
// that Cloudflare reads. ONLY applied to bundled Chromium. Real Chrome is real —
// stealth patches there cause more problems than they solve (breaks Chrome's own
// session restore by making the runtime look tampered with).
puppeteerExtra.use(StealthPlugin());

// Pick the right puppeteer at launch time based on whether we're using real Chrome.
// Bundled Chromium → stealth-wrapped puppeteer. Real Chrome → vanilla puppeteer.
function getPuppeteer(useRealChrome: boolean): typeof vanillaPuppeteer {
  return (useRealChrome ? vanillaPuppeteer : (puppeteerExtra as any)) as typeof vanillaPuppeteer;
}
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { retry, progress, config } from '../infrastructure/index.js';
import type {
  Platform,
  BrowserSession,
  BrowserSessionConfig,
  SessionState,
  LoginDetectionResult,
  NavigationOptions,
  CleanupResult,
} from './types.js';

const logger = createLogger('session-manager');

/**
 * Get default browser session configuration from ConfigManager
 */
function getDefaultConfig(): Partial<BrowserSessionConfig> {
  const browserConfig = config.getBrowserConfig();
  return {
    headless: browserConfig.headless,
    viewport: browserConfig.viewport,
  };
}

/**
 * Manages browser sessions with persistent state and login detection
 */
export class BrowserSessionManager {
  private sessions: Map<Platform, BrowserSession>;
  private baseUserDataDir: string;

  constructor(baseUserDataDir: string = process.env.OKTYV_BROWSER_DATA_DIR || 'D:/Dev/oktyv/browser-data') {
    this.sessions = new Map();
    this.baseUserDataDir = baseUserDataDir;
    logger.info('BrowserSessionManager initialized', { baseUserDataDir });
  }

  /**
   * Get or create a browser session for a platform
   */
  async getSession(config: BrowserSessionConfig): Promise<BrowserSession> {
    const { platform } = config;

    // Return existing session if available and ready
    const existing = this.sessions.get(platform);
    if (existing && existing.state === 'READY') {
      logger.debug('Reusing existing session', { platform });
      existing.lastActivityAt = new Date();
      return existing;
    }

    // Close existing session if in error state
    if (existing && existing.state === 'ERROR') {
      logger.warn('Closing session in error state', { platform });
      await this.closeSession(platform);
    }

    // Create new session
    logger.info('Creating new browser session', { platform });
    return await this.createSession(config);
  }

  /**
   * Create a new browser session
   */
  private async createSession(config: BrowserSessionConfig): Promise<BrowserSession> {
    const { platform } = config;
    const userDataDir = config.userDataDir || join(this.baseUserDataDir, platform.toLowerCase());

    try {
      // Ensure user data directory exists
      await mkdir(userDataDir, { recursive: true });

      // Merge with default config
      const finalConfig: BrowserSessionConfig = {
        ...getDefaultConfig(),
        ...config,
        userDataDir,
      };

      logger.debug('Launching browser', { platform, config: finalConfig });

      // Resolve Chrome executable path.
      // Priority: OKTYV_CHROME_EXECUTABLE env var > PUPPETEER_CACHE_DIR > bundled Chromium.
      // Setting OKTYV_CHROME_EXECUTABLE to a real Chrome install bypasses Cloudflare
      // fingerprinting that flags Puppeteer's bundled Chromium. Pair with a dedicated
      // user profile (OKTYV_BROWSER_DATA_DIR) logged in once manually.
      const explicitChrome = process.env.OKTYV_CHROME_EXECUTABLE;
      const cacheDir = process.env.PUPPETEER_CACHE_DIR || process.env.npm_config_cache || '';
      const executablePath = explicitChrome
        || (cacheDir ? `${cacheDir}/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe` : undefined);

      // Launch args and stealth level differ based on browser binary.
      // Real Chrome: ZERO bypass flags. Any flag that triggers the "unsupported command-line
      //   flag" banner makes Chrome treat the session as suspicious and skip auth state
      //   restoration. Just strip the --enable-automation default; that's it.
      // Bundled Chromium: needs the full bypass flag set because it's a sandboxed Puppeteer
      //   build with automation telemetry Cloudflare fingerprints.
      const usingRealChrome = Boolean(explicitChrome);
      const launchArgs = usingRealChrome
        ? []
        : [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--exclude-switches=enable-automation',
            '--disable-features=IsolateOrigins,site-per-process',
          ];

      // Launch browser — pick vanilla puppeteer when using real Chrome (no stealth),
      // stealth-wrapped puppeteer when using bundled Chromium.
      const puppeteer = getPuppeteer(usingRealChrome);
      const browser = await puppeteer.launch({
        headless: finalConfig.headless,
        userDataDir,
        ...(executablePath ? { executablePath } : {}),
        // Strip Puppeteer's default automation flags that Cloudflare fingerprints
        ignoreDefaultArgs: ['--enable-automation'],
        args: launchArgs,
        ...finalConfig.launchOptions,
      });

      // Create new page
      const pages = await browser.pages();
      const page = pages[0] || await browser.newPage();

      // Strip navigator.webdriver — only needed for bundled Chromium. Real Chrome
      // doesn't set it to true in normal user-data-dir launches, so skip the patch
      // there to avoid tampering with a session Chrome already considers real.
      if (!usingRealChrome) {
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
      }

      // Set viewport
      if (finalConfig.viewport) {
        await page.setViewport(finalConfig.viewport);
      }

      // Set user agent to avoid detection — but ONLY when using bundled Chromium.
      // Real Chrome advertises a true, current UA; overriding it with a stale "Chrome/120"
      // is a fingerprint mismatch Cloudflare can flag. Let real Chrome be real.
      if (!usingRealChrome) {
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
      }

      // Create session object
      const session: BrowserSession = {
        platform,
        browser,
        page,
        state: 'READY',
        isLoggedIn: false,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        config: finalConfig,
      };

      this.sessions.set(platform, session);

      logger.info('Browser session created', { platform });
      return session;

    } catch (error) {
      logger.error('Failed to create browser session', { platform, error });
      throw new Error(`Failed to create browser session for ${platform}: ${error}`);
    }
  }

  /**
   * Navigate to a URL and wait for page load
   */
  async navigate(platform: Platform, options: NavigationOptions): Promise<void> {
    const session = this.sessions.get(platform);
    if (!session) {
      throw new Error(`No session found for platform: ${platform}`);
    }

    const {
      url,
      waitForSelector,
      waitForNetworkIdle = true,
      timeout = 30000,
    } = options;

    // Use retry logic for navigation
    await retry.execute(
      async () => {

        let spinnerId: string | undefined;
        try {
          spinnerId = progress.startSpinner(`Navigating to ${url}...`);
          logger.debug('Navigating to URL', { platform, url });

          // Navigate to URL
          await session.page.goto(url, {
            timeout,
            waitUntil: waitForNetworkIdle ? 'networkidle2' : 'load',
          });

          // Wait for specific selector if provided
          if (waitForSelector) {
            progress.updateSpinner(spinnerId, `Waiting for page elements...`);
            logger.debug('Waiting for selector', { platform, selector: waitForSelector });
            await session.page.waitForSelector(waitForSelector, { timeout });
          }

          session.lastActivityAt = new Date();
          progress.succeedSpinner(spinnerId, `Loaded ${url}`);
          logger.info('Navigation complete', { platform, url });

        } catch (error) {
          if (spinnerId) {
            progress.failSpinner(spinnerId, `Failed to load ${url}`);
          }
          logger.error('Navigation failed', { platform, url, error });
          session.state = 'ERROR';
          throw new Error(`Navigation failed for ${platform}: ${error}`);
        }
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        onFailedAttempt: (error) => {
          logger.warn('Navigation retry', { 
            platform, 
            url, 
            attempt: error.attemptNumber, 
            retriesLeft: error.retriesLeft,
            error: error.message 
          });
        },
      }
    );
  }

  /**
   * Detect if user is logged into the platform
   */
  async detectLogin(platform: Platform): Promise<LoginDetectionResult> {
    const session = this.sessions.get(platform);
    if (!session) {
      throw new Error(`No session found for platform: ${platform}`);
    }

    try {
      logger.debug('Detecting login state', { platform });

      // Platform-specific login detection
      let result: LoginDetectionResult;

      switch (platform) {
        case 'LINKEDIN':
          result = await this.detectLinkedInLogin(session);
          break;

        case 'INDEED':
          result = await this.detectIndeedLogin(session);
          break;

        default:
          // Generic detection: check for common auth cookies
          result = await this.detectGenericLogin(session);
          break;
      }

      session.isLoggedIn = result.isLoggedIn;
      session.lastActivityAt = new Date();

      logger.info('Login detection complete', { platform, isLoggedIn: result.isLoggedIn });
      return result;

    } catch (error) {
      logger.error('Login detection failed', { platform, error });
      return {
        isLoggedIn: false,
        method: 'MANUAL',
        details: `Detection failed: ${error}`,
      };
    }
  }

  /**
   * Detect LinkedIn login state
   */
  private async detectLinkedInLogin(session: BrowserSession): Promise<LoginDetectionResult> {
    const cookies = await session.page.cookies();
    
    // LinkedIn uses li_at cookie for authentication
    const hasAuthCookie = cookies.some(cookie => cookie.name === 'li_at');
    
    if (hasAuthCookie) {
      return {
        isLoggedIn: true,
        method: 'COOKIE',
        details: 'li_at cookie found',
      };
    }

    // Check DOM for login indicators
    const currentUrl = session.page.url();
    if (currentUrl.includes('/feed/') || currentUrl.includes('/mynetwork/')) {
      return {
        isLoggedIn: true,
        method: 'URL',
        details: 'On authenticated page',
      };
    }

    return {
      isLoggedIn: false,
      method: 'COOKIE',
      details: 'No auth cookie found',
    };
  }

  /**
   * Detect Indeed login state
   */
  private async detectIndeedLogin(session: BrowserSession): Promise<LoginDetectionResult> {
    const cookies = await session.page.cookies();
    
    // Indeed uses CTK cookie for authentication
    const hasAuthCookie = cookies.some(cookie => cookie.name === 'CTK');
    
    return {
      isLoggedIn: hasAuthCookie,
      method: 'COOKIE',
      details: hasAuthCookie ? 'CTK cookie found' : 'No auth cookie found',
    };
  }

  /**
   * Generic login detection based on common patterns
   */
  private async detectGenericLogin(session: BrowserSession): Promise<LoginDetectionResult> {
    const cookies = await session.page.cookies();
    
    // Look for common auth cookie names
    const authCookiePatterns = ['session', 'auth', 'token', 'sid', 'user'];
    const hasAuthCookie = cookies.some(cookie =>
      authCookiePatterns.some(pattern => cookie.name.toLowerCase().includes(pattern))
    );
    
    return {
      isLoggedIn: hasAuthCookie,
      method: 'COOKIE',
      details: hasAuthCookie ? 'Auth-like cookie found' : 'No auth cookies detected',
    };
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(platform: Platform): Promise<string> {
    const session = this.sessions.get(platform);
    if (!session) {
      throw new Error(`No session found for platform: ${platform}`);
    }
    return session.page.url();
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Platform[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a session exists for a platform
   */
  hasSession(platform: Platform): boolean {
    return this.sessions.has(platform);
  }

  /**
   * Get session state
   */
  getSessionState(platform: Platform): SessionState | null {
    const session = this.sessions.get(platform);
    return session ? session.state : null;
  }

  /**
   * Close a specific session
   */
  async closeSession(platform: Platform): Promise<CleanupResult> {
    const session = this.sessions.get(platform);
    
    if (!session) {
      logger.warn('No session to close', { platform });
      return {
        success: true,
        platform,
      };
    }

    try {
      logger.info('Closing browser session', { platform });
      
      await session.browser.close();
      this.sessions.delete(platform);
      
      logger.info('Browser session closed', { platform });
      return {
        success: true,
        platform,
      };

    } catch (error) {
      logger.error('Failed to close session', { platform, error });
      return {
        success: false,
        platform,
        error: error as Error,
      };
    }
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<CleanupResult[]> {
    logger.info('Closing all browser sessions');
    
    const results: CleanupResult[] = [];
    const platforms = Array.from(this.sessions.keys());
    
    for (const platform of platforms) {
      const result = await this.closeSession(platform);
      results.push(result);
    }
    
    logger.info('All browser sessions closed', { count: results.length });
    return results;
  }
}
