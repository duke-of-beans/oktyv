/**
 * Browser Session Manager
 * 
 * Manages Puppeteer browser instances with persistent sessions,
 * login detection, and graceful cleanup.
 */

// LAZY PUPPETEER LOADING — the puppeteer stack (puppeteer, puppeteer-extra, stealth)
// is the single heaviest cold-start cost in the whole server (several seconds to
// require). Loading it eagerly at module-import time pushed the MCP `initialize`
// handshake past Claude Desktop's 60s timeout on cold starts — the real reason Oktyv
// dropped more than any other server. These now load on first browser launch/connect,
// not at process startup, so the handshake stays fast.
let _vanilla: any;
let _extra: any;

async function loadVanilla(): Promise<any> {
  if (!_vanilla) {
    _vanilla = (await import('puppeteer')).default;
  }
  return _vanilla;
}

async function loadExtra(): Promise<any> {
  if (!_extra) {
    // @ts-ignore — puppeteer-extra ships its own types but CJS/ESM interop is fussy
    const puppeteerExtra = (await import('puppeteer-extra')).default;
    // @ts-ignore — same reason
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    // Register stealth plugin (patches navigator.webdriver, canvas/WebGL fingerprint,
    // chrome.runtime, and 15+ other automation tells Cloudflare reads). ONLY applied to
    // bundled Chromium — real Chrome is real, stealth patches there cause more problems.
    puppeteerExtra.use(StealthPlugin());
    _extra = puppeteerExtra;
  }
  return _extra;
}

// Pick the right puppeteer at launch time based on whether we're using real Chrome.
// Bundled Chromium → stealth-wrapped puppeteer. Real Chrome → vanilla puppeteer.
async function getPuppeteer(useRealChrome: boolean): Promise<any> {
  return useRealChrome ? await loadVanilla() : await loadExtra();
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

    // ── CDP Connection Mode ──────────────────────────────────────────────────
    // When OKTYV_REMOTE_DEBUG_PORT is set, connect to the user's running browser
    // instead of launching a new instance. This preserves login sessions, cookies,
    // and all browser state. The user must launch their browser with:
    //   --remote-debugging-port=<port>
    const cdpPort = process.env.OKTYV_REMOTE_DEBUG_PORT;
    if (cdpPort) {
      try {
        logger.info('CDP connection mode — connecting to running browser', { platform, port: cdpPort });

        // Discover WebSocket endpoint from the debug port
        const versionUrl = `http://127.0.0.1:${cdpPort}/json/version`;
        const resp = await fetch(versionUrl);
        if (!resp.ok) throw new Error(`CDP version endpoint returned ${resp.status}`);
        const versionInfo = await resp.json() as { webSocketDebuggerUrl: string };
        const wsEndpoint = versionInfo.webSocketDebuggerUrl;

        if (!wsEndpoint) throw new Error('No webSocketDebuggerUrl in CDP version response');
        logger.debug('CDP WebSocket endpoint discovered', { wsEndpoint });

        // Connect to the running browser — always use vanilla puppeteer (no stealth patches
        // on a real browser the user is already running)
        const vanillaPuppeteer = await loadVanilla();
        const browser = await vanillaPuppeteer.connect({ browserWSEndpoint: wsEndpoint });

        // Create a NEW page for Oktyv's work — never touch the user's existing tabs
        const page = await browser.newPage();

        // Set viewport for consistent rendering
        const browserConfig = getDefaultConfig();
        if (browserConfig.viewport) {
          await page.setViewport(browserConfig.viewport);
        }

        const session: BrowserSession = {
          platform,
          browser,
          page,
          state: 'READY',
          isLoggedIn: true,  // Assume logged in — we're using the user's real session
          createdAt: new Date(),
          lastActivityAt: new Date(),
          config: { ...config },
          connectedViaCDP: true,
        };

        this.sessions.set(platform, session);
        logger.info('CDP session established — using running browser', { platform });
        return session;

      } catch (cdpError) {
        logger.error('CDP connection failed — falling back to launch mode', { platform, cdpError });
        // Fall through to normal launch below
      }
    }

    // ── Launch Mode (default) ────────────────────────────────────────────────
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
      const puppeteer = await getPuppeteer(usingRealChrome);
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
      logger.info('Closing browser session', { platform, cdp: !!session.connectedViaCDP });

      if (session.connectedViaCDP) {
        // CDP mode: close only our page, leave the user's browser running
        await session.page.close();
        // Disconnect from the browser without killing it
        session.browser.disconnect();
      } else {
        // Launch mode: close the entire browser we spawned
        await session.browser.close();
      }
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
