/**
 * Visual Inspection Connector
 *
 * Provides automated visual QA tools for any web project in the portfolio.
 * Generalized — zero project-specific logic. All project config stays outside.
 *
 * DESIGN PRINCIPLES (non-negotiable):
 * 1. Screenshots ALWAYS temporary — D:/Dev/oktyv/screenshots/temp/{session-id}/ only
 * 2. NEVER write to C:\ under any circumstances
 * 3. cleanup: true is the DEFAULT on every capture tool
 * 4. Parallel within hardware limits (default maxConcurrent: 3)
 * 5. Computed styles = pure data, zero disk I/O
 * 6. Generalized — no project-specific logic in the engine
 */

import { join } from 'path';
import { mkdir, readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { extname } from 'path';
import { createLogger } from '../utils/logger.js';
import type { BrowserSessionManager } from '../browser/session.js';
import type { RateLimiter } from '../browser/rate-limiter.js';
import { Platform } from '../types/job.js';
import {
  createTempSession,
  cleanupSession,
} from '../browser/session-manager.js';
import type { Page, Browser } from 'puppeteer';

const logger = createLogger('visual-inspection');

// ─────────────────────────────────────────────
// Types — Track B (scroll_capture)
// ─────────────────────────────────────────────

export interface ScrollCaptureOptions {
  url?: string;
  outputDir?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  overlap?: number;
  waitAfterScroll?: number;
  cleanup?: boolean;
}

export interface ScrollCaptureResult {
  sessionId: string;
  outputDir: string;
  pageUrl: string;
  totalHeight: number;
  captures: Array<{ index: number; path: string; scrollY: number; height: number }>;
  cleaned: boolean;
}

// ─────────────────────────────────────────────
// Types — Track C (selector_capture)
// ─────────────────────────────────────────────

export interface SelectorCaptureOptions {
  selectors: string[];
  url?: string;
  outputDir?: string;
  padding?: number;
  cleanup?: boolean;
}

export interface SelectorCaptureResult {
  sessionId: string;
  outputDir: string;
  pageUrl: string;
  captures: Array<{
    selector: string;
    path: string | null;
    found: boolean;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    error?: string;
  }>;
  cleaned: boolean;
}

// ─────────────────────────────────────────────
// Types — Track D (computed_styles)
// ─────────────────────────────────────────────

export interface ComputedStylesOptions {
  selectors: Record<string, {
    selector: string;
    properties: string[];
    multiple?: boolean;
  }>;
  url?: string;
}

export interface ComputedStylesResult {
  pageUrl: string;
  results: Record<string, {
    selector: string;
    found: boolean;
    elementCount: number;
    styles: Array<{
      index: number;
      properties: Record<string, string>;
    }>;
  }>;
}

// ─────────────────────────────────────────────
// Types — Track E (batch_audit)
// ─────────────────────────────────────────────

export interface BatchAuditTarget {
  url: string;
  label: string;
  captureMode: 'scroll' | 'selector' | 'styles' | 'scroll+styles' | 'selector+styles';
  selectors?: string[];
  styleSelectors?: Record<string, { selector: string; properties: string[] }>;
  scrollOptions?: Partial<ScrollCaptureOptions>;
}

export interface BatchAuditOptions {
  targets: BatchAuditTarget[];
  maxConcurrent?: number;
  outputDir?: string;
  cleanup?: boolean;
}

export interface BatchAuditResult {
  sessionId: string;
  outputDir: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  };
  results: Array<{
    url: string;
    label: string;
    success: boolean;
    scrollCaptures?: ScrollCaptureResult;
    selectorCaptures?: SelectorCaptureResult;
    computedStyles?: ComputedStylesResult;
    error?: string;
    durationMs: number;
  }>;
  cleaned: boolean;
}

// ─────────────────────────────────────────────
// Connector class
// ─────────────────────────────────────────────

export class VisualInspectionConnector {
  private sessionManager: BrowserSessionManager;
  private platform = Platform.GENERIC;

  constructor(sessionManager: BrowserSessionManager, _rateLimiter: RateLimiter) {
    this.sessionManager = sessionManager;
    logger.info('VisualInspectionConnector initialized');
  }

