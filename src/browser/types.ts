/**
 * Browser Session Types
 * 
 * Type definitions for browser automation, session management,
 * and Puppeteer configuration.
 */

import type { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import type { Platform } from '../types/job.js';

export type { Platform };

/**
 * Browser session state
 */
export type SessionState = 'INITIALIZING' | 'READY' | 'LOGGED_OUT' | 'ERROR' | 'CLOSED';

/**
 * Browser session configuration
 */
export interface BrowserSessionConfig {
  /** Platform this session is for */
  platform: Platform;
  
  /** Whether to run browser in headless mode (default: true) */
  headless?: boolean;
  
  /** User data directory for persistent cookies/storage */
  userDataDir?: string;
  
  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
  
  /** Additional Puppeteer launch options */
  launchOptions?: PuppeteerLaunchOptions;
}

/**
 * Active browser session
 */
export interface BrowserSession {
  /** Platform identifier */
  platform: Platform;
  
  /** Puppeteer browser instance */
  browser: Browser;
  
  /** Active page (tab) */
  page: Page;
  
  /** Current session state */
  state: SessionState;
  
  /** Whether user is logged into the platform */
  isLoggedIn: boolean;
  
  /** Session creation timestamp */
  createdAt: Date;
  
  /** Last activity timestamp */
  lastActivityAt: Date;
  
  /** Configuration used */
  config: BrowserSessionConfig;

  /** Whether this session is connected to an external browser via CDP (don't close browser on cleanup) */
  connectedViaCDP?: boolean;
}

/**
 * Login detection result
 */
export interface LoginDetectionResult {
  /** Whether user is logged in */
  isLoggedIn: boolean;
  
  /** Login detection method used */
  method: 'COOKIE' | 'DOM' | 'URL' | 'MANUAL';
  
  /** Additional context */
  details?: string;
}

/**
 * Browser navigation options
 */
export interface NavigationOptions {
  /** URL to navigate to */
  url: string;
  
  /** Wait for specific selector before considering navigation complete */
  waitForSelector?: string;
  
  /** Wait for network idle (default: true) */
  waitForNetworkIdle?: boolean;
  
  /** Maximum wait time in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Session cleanup result
 */
export interface CleanupResult {
  /** Whether cleanup succeeded */
  success: boolean;
  
  /** Platform that was cleaned up */
  platform: Platform;
  
  /** Any errors encountered */
  error?: Error;
}
