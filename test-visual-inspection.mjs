/**
 * Track H — Visual Inspection Integration Tests
 * Tests against live GAD fleet.
 * Run: node test-visual-inspection.mjs
 */

import { BrowserSessionManager } from './dist/browser/session.js';
import { RateLimiter } from './dist/browser/rate-limiter.js';
import { VisualInspectionConnector } from './dist/connectors/visual-inspection.js';
import { ensureScreenshotsBaseExists } from './dist/browser/session-manager.js';

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ${PASS} ${message}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${message}`);
    failed++;
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log(' Oktyv v1.3.0 — Visual Inspection Tests');
  console.log('══════════════════════════════════════════════\n');

  await ensureScreenshotsBaseExists();

  const sessionManager = new BrowserSessionManager();
  const rateLimiter = new RateLimiter();
  const vi = new VisualInspectionConnector(sessionManager, rateLimiter);

  // ──────────────────────────────────────────────
  // Test 1 — browser_scroll_capture
  // ──────────────────────────────────────────────
  console.log('Test 1: browser_scroll_capture');
  try {
    const result = await vi.scrollCapture({
      url: 'https://audi-bice.vercel.app',
      viewportHeight: 900,
      cleanup: true,
    });

    assert(typeof result.sessionId === 'string' && result.sessionId.length > 0, `sessionId returned: ${result.sessionId}`);
    assert(Array.isArray(result.captures) && result.captures.length > 0, `captures array has ${result.captures.length} sections`);
    assert(result.totalHeight > 0, `totalHeight: ${result.totalHeight}px`);
    assert(result.cleaned === true, 'cleaned=true (no files on disk)');
    assert(result.pageUrl.includes('vercel.app') || result.pageUrl.includes('audi'), `pageUrl: ${result.pageUrl}`);

    // Verify no files left on disk
    const { existsSync } = await import('fs');
    assert(!existsSync(result.outputDir), `No temp dir left on disk: ${result.outputDir}`);

    console.log(`     captures: ${result.captures.length} sections, totalHeight: ${result.totalHeight}px\n`);
  } catch (err) {
    console.log(`  ${FAIL} scroll_capture threw: ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 2 — browser_computed_styles (most important)
  // ──────────────────────────────────────────────
  console.log('Test 2: browser_computed_styles');
  try {
    const result = await vi.computedStyles({
      selectors: {
        'hero-font': {
          selector: 'h1',
          properties: ['font-family', 'font-size', 'color'],
        },
        'body': {
          selector: 'body',
          properties: ['font-family', 'background-color'],
        },
      },
      url: 'https://audi-bice.vercel.app',
    });

    assert(result.pageUrl.length > 0, `pageUrl: ${result.pageUrl}`);
    assert('hero-font' in result.results, 'hero-font label present');
    assert('body' in result.results, 'body label present');

    const heroFont = result.results['hero-font'];
    assert(heroFont.found === true, `h1 element found (elementCount: ${heroFont.elementCount})`);

    const fontFamily = heroFont.styles[0]?.properties['font-family'] ?? '';
    const isCorrectFont = fontFamily.toLowerCase().includes('inter') ||
                          fontFamily.toLowerCase().includes('helvetica') ||
                          fontFamily.toLowerCase().includes('sans');
    const isWrongFont = fontFamily.toLowerCase().includes('times new roman') ||
                        fontFamily.toLowerCase() === 'serif';

    assert(!isWrongFont, `font-family is NOT "Times New Roman"/serif fallback`);
    assert(fontFamily.length > 0, `font-family has a value: "${fontFamily}"`);

    const bodyResult = result.results['body'];
    assert(bodyResult.found === true, 'body element found');

    console.log(`     h1 font-family:        "${fontFamily}"`);
    console.log(`     h1 font-size:          "${heroFont.styles[0]?.properties['font-size'] ?? 'n/a'}"`);
    console.log(`     body font-family:      "${bodyResult.styles[0]?.properties['font-family'] ?? 'n/a'}"`);
    console.log(`     body background-color: "${bodyResult.styles[0]?.properties['background-color'] ?? 'n/a'}"\n`);

    // Zero disk I/O verification — no outputDir in result
    assert(!('outputDir' in result), 'computed_styles has no outputDir (zero disk I/O)\n');
  } catch (err) {
    console.log(`  ${FAIL} computed_styles threw: ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 3 — browser_batch_audit (7 GAD satellites)
  // ──────────────────────────────────────────────
  console.log('Test 3: browser_batch_audit (7 GAD satellites)');
  const satellites = [
    { url: 'https://audi-bice.vercel.app', label: 'audi' },
    { url: 'https://bmw-seven-roan.vercel.app', label: 'bmw' },
    { url: 'https://mercedes-benz-tau.vercel.app', label: 'mercedes' },
    { url: 'https://porsche-omega.vercel.app', label: 'porsche' },
    { url: 'https://ferrari-roan.vercel.app', label: 'ferrari' },
    { url: 'https://lamborghini-coral.vercel.app', label: 'lamborghini' },
    { url: 'https://bentley-ivory.vercel.app', label: 'bentley' },
  ];

  try {
    const start = Date.now();
    const result = await vi.batchAudit({
      targets: satellites.map(s => ({
        url: s.url,
        label: s.label,
        captureMode: 'styles',
        styleSelectors: {
          font: { selector: 'h1', properties: ['font-family'] },
        },
      })),
      maxConcurrent: 3,
      cleanup: true,
    });

    const duration = Date.now() - start;

    assert(result.summary.total === 7, `total: ${result.summary.total}`);
    assert(result.summary.succeeded >= 1, `at least 1 succeeded (got ${result.summary.succeeded})`);
    assert(result.cleaned === true, 'batch cleaned=true');
    assert(result.results.length === 7, `results array length: ${result.results.length}`);

    console.log(`\n  Summary: ${result.summary.succeeded}/${result.summary.total} succeeded, ${result.summary.failed} failed, ${duration}ms`);
    for (const r of result.results) {
      const fontVal = r.computedStyles?.results?.font?.styles?.[0]?.properties?.['font-family'] ?? 'n/a';
      const status = r.success ? PASS : FAIL;
      console.log(`    ${status} ${r.label.padEnd(14)} font-family: "${fontVal}"${r.error ? ' ERR: ' + r.error.substring(0, 60) : ''}`);
    }
    console.log();
  } catch (err) {
    console.log(`  ${FAIL} batch_audit threw: ${err.message}\n`);
    console.log(err.stack);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Results
  // ──────────────────────────────────────────────
  console.log('══════════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════\n');

  // Close browser
  try {
    await sessionManager.closeAllSessions();
  } catch (_) {}

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