  /**
   * Get the active Puppeteer page (creates session if needed).
   */
  private async getPage(): Promise<Page> {
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });
    return session.page;
  }

  /**
   * Get the Puppeteer browser instance.
   */
  private async getBrowser(): Promise<Browser> {
    const session = await this.sessionManager.getSession({
      platform: this.platform,
      headless: true,
    });
    return session.browser;
  }

  // ─────────────────────────────────────────────
  // Track B — browser_scroll_capture
  // ─────────────────────────────────────────────

  /**
   * Scrolls a fully-rendered page in viewport increments and captures each section.
   * Temp files are auto-deleted after returning result when cleanup=true (default).
   */
  async scrollCapture(options: ScrollCaptureOptions): Promise<ScrollCaptureResult> {
    const {
      url,
      viewportWidth = 1280,
      viewportHeight = 900,
      overlap = 100,
      waitAfterScroll = 300,
      cleanup = true,
    } = options;

    const outputDir = options.outputDir ?? await createTempSession('scroll');
    const sessionId = outputDir.split('/').pop() ?? outputDir;

    logger.info('scroll_capture start', { url, viewportWidth, viewportHeight, outputDir });

    const page = await this.getPage();

    // Navigate if URL provided
    if (url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    const pageUrl = page.url();

    // Set viewport
    await page.setViewport({ width: viewportWidth, height: viewportHeight });

    // Get full page height
    // @ts-ignore — runs in browser context
    const totalHeight: number = await page.evaluate(() => document.body.scrollHeight);

    const captures: ScrollCaptureResult['captures'] = [];
    let index = 0;
    let scrollY = 0;
    const step = viewportHeight - overlap;

    while (scrollY < totalHeight) {
      // Scroll to position
      // @ts-ignore — runs in browser context
      await page.evaluate((y: number) => window.scrollTo(0, y), scrollY);

      // Wait for any lazy-loaded content
      await new Promise(resolve => setTimeout(resolve, waitAfterScroll));

      const captureHeight = Math.min(viewportHeight, totalHeight - scrollY);
      const filePath = join(outputDir, `capture-${String(index).padStart(3, '0')}.png`).replace(/\\/g, '/');

      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: scrollY, width: viewportWidth, height: captureHeight },
      } as any);

      captures.push({ index, path: filePath, scrollY, height: captureHeight });
      logger.debug('Captured section', { index, scrollY, captureHeight });

      index++;
      scrollY += step;

      // Safety: stop if we've gone beyond the page
      if (step <= 0) break;
    }

    let cleaned = false;
    if (cleanup) {
      await cleanupSession(outputDir);
      cleaned = true;
    }

    const result: ScrollCaptureResult = {
      sessionId,
      outputDir,
      pageUrl,
      totalHeight,
      captures,
      cleaned,
    };

    logger.info('scroll_capture complete', {
      pageUrl,
      totalHeight,
      captureCount: captures.length,
      cleaned,
    });

    return result;
  }

  // ─────────────────────────────────────────────
  // Track C — browser_selector_capture
  // ─────────────────────────────────────────────

  /**
   * Captures specific DOM elements by CSS selector (element bounding box only).
   */
  async selectorCapture(options: SelectorCaptureOptions): Promise<SelectorCaptureResult> {
    const {
      selectors,
      url,
      padding = 8,
      cleanup = true,
    } = options;

    const outputDir = options.outputDir ?? await createTempSession('selector');
    const sessionId = outputDir.split('/').pop() ?? outputDir;

    logger.info('selector_capture start', { selectorCount: selectors.length, url, outputDir });

    const page = await this.getPage();

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    const pageUrl = page.url();
    const captures: SelectorCaptureResult['captures'] = [];

    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      try {
        const element = await page.$(selector);

        if (!element) {
          captures.push({ selector, path: null, found: false, boundingBox: null });
          logger.debug('Element not found', { selector });
          continue;
        }

        const box = await element.boundingBox();

        if (!box) {
          captures.push({ selector, path: null, found: false, boundingBox: null, error: 'boundingBox() returned null' });
          continue;
        }

        // Expand by padding, clamp to viewport
        const viewport = page.viewport();
        const clippedX = Math.max(0, box.x - padding);
        const clippedY = Math.max(0, box.y - padding);
        const clippedW = Math.min(
          box.width + padding * 2,
          (viewport?.width ?? 1280) - clippedX
        );
        const clippedH = box.height + padding * 2;

        const safeName = selector.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
        const filePath = join(outputDir, `sel-${String(i).padStart(3, '0')}-${safeName}.png`).replace(/\\/g, '/');

        await page.screenshot({
          path: filePath,
          clip: { x: clippedX, y: clippedY, width: clippedW, height: clippedH },
        } as any);

        captures.push({
          selector,
          path: filePath,
          found: true,
          boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
        });

        logger.debug('Captured element', { selector, box });
      } catch (err) {
        captures.push({
          selector,
          path: null,
          found: false,
          boundingBox: null,
          error: String(err),
        });
        logger.warn('selector_capture element error', { selector, err });
      }
    }

    let cleaned = false;
    if (cleanup) {
      await cleanupSession(outputDir);
      cleaned = true;
    }

    const result: SelectorCaptureResult = {
      sessionId,
      outputDir,
      pageUrl,
      captures,
      cleaned,
    };

    logger.info('selector_capture complete', {
      pageUrl,
      found: captures.filter(c => c.found).length,
      total: captures.length,
      cleaned,
    });

    return result;
  }

  // ─────────────────────────────────────────────
  // Track D — browser_computed_styles
  // ─────────────────────────────────────────────

  /**
   * Extracts computed CSS properties for matching elements.
   * ZERO disk I/O — pure data return. No screenshots.
   * Most powerful tool for systematic QA: verify fonts, colors, layout.
   */
  async computedStyles(options: ComputedStylesOptions): Promise<ComputedStylesResult> {
    const { selectors, url } = options;

    logger.info('computed_styles start', { labelCount: Object.keys(selectors).length, url });

    const page = await this.getPage();

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    const pageUrl = page.url();
    const results: ComputedStylesResult['results'] = {};

    for (const [label, config] of Object.entries(selectors)) {
      const { selector, properties, multiple = false } = config;

      try {
        const styleData: Array<Record<string, string>> = await page.$$eval(
          selector,
          // @ts-ignore — runs in browser context, DOM types not in lib
          (elements: any[], props: string[]) => {
            // eslint-disable-next-line no-undef
            return elements.map((el: any) => {
              const cs = (globalThis as any).getComputedStyle(el);
              const result: Record<string, string> = {};
              for (const p of props) {
                result[p] = cs.getPropertyValue(p).trim();
              }
              return result;
            });
          },
          properties
        );

        const relevantStyles = multiple ? styleData : styleData.slice(0, 1);

        results[label] = {
          selector,
          found: styleData.length > 0,
          elementCount: styleData.length,
          styles: relevantStyles.map((props, idx) => ({ index: idx, properties: props })),
        };

        logger.debug('computed_styles result', { label, selector, elementCount: styleData.length });
      } catch (err) {
        results[label] = {
          selector,
          found: false,
          elementCount: 0,
          styles: [],
        };
        logger.warn('computed_styles element error', { label, selector, err });
      }
    }

    const result: ComputedStylesResult = { pageUrl, results };
    logger.info('computed_styles complete', { pageUrl, labelCount: Object.keys(results).length });
    return result;
  }

  // ─────────────────────────────────────────────
  // Track E — browser_batch_audit
  // ─────────────────────────────────────────────

  /**
   * Parallel visual audit across multiple URLs.
   * Hardware-limited concurrency via semaphore (default maxConcurrent: 3).
   * Uses Promise.allSettled for graceful failure handling.
   */
  async batchAudit(options: BatchAuditOptions): Promise<BatchAuditResult> {
    const {
      targets,
      maxConcurrent = 3,
      cleanup = true,
    } = options;

    const batchOutputDir = options.outputDir ?? await createTempSession('batch');
    const sessionId = batchOutputDir.split('/').pop() ?? batchOutputDir;
    const startTime = Date.now();

    logger.info('batch_audit start', {
      targetCount: targets.length,
      maxConcurrent,
      outputDir: batchOutputDir,
    });

    // Simple semaphore
    let running = 0;
    const queue: Array<() => void> = [];

    const acquire = (): Promise<void> =>
      new Promise(resolve => {
        if (running < maxConcurrent) {
          running++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });

    const release = (): void => {
      running--;
      if (queue.length > 0) {
        running++;
        queue.shift()!();
      }
    };

    const browser = await this.getBrowser();

    const runTarget = async (
      target: BatchAuditTarget
    ): Promise<BatchAuditResult['results'][number]> => {
      await acquire();
      const targetStart = Date.now();

      // Each target gets its own page — no new browser instance
      const page = await browser.newPage();

      try {
        const targetOutputDir = join(batchOutputDir, target.label).replace(/\\/g, '/');
        await mkdir(targetOutputDir, { recursive: true });

        const mode = target.captureMode;
        const needsScroll = mode === 'scroll' || mode === 'scroll+styles';
        const needsSelector = mode === 'selector' || mode === 'selector+styles';
        const needsStyles = mode === 'styles' || mode === 'scroll+styles' || mode === 'selector+styles';

        // Navigate once
        await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });

        let scrollCaptures: ScrollCaptureResult | undefined;
        let selectorCaptures: SelectorCaptureResult | undefined;
        let computedStyles: ComputedStylesResult | undefined;

        if (needsScroll) {
          const scrollOpts: ScrollCaptureOptions & { outputDir: string } = {
            ...(target.scrollOptions ?? {}),
            outputDir: targetOutputDir,
            cleanup: false, // We clean up the whole batch dir at the end
          };
          // Reuse page by injecting it temporarily via a page-level scroll capture
          scrollCaptures = await this._scrollCapturePage(page, scrollOpts);
        }

        if (needsSelector && target.selectors) {
          selectorCaptures = await this._selectorCapturePage(
            page,
            target.selectors,
            targetOutputDir,
            8,
            false
          );
        }

        if (needsStyles && target.styleSelectors) {
          computedStyles = await this._computedStylesPage(page, target.styleSelectors, target.url);
        }

        return {
          url: target.url,
          label: target.label,
          success: true,
          scrollCaptures,
          selectorCaptures,
          computedStyles,
          durationMs: Date.now() - targetStart,
        };
      } catch (err) {
        logger.warn('batch_audit target failed', { url: target.url, label: target.label, err });
        return {
          url: target.url,
          label: target.label,
          success: false,
          error: String(err),
          durationMs: Date.now() - targetStart,
        };
      } finally {
        await page.close().catch(() => {});
        release();
      }
    };

    const settled = await Promise.allSettled(targets.map(t => runTarget(t)));

    const results: BatchAuditResult['results'] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      return {
        url: targets[i].url,
        label: targets[i].label,
        success: false,
        error: String(s.reason),
        durationMs: 0,
      };
    });

    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;
    const durationMs = Date.now() - startTime;

    let cleaned = false;
    if (cleanup) {
      await cleanupSession(batchOutputDir);
      cleaned = true;
    }

    const result: BatchAuditResult = {
      sessionId,
      outputDir: batchOutputDir,
      summary: { total: targets.length, succeeded, failed, durationMs },
      results,
      cleaned,
    };

    logger.info('batch_audit complete', { total: targets.length, succeeded, failed, durationMs });
    return result;
  }

  // ─────────────────────────────────────────────
  // Track F — browser_session_cleanup
  // ─────────────────────────────────────────────

  /**
   * Explicit cleanup of a temp session directory (for when cleanup=false was used).
   */
  async sessionCleanup(sessionDir: string): Promise<{ deleted: number; path: string }> {
    logger.info('session_cleanup explicit', { sessionDir });
    const { deleted } = await cleanupSession(sessionDir);
    return { deleted, path: sessionDir };
  }

  // ─────────────────────────────────────────────
  // Private page-level helpers (for batch reuse)
  // ─────────────────────────────────────────────

  private async _scrollCapturePage(
    page: Page,
    options: ScrollCaptureOptions & { outputDir: string }
  ): Promise<ScrollCaptureResult> {
    const {
      outputDir,
      viewportWidth = 1280,
      viewportHeight = 900,
      overlap = 100,
      waitAfterScroll = 300,
    } = options;

    const sessionId = outputDir.split('/').pop() ?? outputDir;
    const pageUrl = page.url();

    await page.setViewport({ width: viewportWidth, height: viewportHeight });
    // @ts-ignore — runs in browser context
    const totalHeight: number = await page.evaluate(() => document.body.scrollHeight);

    const captures: ScrollCaptureResult['captures'] = [];
    let index = 0;
    let scrollY = 0;
    const step = viewportHeight - overlap;

    while (scrollY < totalHeight) {
      // @ts-ignore — runs in browser context
      await page.evaluate((y: number) => window.scrollTo(0, y), scrollY);
      await new Promise(resolve => setTimeout(resolve, waitAfterScroll));

      const captureHeight = Math.min(viewportHeight, totalHeight - scrollY);
      const filePath = join(outputDir, `capture-${String(index).padStart(3, '0')}.png`).replace(/\\/g, '/');

      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: scrollY, width: viewportWidth, height: captureHeight },
      } as any);

      captures.push({ index, path: filePath, scrollY, height: captureHeight });
      index++;
      scrollY += step;
      if (step <= 0) break;
    }

    return { sessionId, outputDir, pageUrl, totalHeight, captures, cleaned: false };
  }

  private async _selectorCapturePage(
    page: Page,
    selectors: string[],
    outputDir: string,
    padding: number,
    _cleanup: boolean
  ): Promise<SelectorCaptureResult> {
    const sessionId = outputDir.split('/').pop() ?? outputDir;
    const pageUrl = page.url();
    const captures: SelectorCaptureResult['captures'] = [];

    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      try {
        const element = await page.$(selector);
        if (!element) {
          captures.push({ selector, path: null, found: false, boundingBox: null });
          continue;
        }
        const box = await element.boundingBox();
        if (!box) {
          captures.push({ selector, path: null, found: false, boundingBox: null });
          continue;
        }
        const viewport = page.viewport();
        const clippedX = Math.max(0, box.x - padding);
        const clippedY = Math.max(0, box.y - padding);
        const clippedW = Math.min(box.width + padding * 2, (viewport?.width ?? 1280) - clippedX);
        const clippedH = box.height + padding * 2;

        const safeName = selector.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
        const filePath = join(outputDir, `sel-${String(i).padStart(3, '0')}-${safeName}.png`).replace(/\\/g, '/');

        await page.screenshot({
          path: filePath,
          clip: { x: clippedX, y: clippedY, width: clippedW, height: clippedH },
        } as any);

        captures.push({ selector, path: filePath, found: true, boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height } });
      } catch (err) {
        captures.push({ selector, path: null, found: false, boundingBox: null, error: String(err) });
      }
    }

    return { sessionId, outputDir, pageUrl, captures, cleaned: false };
  }

  private async _computedStylesPage(
    page: Page,
    selectors: Record<string, { selector: string; properties: string[] }>,
    _url: string
  ): Promise<ComputedStylesResult> {
    const pageUrl = page.url();
    const results: ComputedStylesResult['results'] = {};

    for (const [label, config] of Object.entries(selectors)) {
      const { selector, properties } = config;
      try {
        const styleData: Array<Record<string, string>> = await page.$$eval(
          selector,
          // @ts-ignore — runs in browser context, DOM types not in lib
          (elements: any[], props: string[]) =>
            elements.map((el: any) => {
              const cs = (globalThis as any).getComputedStyle(el);
              const result: Record<string, string> = {};
              for (const p of props) result[p] = cs.getPropertyValue(p).trim();
              return result;
            }),
          properties
        );

        results[label] = {
          selector,
          found: styleData.length > 0,
          elementCount: styleData.length,
          styles: styleData.slice(0, 1).map((props, idx) => ({ index: idx, properties: props })),
        };
      } catch (err) {
        results[label] = { selector, found: false, elementCount: 0, styles: [] };
      }
    }

    return { pageUrl, results };
  }

  // ─────────────────────────────────────────────
  // image_read — local image file reader
  // ─────────────────────────────────────────────

  /**
   * Read a local image file and return it as base64.
   * Supports PNG, JPG/JPEG, GIF, WebP, BMP, SVG.
   * No browser needed — pure fs read.
   * Files must be on D:\ — C:\ paths are rejected.
   */
  async imageRead(filePath: string): Promise<ImageReadResult> {
    // Safety: reject C:\ paths
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith('c:/') || normalized.toLowerCase().startsWith('c:\\')) {
      throw new Error('image_read: C:\\ paths are not permitted. Use D:\\ paths only.');
    }

    if (!existsSync(filePath)) {
      throw new Error(`image_read: File not found: ${filePath}`);
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`image_read: Path is not a file: ${filePath}`);
    }

    const ext = extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.webp': 'image/webp',
      '.bmp':  'image/bmp',
      '.svg':  'image/svg+xml',
    };

    const mimeType = mimeMap[ext];
    if (!mimeType) {
      throw new Error(`image_read: Unsupported file type "${ext}". Supported: ${Object.keys(mimeMap).join(', ')}`);
    }

    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');

    logger.info('image_read complete', { filePath, mimeType, bytes: stat.size });

    return {
      path: filePath,
      mimeType,
      base64,
      sizeBytes: stat.size,
      encoding: 'base64',
    };
  }
}

export interface ImageReadResult {
  path: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  encoding: 'base64';
}
