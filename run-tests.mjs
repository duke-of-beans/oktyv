// Test runner wrapper — sets env vars then runs integration tests
process.env.PUPPETEER_CACHE_DIR = 'D:/Cache/puppeteer';
process.env.OKTYV_BROWSER_DATA_DIR = 'D:/Dev/oktyv/browser-data';
await import('./test-visual-inspection.mjs');
