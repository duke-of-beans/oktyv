/**
 * Generic Browser Connector Unit Tests
 * Using Node.js built-in test runner
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GenericBrowserConnector } from '../../../src/connectors/generic.js';
import { Platform } from '../../../src/types/job.js';
import type { BrowserSessionManager } from '../../../src/browser/session.js';
import type { RateLimiter } from '../../../src/browser/rate-limiter.js';
import type { Page } from 'puppeteer';

describe('GenericBrowserConnector', () => {
  let connector: GenericBrowserConnector;
  let mockSessionManager: BrowserSessionManager;
  let mockRateLimiter: RateLimiter;
  let mockPage: Page;

  beforeEach(() => {
    // Create mock page with additional methods for generic browser operations
    mockPage = {
      goto: mock.fn(),
      waitForSelector: mock.fn(async () => true),
      evaluate: mock.fn(),
      $: mock.fn(),
      $$: mock.fn(),
      click: mock.fn(),
      type: mock.fn(),
      keyboard: {
        press: mock.fn(),
      },
      screenshot: mock.fn(async () => Buffer.from('fake-screenshot')),
      pdf: mock.fn(async () => Buffer.from('fake-pdf')),
    } as unknown as Page;

    // Create mock session manager
    mockSessionManager = {
      getSession: mock.fn(async () => ({
        page: mockPage,
        state: 'READY',
        platform: Platform.GENERIC,
      })),
      navigate: mock.fn(async () => undefined),
    } as unknown as BrowserSessionManager;

    // Create mock rate limiter
    mockRateLimiter = {
      waitForToken: mock.fn(async () => undefined),
    } as unknown as RateLimiter;

    // Create connector instance
    connector = new GenericBrowserConnector(mockSessionManager, mockRateLimiter);
  });

  describe('constructor', () => {
    it('should initialize with session manager and rate limiter', () => {
      assert.ok(connector);
      assert.ok(connector instanceof GenericBrowserConnector);
    });
  });

  describe('navigate', () => {
    it('should navigate to URL', async () => {
      await connector.navigate('https://example.com');

      const navigateCalls = (mockSessionManager.navigate as any).mock.calls;
      assert.equal(navigateCalls.length, 1);
      assert.equal(navigateCalls[0].arguments[1].url, 'https://example.com');
    });

    it('should support custom timeout', async () => {
      await connector.navigate('https://example.com', { timeout: 60000 });

      const navigateCalls = (mockSessionManager.navigate as any).mock.calls;
      assert.equal(navigateCalls[0].arguments[1].timeout, 60000);
    });
  });

  describe('click', () => {
    it('should click element by selector', async () => {
      await connector.click('button.submit');

      const clickCalls = (mockPage.click as any).mock.calls;
      assert.equal(clickCalls.length, 1);
      assert.equal(clickCalls[0].arguments[0], 'button.submit');
    });
  });

  describe('type', () => {
    it('should type text into element', async () => {
      await connector.type('input[name="email"]', 'test@example.com');

      const typeCalls = (mockPage.type as any).mock.calls;
      assert.equal(typeCalls.length, 1);
      assert.equal(typeCalls[0].arguments[0], 'input[name="email"]');
      assert.equal(typeCalls[0].arguments[1], 'test@example.com');
    });
  });

  describe('extract', () => {
    it('should extract data using selectors', async () => {
      // Mock page.evaluate to return extracted data
      (mockPage.evaluate as any) = mock.fn(async () => ({
        title: 'Example Page',
        description: 'This is an example',
      }));

      const result = await connector.extract({
        title: 'h1',
        description: '.description',
      });

      assert.deepEqual(result, {
        title: 'Example Page',
        description: 'This is an example',
      });
    });
  });

  describe('screenshot', () => {
    it('should capture screenshot', async () => {
      // Mock screenshot to return base64 string directly (no data URL prefix)
      (mockPage.screenshot as any) = mock.fn(async () => Buffer.from('fake-screenshot-data'));

      const result = await connector.screenshot();

      // Result should be base64 string
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
      const screenshotCalls = (mockPage.screenshot as any).mock.calls;
      assert.equal(screenshotCalls.length, 1);
    });

    it('should capture screenshot of specific element', async () => {
      // Mock element with screenshot method
      const mockElement = {
        screenshot: mock.fn(async () => Buffer.from('fake-element-screenshot')),
      };
      (mockPage.$ as any) = mock.fn(async () => mockElement);

      const result = await connector.screenshot({ selector: '#main-content' });

      assert.ok(typeof result === 'string');
      const dollarCalls = (mockPage.$ as any).mock.calls;
      assert.equal(dollarCalls.length, 1);
      assert.equal(dollarCalls[0].arguments[0], '#main-content');
    });
  });

  describe('generatePdf', () => {
    it('should generate PDF', async () => {
      // Mock pdf to return Buffer
      (mockPage.pdf as any) = mock.fn(async () => Buffer.from('fake-pdf-data'));

      const result = await connector.generatePdf();

      // Result should be base64 string
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
      const pdfCalls = (mockPage.pdf as any).mock.calls;
      assert.equal(pdfCalls.length, 1);
    });

    it('should support custom format', async () => {
      // Mock pdf to return Buffer
      (mockPage.pdf as any) = mock.fn(async () => Buffer.from('fake-pdf-data'));

      await connector.generatePdf({ format: 'A4', landscape: true });

      const pdfCalls = (mockPage.pdf as any).mock.calls;
      assert.equal(pdfCalls[0].arguments[0].format, 'A4');
      assert.equal(pdfCalls[0].arguments[0].landscape, true);
    });
  });

  describe('fillForm', () => {
    it('should fill multiple form fields', async () => {
      const fields = {
        'input[name="username"]': 'testuser',
        'input[name="password"]': 'testpass',
      };

      await connector.fillForm(fields);

      // Verify type was called for each field
      const typeCalls = (mockPage.type as any).mock.calls;
      assert.ok(typeCalls.length >= 2);
    });

    it('should submit form when requested', async () => {
      const fields = {
        'input[name="username"]': 'testuser',
      };

      await connector.fillForm(fields, { submitSelector: 'button[type="submit"]' });

      // Verify click was called for form fields and submit button
      const clickCalls = (mockPage.click as any).mock.calls;
      assert.ok(clickCalls.length >= 1);
      // One of the clicks should be the submit button
      const submitClick = clickCalls.find((call: any) => 
        call.arguments[0] === 'button[type="submit"]'
      );
      assert.ok(submitClick, 'Submit button should have been clicked');
    });
  });
});
