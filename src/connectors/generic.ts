/**
 * Generic Browser Connector
 * 
 * Provides low-level browser automation for any website.
 * Not platform-specific - works with any URL.
 */

import type { Page } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import type { BrowserSessionManager } from '../browser/session.js';
import type { RateLimiter } from '../browser/rate-limiter.js';
import { OktyvErrorCode, type OktyvError } from '../types/mcp.js';

const logger = createLogger('generic-browser');

/**
 * Generic browser connector for universal web automation
 */
export class GenericBrowserConnector {
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;
  private platform: 'GENERIC' = 'GENERIC';

  constructor(sessionManager: BrowserSessionManager, rateLimiter: RateLimiter) {
    this.sessionManager = sessionManager;
    this.rateLimiter = rateLimiter;
    logger.info('GenericBrowserConnector initialized');
  }

  /**
   * Ensure browser session is ready
   */
  async ensureReady(): Promise<void> {
    logger.debug('Checking generic browser session readiness');

    // Get or create session
    await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    logger.info('Generic browser session ready');
  }

  /**
   * Get current page instance
   */
  async getPage(): Promise<Page> {
    await this.ensureReady();
    
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });

    return session.page;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: {
    waitForSelector?: string;
    timeout?: number;
  }): Promise<void> {
    logger.info('Navigating to URL', { url, options });

    // Check rate limit
    await this.rateLimiter.waitForToken(this.platform);

    // Ensure session ready
    await this.ensureReady();

    try {
      await this.sessionManager.navigate(this.platform, {
        url,
        waitForSelector: options?.waitForSelector,
        timeout: options?.timeout || 30000,
      });

      logger.info('Navigation complete', { url });
    } catch (error) {
      logger.error('Navigation failed', { url, error });
      
      throw {
        code: OktyvErrorCode.NAVIGATION_ERROR,
        message: `Failed to navigate to ${url}`,
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Click on an element
   */
  async click(selector: string, options?: {
    waitForNavigation?: boolean;
    timeout?: number;
  }): Promise<void> {
    logger.info('Clicking element', { selector, options });

    const page = await this.getPage();

    try {
      // Wait for element to be visible
      await page.waitForSelector(selector, { 
        visible: true, 
        timeout: options?.timeout || 10000 
      });

      // Click the element
      if (options?.waitForNavigation) {
        await Promise.all([
          page.waitForNavigation({ timeout: options?.timeout || 30000 }),
          page.click(selector),
        ]);
      } else {
        await page.click(selector);
      }

      logger.info('Click complete', { selector });
    } catch (error) {
      logger.error('Click failed', { selector, error });
      
      throw {
        code: OktyvErrorCode.INTERACTION_ERROR,
        message: `Failed to click element: ${selector}`,
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string, options?: {
    delay?: number;
    clear?: boolean;
  }): Promise<void> {
    logger.info('Typing text', { selector, textLength: text.length, options });

    const page = await this.getPage();

    try {
      // Wait for element
      await page.waitForSelector(selector, { visible: true, timeout: 10000 });

      // Clear existing text if requested
      if (options?.clear) {
        await page.click(selector, { clickCount: 3 }); // Select all
        await page.keyboard.press('Backspace');
      }

      // Type the text
      await page.type(selector, text, { delay: options?.delay || 50 });

      logger.info('Type complete', { selector });
    } catch (error) {
      logger.error('Type failed', { selector, error });
      
      throw {
        code: OktyvErrorCode.INTERACTION_ERROR,
        message: `Failed to type into element: ${selector}`,
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Extract data from page using CSS selectors
   */
  async extract(selectors: Record<string, string>, options?: {
    multiple?: boolean;
  }): Promise<Record<string, string | string[]>> {
    logger.info('Extracting data', { selectors, options });

    const page = await this.getPage();

    try {
      const data = await page.evaluate((selectorMap, extractMultiple) => {
        const results: Record<string, string | string[]> = {};

        for (const [key, selector] of Object.entries(selectorMap)) {
          if (extractMultiple) {
            // Extract from all matching elements
            // @ts-expect-error - Running in browser context
            const elements = document.querySelectorAll(selector);
            results[key] = Array.from(elements).map((el: any) => el.textContent?.trim() || '');
          } else {
            // Extract from first matching element
            // @ts-expect-error - Running in browser context
            const element = document.querySelector(selector);
            results[key] = element?.textContent?.trim() || '';
          }
        }

        return results;
      }, selectors, options?.multiple || false);

      logger.info('Extraction complete', { resultKeys: Object.keys(data) });
      return data;
    } catch (error) {
      logger.error('Extraction failed', { error });
      
      throw {
        code: OktyvErrorCode.PARSE_ERROR,
        message: 'Failed to extract data from page',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Take a screenshot of the page
   */
  async screenshot(options?: {
    fullPage?: boolean;
    selector?: string;
  }): Promise<string> {
    logger.info('Taking screenshot', { options });

    const page = await this.getPage();

    try {
      let screenshotBuffer: Buffer;

      if (options?.selector) {
        // Screenshot of specific element
        const element = await page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }
        screenshotBuffer = await element.screenshot({ encoding: 'binary' }) as Buffer;
      } else {
        // Screenshot of whole page
        screenshotBuffer = await page.screenshot({
          fullPage: options?.fullPage || false,
          encoding: 'binary',
        }) as Buffer;
      }

      const base64 = screenshotBuffer.toString('base64');
      logger.info('Screenshot complete', { size: base64.length });
      return base64;
    } catch (error) {
      logger.error('Screenshot failed', { error });
      
      throw {
        code: OktyvErrorCode.SCREENSHOT_ERROR,
        message: 'Failed to capture screenshot',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Generate PDF of the page
   */
  async generatePdf(options?: {
    format?: 'Letter' | 'Legal' | 'A4';
    landscape?: boolean;
  }): Promise<string> {
    logger.info('Generating PDF', { options });

    const page = await this.getPage();

    try {
      const pdfBuffer = await page.pdf({
        format: options?.format || 'Letter',
        landscape: options?.landscape || false,
        printBackground: true,
      });

      const base64 = Buffer.from(pdfBuffer).toString('base64');
      logger.info('PDF generation complete', { size: base64.length });
      return base64;
    } catch (error) {
      logger.error('PDF generation failed', { error });
      
      throw {
        code: OktyvErrorCode.PDF_ERROR,
        message: 'Failed to generate PDF',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Fill a form with provided data
   */
  async fillForm(fields: Record<string, string>, options?: {
    submitSelector?: string;
    submitWaitForNavigation?: boolean;
  }): Promise<void> {
    logger.info('Filling form', { fieldCount: Object.keys(fields).length, options });

    const page = await this.getPage();

    try {
      // Fill each field
      for (const [selector, value] of Object.entries(fields)) {
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        
        // Clear and type
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(selector, value, { delay: 50 });

        logger.debug('Filled field', { selector, valueLength: value.length });
      }

      // Submit if requested
      if (options?.submitSelector) {
        if (options.submitWaitForNavigation) {
          await Promise.all([
            page.waitForNavigation({ timeout: 30000 }),
            page.click(options.submitSelector),
          ]);
        } else {
          await page.click(options.submitSelector);
        }
        logger.info('Form submitted', { submitSelector: options.submitSelector });
      }

      logger.info('Form fill complete');
    } catch (error) {
      logger.error('Form fill failed', { error });
      
      throw {
        code: OktyvErrorCode.INTERACTION_ERROR,
        message: 'Failed to fill form',
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(selector: string, options?: {
    timeout?: number;
    visible?: boolean;
  }): Promise<void> {
    logger.info('Waiting for selector', { selector, options });

    const page = await this.getPage();

    try {
      await page.waitForSelector(selector, {
        visible: options?.visible !== false,
        timeout: options?.timeout || 30000,
      });

      logger.info('Selector found', { selector });
    } catch (error) {
      logger.error('Wait for selector failed', { selector, error });
      
      throw {
        code: OktyvErrorCode.TIMEOUT_ERROR,
        message: `Timeout waiting for selector: ${selector}`,
        details: error,
        retryable: true,
      } as OktyvError;
    }
  }

  /**
   * Execute custom JavaScript on the page
   */
  async evaluate<T>(pageFunction: string, ...args: any[]): Promise<T> {
    logger.info('Executing custom JavaScript');

    const page = await this.getPage();

    try {
      // Create a function from the string
      const fn = new Function('return ' + pageFunction)();
      const result = await page.evaluate(fn, ...args);

      logger.info('JavaScript execution complete');
      return result;
    } catch (error) {
      logger.error('JavaScript execution failed', { error });
      
      throw {
        code: OktyvErrorCode.SCRIPT_ERROR,
        message: 'Failed to execute JavaScript',
        details: error,
        retryable: false,
      } as OktyvError;
    }
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    const page = await this.getPage();
    return page.url();
  }

  /**
   * Check if session is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const session = await this.sessionManager.getSession({
        platform: this.platform,
        headless: true,
      });

      return session.state === 'READY';
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }
}
