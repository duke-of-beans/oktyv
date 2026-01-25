# Oktyv Testing Guide

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage (HTML + text report)
npm run test:coverage

# Run tests with coverage (text only)
npm run test:coverage:text
```

## Test Structure

```
tests/
├── unit/
│   ├── connectors/           # Connector unit tests
│   │   ├── linkedin.test.ts  # LinkedIn connector
│   │   ├── indeed.test.ts    # Indeed connector
│   │   ├── wellfound.test.ts # Wellfound connector
│   │   └── generic.test.ts   # Generic browser connector
│   └── tools/                # Tool interface tests
│       └── mcp-parameters.test.ts  # MCP parameter validation
├── integration/              # Integration tests (future)
└── fixtures/                 # Test data fixtures
```

## Test Framework

**Node.js Built-in Test Runner + tsx**
- Zero external test framework dependencies
- Fast execution (~600ms for 52 tests)
- Native TypeScript support
- Built-in mocking with `mock.fn()`

## Test Coverage

Current coverage: **52 tests, 100% pass rate**

### By Category:
- **Connector Tests**: 29 tests
  - LinkedIn: 5 tests
  - Indeed: 5 tests
  - Wellfound: 5 tests
  - Generic Browser: 14 tests

- **MCP Tool Tests**: 23 tests
  - LinkedIn Tools: 8 tests
  - Indeed Tools: 3 tests
  - Wellfound Tools: 3 tests
  - Generic Browser Tools: 9 tests

## Writing Tests

### Example Connector Test

```typescript
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { LinkedInConnector } from '../../../src/connectors/linkedin.js';

describe('LinkedInConnector', () => {
  let connector: LinkedInConnector;
  let mockSessionManager: BrowserSessionManager;

  beforeEach(() => {
    // Setup mocks
    mockSessionManager = {
      getSession: mock.fn(async () => ({ page, state: 'READY' })),
    } as unknown as BrowserSessionManager;

    connector = new LinkedInConnector(mockSessionManager, mockRateLimiter);
  });

  it('should initialize correctly', () => {
    assert.ok(connector);
  });
});
```

### Example Parameter Validation Test

```typescript
describe('linkedin_search_jobs', () => {
  it('should accept valid parameters', () => {
    const params = {
      keywords: 'software engineer',
      location: 'San Francisco',
      limit: 20,
    };

    const result = validateParams(schema, params);
    assert.equal(result.valid, true);
  });

  it('should reject invalid types', () => {
    const params = {
      keywords: 123, // should be string
    };

    const result = validateParams(schema, params);
    assert.equal(result.valid, false);
  });
});
```

## Test Quality Guidelines

✅ **Do:**
- Write clear, descriptive test names
- Use beforeEach for test setup
- Test both success and failure paths
- Verify error handling
- Use strict assertions
- Keep tests focused and isolated

❌ **Don't:**
- Write tests that depend on other tests
- Use real browser sessions in unit tests
- Skip error handling tests
- Write overly complex test logic
- Ignore test failures

## CI/CD Integration

See `.github/workflows/test.yml` for automated testing on:
- Pull requests
- Main branch commits
- Manual workflow dispatch

## Coverage Reports

Coverage reports are generated in:
- `coverage/` - HTML reports (open `coverage/index.html` in browser)
- Console - Text summary with key metrics

## Future Enhancements

- [ ] Integration tests with real browsers
- [ ] Performance benchmarks
- [ ] Snapshot testing for UI components
- [ ] E2E tests for complete workflows
- [ ] Test data factories
- [ ] Coverage thresholds (80%+ target)
