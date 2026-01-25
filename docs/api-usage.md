# API Engine Usage Guide

**Engine**: 2 of 7  
**Status**: ✅ COMPLETE  
**Version**: 0.4.0-alpha.1

## Overview

The API Engine provides comprehensive HTTP/REST client capabilities with OAuth integration, automatic pagination, intelligent retry logic, and per-endpoint rate limiting. This engine enables AI agents to interact with any web API.

## Quick Start

```typescript
import { ApiEngine } from './tools/api/ApiEngine.js';

// Initialize with Vault Engine integration
const apiEngine = new ApiEngine(
  async (vault, key) => vaultEngine.get(vault, key),
  async (vault, key, value) => vaultEngine.set(vault, key, value)
);

// Simple GET request
const response = await apiEngine.get('https://api.github.com/user/repos');
console.log(response.data);
```

## Core Features

### 1. HTTP Client

Make requests to any HTTP API:

```typescript
// GET request
const repos = await apiEngine.get('https://api.github.com/user/repos', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

// POST request with data
const newRepo = await apiEngine.post('https://api.github.com/user/repos', {
  name: 'my-new-repo',
  private: false
}, {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

// PUT, PATCH, DELETE also supported
await apiEngine.patch('https://api.github.com/repos/owner/repo', {
  description: 'Updated description'
});
```

### 2. Automatic Retry with Circuit Breaker

Exponential backoff retry logic handles transient failures:

```typescript
// Automatic retry on 5xx errors and network failures
const response = await apiEngine.get('https://api.example.com/data', {
  retry: {
    enabled: true,
    maxRetries: 3  // Default
  }
});

// Circuit breaker opens after 5 consecutive failures
// preventing cascading failures
```

**Retryable errors**:
- 429 (Too Many Requests)
- 500, 502, 503, 504 (Server errors)
- Network errors (ECONNRESET, ETIMEDOUT, etc.)

**Non-retryable errors**:
- 400, 401, 403, 404 (Client errors)
- Invalid credentials

### 3. Multi-Format Response Parsing

Automatic parsing based on Content-Type:

```typescript
// JSON (default)
const json = await apiEngine.get('https://api.example.com/data');

// XML parsing
const xml = await apiEngine.get('https://api.example.com/feed.xml');

// HTML extraction with selectors
const html = await apiEngine.get('https://example.com', {
  parser: {
    htmlSelectors: {
      title: 'h1',
      items: '.item',
    }
  }
});

// Binary data
const pdf = await apiEngine.get('https://example.com/document.pdf');
```

### 4. Rate Limiting

Token bucket rate limiting prevents hitting API limits:

```typescript
// Set rate limit for endpoint
const rateLimitManager = apiEngine.getRateLimitManager();
rateLimitManager.setEndpointLimit('api.github.com:/search/code', {
  requests: 30,  // 30 requests
  window: 60     // per 60 seconds
});

// Set global API limit
rateLimitManager.setGlobalLimit('api.github.com', {
  requests: 5000,
  window: 3600  // 5000 requests per hour
});

// Requests automatically wait for rate limit tokens
const results = await apiEngine.get('https://api.github.com/search/code', {
  rateLimitKey: 'api.github.com:/search/code',
  rateLimitApi: 'api.github.com'
});

// Check rate limit status
const status = rateLimitManager.getStatus('api.github.com:/search/code', 'api.github.com');
console.log(`Tokens available: ${status.endpoint.tokens}/${status.endpoint.limit}`);
```

### 5. Automatic Pagination

Auto-detect and aggregate paginated results:

```typescript
// Fetch all pages automatically
const allRepos = await apiEngine.get('https://api.github.com/user/repos', {
  pagination: {
    autoPaginate: true,
    maxPages: 10  // Limit to 10 pages
  }
});

console.log(`Total repos: ${allRepos.data.length}`);
console.log(`Pages fetched: ${allRepos.pages}`);
```

**Supported pagination patterns**:
1. **Cursor-based**: `{ next_cursor: "token" }`
2. **Offset/Limit**: `{ offset: 0, limit: 100 }`
3. **Page number**: `{ page: 1, per_page: 100 }`
4. **Link headers**: `Link: <url>; rel="next"`

### 6. OAuth 2.0 Authentication

Built-in OAuth flows with token management:

```typescript
// 1. Initialize OAuth flow
const oauthManager = apiEngine.getOAuthManager();
const { authUrl, state, codeVerifier } = await oauthManager.buildAuthUrl(
  'google',                    // Provider: google, github, stripe, slack
  'YOUR_CLIENT_ID',
  'http://localhost:3000/callback',
  ['gmail_readonly', 'drive']  // Scopes
);

console.log('Visit:', authUrl);

// 2. User authorizes and you get code from callback

// 3. Exchange code for tokens
const tokens = await oauthManager.exchangeCodeForTokens(
  'google',
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'AUTHORIZATION_CODE',
  'http://localhost:3000/callback',
  codeVerifier  // PKCE verifier
);

// 4. Store tokens in Vault
await oauthManager.storeTokens('google', 'user@example.com', tokens);

// 5. Make authenticated requests (auto-refresh if expired)
const emails = await apiEngine.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
  oauth: {
    provider: 'google',
    userId: 'user@example.com',
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET'
  }
});
```

