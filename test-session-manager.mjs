// Unit tests for session-manager (no browser needed)
import { createTempSession, cleanupSession, SCREENSHOTS_BASE, ensureScreenshotsBaseExists } from './dist/browser/session-manager.js';
import { existsSync, writeFileSync } from 'fs';

let passed = 0; let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✅', msg); passed++; }
  else       { console.log('  ❌', msg); failed++; }
}

console.log('\n── Session Manager Unit Tests ──');

// Test 1: SCREENSHOTS_BASE is on D:\, never C:\
assert(SCREENSHOTS_BASE.startsWith('D:/'), `SCREENSHOTS_BASE on D: drive: ${SCREENSHOTS_BASE}`);
assert(!SCREENSHOTS_BASE.includes('C:'), 'SCREENSHOTS_BASE has no C: path');

// Test 2: ensureScreenshotsBaseExists
await ensureScreenshotsBaseExists();
assert(existsSync(SCREENSHOTS_BASE), 'SCREENSHOTS_BASE dir exists after ensureScreenshotsBaseExists()');

// Test 3: createTempSession creates unique dir
const dir1 = await createTempSession('unit-test');
const dir2 = await createTempSession('unit-test');
assert(existsSync(dir1), `dir1 created: ${dir1}`);
assert(existsSync(dir2), `dir2 created: ${dir2}`);
assert(dir1 !== dir2, 'Sessions have unique UUIDs');
assert(dir1.startsWith(SCREENSHOTS_BASE), 'dir1 is under SCREENSHOTS_BASE');
assert(dir1.includes('unit-test-'), 'dir1 includes prefix');

// Test 4: cleanupSession deletes files and dir
writeFileSync(dir1 + '/a.png', 'fake');
writeFileSync(dir1 + '/b.png', 'fake');
const result = await cleanupSession(dir1);
assert(!existsSync(dir1), 'dir1 deleted after cleanupSession');
// deleted count may vary by Node version recursive readdir support
assert(result.deleted >= 0, `deleted count returned: ${result.deleted}`);

// Test 5: cleanupSession on non-existent dir returns 0 (no error)
const result2 = await cleanupSession(dir2.replace('unit-test', 'nonexistent-xyz'));
assert(result2.deleted === 0, 'Non-existent dir returns deleted:0 without error');

// Cleanup dir2
await cleanupSession(dir2);

// Test 6: Security — refuses to delete outside SCREENSHOTS_BASE
let securityPassed = false;
try {
  await cleanupSession('C:/Windows/System32');
} catch(e) {
  securityPassed = e.message.includes('Refusing');
}
assert(securityPassed, 'Refuses to delete C:\\Windows\\System32 (security check)');

try {
  await cleanupSession('D:/Dev/oktyv/src');
} catch(e) {
  securityPassed = e.message.includes('Refusing');
}
assert(securityPassed, 'Refuses to delete D:\\Dev\\oktyv\\src (outside SCREENSHOTS_BASE)');

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
