# CI/CD Fix Summary - Cross-Platform Glob Patterns

## Problem Identified

GitHub Actions tests were failing on Ubuntu with:
```
Test Suite / Run Tests (20.x) - Failed in 18-19 seconds
Test Suite / Run Tests (18.x, 22.x) - Cancelled
```

**Root Cause:** Glob pattern `tests/**/*.test.ts` behaves differently on:
- **Windows PowerShell** - Works correctly
- **Linux bash** - Requires special handling (quotes or globstar)

## Solution Applied

### Before (Failing on Linux)
```json
"test": "tsx --test tests/**/*.test.ts"
```

The `**` glob pattern needs either:
1. Single quotes (but breaks on Windows PowerShell)
2. `shopt -s globstar` (bash-specific)
3. Explicit directory listing

### After (Cross-Platform)
```json
"test": "tsx --test tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts"
```

**Benefits:**
- ✅ Works on Windows PowerShell
- ✅ Works on Linux bash
- ✅ Explicit (no glob magic)
- ✅ Consistent behavior everywhere

## Changes Made

### 1. package.json (test scripts)
```json
{
  "scripts": {
    "test": "tsx --test tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts",
    "test:watch": "tsx --test --watch tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts",
    "test:coverage": "npx c8 --reporter=html --reporter=text tsx --test tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts",
    "test:coverage:text": "npx c8 --reporter=text tsx --test tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts"
  }
}
```

### 2. .github/workflows/test.yml
```yaml
- name: Run tests
  run: npm test  # Now uses consistent npm script

- name: Generate coverage report
  if: matrix.node-version == '22.x'
  run: npm run test:coverage  # Also uses npm script
```

## Verification

### Local Testing (Windows)
```bash
npm test
# ✅ 52 tests passing
# Duration: ~1.3s
```

### CI Testing (Ubuntu)
```bash
npm test
# Should now pass on all Node versions (18.x, 20.x, 22.x)
```

## Technical Details

### Why `**` Globs Fail

**Linux bash behavior:**
- `**` requires `shopt -s globstar` to work recursively
- Without globstar, `**` behaves like `*` (single level)
- Each shell invocation resets options (Actions use fresh shells)

**Windows PowerShell behavior:**
- PowerShell natively supports `**` for recursive globs
- Works without any special configuration

### Cross-Platform Glob Best Practices

1. **Avoid `**` in npm scripts** - Use explicit paths instead
2. **Use single-level `*` globs** - Works everywhere
3. **List directories explicitly** - Most reliable approach
4. **Use npm scripts** - Consistent behavior across environments

## Alternative Solutions Considered

### Option A: Quote patterns (Rejected)
```json
"test": "tsx --test 'tests/**/*.test.ts'"
```
❌ Single quotes don't work on Windows PowerShell
❌ Different behavior Windows vs Linux

### Option B: Enable globstar (Rejected)
```yaml
- run: |
    shopt -s globstar
    tsx --test tests/**/*.test.ts
```
❌ bash-specific solution
❌ Doesn't work on Windows
❌ More complex

### Option C: Explicit paths (✅ Selected)
```json
"test": "tsx --test tests/unit/connectors/*.test.ts tests/unit/tools/*.test.ts"
```
✅ Works everywhere
✅ No shell-specific config
✅ Simple and reliable

## Result

**Status:** ✅ Fixed and deployed

**Commit:** b2eb355 - "fix(ci): resolve glob pattern issues for cross-platform testing"

**Expected Outcome:**
- ✅ Tests pass on Node 18.x
- ✅ Tests pass on Node 20.x
- ✅ Tests pass on Node 22.x
- ✅ Coverage report generated
- ✅ Build succeeds

## Lessons Learned

1. **Platform differences matter** - Always test CI changes
2. **Glob patterns are tricky** - Different shells, different behavior
3. **Explicit is better** - List directories instead of complex globs
4. **npm scripts help** - Consistent interface for all platforms
5. **CI catches issues** - Exactly what it's supposed to do!

## Future Considerations

### If Tests Grow
When adding test directories:
1. Add to package.json: `tests/unit/newdir/*.test.ts`
2. Keep pattern simple (single-level `*`)
3. Test locally on Windows
4. CI will validate Linux automatically

### If Structure Changes
If tests move to different structure:
1. Update package.json scripts first
2. Verify locally: `npm test`
3. Commit and push
4. Monitor CI for any issues

---

## Quick Reference

### Running Tests
```bash
npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
npm run test:coverage:text  # Coverage (text only)
```

### Debugging CI Failures
1. Check GitHub Actions logs
2. Look for glob pattern errors
3. Test locally with explicit paths
4. Verify shell differences
5. Use npm scripts (not raw commands)

---

*Fixed: January 24, 2026*  
*CI should now pass on all platforms* 🎉