**Supported providers**:
- **Google**: Gmail, Drive, Calendar
- **GitHub**: Repos, Users, Workflows
- **Stripe**: Payments, Customers
- **Slack**: Channels, Messages, Files

## MCP Tools

### `api_request`

Make HTTP request with all features:

```typescript
{
  url: "https://api.github.com/user/repos",
  method: "GET",
  headers: { "Authorization": "Bearer token" },
  params: { sort: "updated", per_page: 100 },
  autoPaginate: true,
  maxPages: 10,
  rateLimitKey: "github:/user/repos"
}
```

### `api_oauth_init`

Initialize OAuth flow:

```typescript
{
  provider: "google",
  clientId: "YOUR_CLIENT_ID",
  redirectUri: "http://localhost:3000/callback",
  scopes: ["gmail_readonly"]
}
// Returns: { authUrl, state, codeVerifier }
```

### `api_oauth_callback`

Complete OAuth flow:

```typescript
{
  provider: "google",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  code: "AUTHORIZATION_CODE",
  redirectUri: "http://localhost:3000/callback",
  userId: "user@example.com",
  codeVerifier: "PKCE_VERIFIER"
}
```

### `api_oauth_refresh`

Manually refresh token:

```typescript
{
  provider: "google",
  userId: "user@example.com",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET"
}
```

### `api_set_rate_limit`

Configure rate limit:

```typescript
{
  key: "api.github.com:/search/code",
  requests: 30,
  window: 60,
  isGlobal: false
}
```

### `api_get_rate_limit_status`

Check rate limit status:

```typescript
{
  key: "api.github.com:/search/code",
  api: "api.github.com"
}
```

## Advanced Examples

### Retry with Custom Configuration

```typescript
const response = await apiEngine.get('https://api.example.com/data', {
  retry: {
    enabled: true,
    maxRetries: 5
  },
  timeout: 60000  // 60 second timeout
});
```

### Schema Validation

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const response = await apiEngine.get('https://api.example.com/user/123', {
  parser: {
    schema: UserSchema
  }
});

// response.data is validated and typed
```

### Custom Pagination

```typescript
const response = await apiEngine.get('https://api.example.com/items', {
  pagination: {
    autoPaginate: true,
    maxPages: 20,
    dataPath: 'data.items',  // Extract items from nested path
    cursorPath: 'meta.next_cursor'  // Custom cursor location
  }
});
```

### Rate Limit from Headers

```typescript
// API Engine automatically updates rate limits from headers
const response = await apiEngine.get('https://api.github.com/user');

// Headers like X-RateLimit-Remaining, Retry-After are parsed
// and rate limits updated automatically
```

## Error Handling

```typescript
try {
  const response = await apiEngine.get('https://api.example.com/data');
} catch (error) {
  if (error.code === 'REQUEST_FAILED') {
    console.error('Request failed:', error.message);
    console.error('Status:', error.status);
    console.error('Response:', error.response);
  }
}
```

## Architecture

```
┌─────────────┐
│   Claude    │
│   (User)    │
└──────┬──────┘
       │ MCP Tools
       ▼
┌──────────────────────────────────┐
│         API Engine               │
│      (ApiEngine.ts)              │
├──────────────────────────────────┤
│ ┌────────────┐  ┌─────────────┐ │
│ │  HTTP      │  │   OAuth     │ │
│ │  Client    │  │   Manager   │ │
│ └────────────┘  └─────────────┘ │
│ ┌────────────┐  ┌─────────────┐ │
│ │Pagination  │  │ Rate Limit  │ │
│ │  Handler   │  │  Manager    │ │
│ └────────────┘  └─────────────┘ │
│ ┌────────────┐  ┌─────────────┐ │
│ │  Parser    │  │   Retry     │ │
│ │  Engine    │  │   Logic     │ │
│ └────────────┘  └─────────────┘ │
└──────────────────────────────────┘
       │                 │
       ▼                 ▼
┌──────────────┐  ┌─────────────┐
│ Vault Engine │  │  External   │
│ (OAuth tokens│  │  APIs       │
│  API keys)   │  │             │
└──────────────┘  └─────────────┘
```

## Testing

Run API Engine tests:

```bash
npm test tests/unit/api/*.test.ts
```

**Test coverage**: 41 tests
- 10 retry tests (exponential backoff, circuit breaker)
- 17 parser tests (JSON, XML, HTML, text, binary)
- 14 rate limit tests (token bucket, header parsing)

## Dependencies

- `axios` - HTTP client
- `xml2js` - XML parsing
- `cheerio` - HTML parsing
- `zod` - Schema validation

## Next Steps

With API Engine complete, next up:
- **Database Engine** (PostgreSQL, MySQL, MongoDB)
- **Email Engine** (Gmail, SMTP, IMAP)
- **File Engine** (Local, S3, Drive)
- **Cron Engine** (Scheduled tasks)

---

**Version**: 0.4.0-alpha.1  
**Progress**: 3/7 Engines Complete (Browser + Vault + API)
