# API Engine Design Document

**Engine**: 2 of 7  
**Status**: 🔄 IN PROGRESS  
**Version**: 0.4.0-alpha.1 (target)  
**Dependencies**: Vault Engine (for credential storage)

## Overview

The API Engine provides comprehensive HTTP/REST/GraphQL client capabilities with OAuth integration, automatic pagination, intelligent retry logic, and per-endpoint rate limiting. This engine enables AI agents to interact with any web API.

## Core Capabilities

### 1. HTTP Client
- REST API support (GET, POST, PUT, PATCH, DELETE)
- GraphQL queries and mutations
- Custom headers and authentication
- Request/response interceptors
- Timeout configuration
- Stream handling

### 2. OAuth 2.0 Flows
- Authorization Code flow (most common)
- Client Credentials flow
- Implicit flow
- PKCE (Proof Key for Code Exchange)
- Token refresh automation
- Provider templates (Google, GitHub, Stripe, Slack, etc.)

### 3. Pagination
- Auto-detection of pagination patterns
- Cursor-based pagination
- Offset/limit pagination
- Page number pagination
- Link header pagination (RFC 8288)
- Automatic page aggregation

### 4. Response Parsing
- JSON parsing (default)
- XML parsing
- Text/HTML extraction
- Binary data handling
- Content-Type detection
- Schema validation

### 5. Rate Limiting
- Per-endpoint token bucket
- Per-API global limits
- Respect `Retry-After` headers
- Respect `X-RateLimit-*` headers
- Exponential backoff
- Queue management

### 6. Error Handling
- Automatic retries (configurable)
- Circuit breaker pattern
- Error classification (retryable vs fatal)
- Detailed error reporting
- Fallback strategies

## Architecture

```
┌─────────────┐
│   Claude    │
│   (User)    │
└──────┬──────┘
       │ MCP Tools (api_request, api_oauth, etc.)
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

## Component Design

### 1. HTTP Client (`HttpClient.ts`)

**Purpose**: Low-level HTTP request handling with axios

**Features**:
- Request/response interceptors
- Timeout configuration
- Retry logic integration
- Stream support
- Custom headers
- Authentication injection

**Dependencies**:
- `axios` (HTTP client)
- Rate limit manager
- Retry manager

### 2. OAuth Manager (`OAuthManager.ts`)

**Purpose**: OAuth 2.0 flow orchestration and token management

**Features**:
- Multiple provider templates (Google, GitHub, Stripe, etc.)
- Authorization code flow with PKCE
- Client credentials flow
- Automatic token refresh
- Token storage in Vault Engine
- Redirect URL handling (local server for OAuth callbacks)

**Token Storage**:
```typescript
// Tokens stored in Vault Engine
vault_set({
  vaultName: "api-tokens",
  credentialName: "google-oauth-{user-id}",
  value: JSON.stringify({
    access_token: "ya29.a0...",
    refresh_token: "1//...",
    expires_at: 1706198400,
    scope: "https://www.googleapis.com/auth/gmail.readonly"
  })
})
```

### 3. Pagination Handler (`PaginationHandler.ts`)

**Purpose**: Automatic pagination detection and aggregation

**Patterns Detected**:
- Cursor: `{ cursor: "next_page_token" }`
- Offset/Limit: `{ offset: 0, limit: 100 }`
- Page Number: `{ page: 1, per_page: 100 }`
- Link Headers: `Link: <https://api.example.com/items?page=2>; rel="next"`

**Features**:
- Auto-detect pagination pattern from first response
- Fetch all pages or limit to max pages
- Aggregate results into single array
- Progress reporting for long paginations

### 4. Rate Limit Manager (`RateLimitManager.ts`)

**Purpose**: Per-endpoint and global rate limiting

**Implementation**:
- Token bucket algorithm (same as Browser Engine)
- Separate buckets per endpoint
- Global bucket per API
- Header parsing (`X-RateLimit-Remaining`, `Retry-After`)
- Proactive rate limiting (prevent hitting limits)

**Configuration**:
```typescript
{
  "api.github.com": {
    global: { requests: 5000, window: 3600 },
    endpoints: {
      "/search/code": { requests: 30, window: 60 },
      "/repos/{owner}/{repo}/commits": { requests: 60, window: 60 }
    }
  }
}
```

### 5. Parser Engine (`ParserEngine.ts`)

**Purpose**: Response parsing and schema validation

**Formats**:
- JSON (default, with schema validation via Zod)
- XML (via xml2js)
- HTML (via cheerio for extraction)
- Text/Plain
- Binary (Buffer)

**Features**:
- Content-Type auto-detection
- Schema validation (optional)
- Error extraction from responses
- Nested data extraction

### 6. Retry Manager (`RetryManager.ts`)

**Purpose**: Intelligent retry logic with exponential backoff

**Features**:
- Configurable max retries (default: 3)
- Exponential backoff: `delay = base * (2 ^ attempt)`
- Jitter to prevent thundering herd
- Retry only on retryable errors (5xx, network errors, rate limits)
- Circuit breaker pattern (fail fast after consecutive failures)

**Retryable Errors**:
- 429 (Too Many Requests)
- 500, 502, 503, 504 (Server errors)
- Network errors (ECONNRESET, ETIMEDOUT)
- DNS errors

**Non-Retryable Errors**:
- 400, 401, 403, 404 (Client errors)
- Invalid credentials
- Schema validation errors

## MCP Tools

### `api_request`

Make HTTP request to any API.

```typescript
api_request({
  method: "GET",
  url: "https://api.github.com/user/repos",
  headers: {
    "Authorization": "Bearer {token}"
  },
  params: {
    sort: "updated",
    per_page: 100
  },
  autoPaginate: true,  // Fetch all pages
  maxPages: 10         // Limit to 10 pages
})
```

### `api_oauth_init`

Initialize OAuth flow for a provider.

```typescript
api_oauth_init({
  provider: "google",  // or "github", "stripe", "slack"
  scopes: [
    "https://www.googleapis.com/auth/gmail.readonly"
  ],
  redirectUri: "http://localhost:3000/oauth/callback"
})
// Returns: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### `api_oauth_callback`

Complete OAuth flow with authorization code.

```typescript
api_oauth_callback({
  provider: "google",
  code: "4/0AY0e-g7...",
  state: "random_state_token"
})
// Stores tokens in Vault Engine
// Returns: { success: true, userId: "user@example.com" }
```

### `api_oauth_refresh`

Manually refresh OAuth token.

```typescript
api_oauth_refresh({
  provider: "google",
  userId: "user@example.com"
})
// Returns: { success: true, expiresAt: 1706202000 }
```

### `api_graphql`

Execute GraphQL query or mutation.

```typescript
api_graphql({
  url: "https://api.github.com/graphql",
  query: `
    query {
      viewer {
        repositories(first: 10) {
          nodes {
            name
            description
          }
        }
      }
    }
  `,
  variables: {},
  headers: {
    "Authorization": "Bearer {token}"
  }
})
```

### `api_webhook_register`

Register webhook endpoint (for APIs that support webhooks).

```typescript
api_webhook_register({
  provider: "stripe",
  events: ["payment_intent.succeeded", "charge.failed"],
  url: "https://myapp.com/webhooks/stripe"
})
```

## OAuth Provider Templates

### Google

```typescript
{
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: {
    gmail: "https://www.googleapis.com/auth/gmail.readonly",
    drive: "https://www.googleapis.com/auth/drive.readonly",
    calendar: "https://www.googleapis.com/auth/calendar.readonly"
  },
  pkce: true,
  refreshable: true
}
```

### GitHub

```typescript
{
  authUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  scopes: {
    repo: "repo",
    user: "user:email",
    workflow: "workflow"
  },
  pkce: false,
  refreshable: true
}
```

### Stripe

```typescript
{
  authUrl: "https://connect.stripe.com/oauth/authorize",
  tokenUrl: "https://connect.stripe.com/oauth/token",
  scopes: {
    read_write: "read_write"
  },
  pkce: false,
  refreshable: true
}
```

## Error Codes

- `API_REQUEST_FAILED`: HTTP request failed
- `OAUTH_INIT_FAILED`: OAuth initialization failed
- `OAUTH_CALLBACK_FAILED`: OAuth callback failed
- `TOKEN_EXPIRED`: OAuth token expired and refresh failed
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `PAGINATION_FAILED`: Pagination failed
- `PARSE_ERROR`: Response parsing failed
- `INVALID_PROVIDER`: Unknown OAuth provider
- `WEBHOOK_REGISTER_FAILED`: Webhook registration failed

## Dependencies

```json
{
  "axios": "^1.6.0",
  "oauth": "^0.10.0",
  "xml2js": "^0.6.2",
  "cheerio": "^1.0.0-rc.12",
  "zod": "^3.24.1"
}
```

## File Structure

```
src/tools/api/
├── ApiEngine.ts           # Main orchestrator
├── HttpClient.ts          # Low-level HTTP client
├── OAuthManager.ts        # OAuth flow management
├── PaginationHandler.ts   # Pagination detection/handling
├── RateLimitManager.ts    # Rate limiting
├── ParserEngine.ts        # Response parsing
├── RetryManager.ts        # Retry logic
├── providers/             # OAuth provider configs
│   ├── google.ts
│   ├── github.ts
│   ├── stripe.ts
│   └── slack.ts
└── tools.ts               # MCP tool definitions
```

## Testing Strategy

### Unit Tests
- HTTP client (mocked axios)
- OAuth flows (mocked token endpoints)
- Pagination detection
- Rate limiting (time-based)
- Response parsing (JSON, XML)
- Retry logic

### Integration Tests
- Real API calls (with test credentials)
- OAuth flow (using test OAuth app)
- Pagination (real paginated endpoint)
- Rate limit handling (intentional limit hits)

### Target: 40+ tests

## Implementation Plan

### Phase 1: HTTP Client (Day 1)
- [ ] HttpClient.ts - Basic HTTP client with axios
- [ ] RetryManager.ts - Exponential backoff retry logic
- [ ] ParserEngine.ts - JSON/XML parsing
- [ ] Tests: 10 tests

### Phase 2: Rate Limiting (Day 1)
- [ ] RateLimitManager.ts - Token bucket per endpoint
- [ ] Header parsing (`X-RateLimit-*`, `Retry-After`)
- [ ] Tests: 5 tests

### Phase 3: Pagination (Day 2)
- [ ] PaginationHandler.ts - Auto-detection and aggregation
- [ ] Support all 4 pagination patterns
- [ ] Tests: 8 tests

### Phase 4: OAuth (Day 2-3)
- [ ] OAuthManager.ts - Authorization code flow
- [ ] Provider templates (Google, GitHub, Stripe)
- [ ] Token storage in Vault Engine
- [ ] Token refresh automation
- [ ] Tests: 12 tests

### Phase 5: Integration & Tools (Day 3)
- [ ] ApiEngine.ts - Main orchestrator
- [ ] tools.ts - 6 MCP tools
- [ ] Server integration
- [ ] Tests: 5+ tests

### Total: 40+ tests, 3 days

## Next Steps

1. Install dependencies (`axios`, `oauth`, `xml2js`, `cheerio`)
2. Create file structure
3. Implement Phase 1 (HTTP Client)
4. Implement Phase 2 (Rate Limiting)
5. Implement Phase 3 (Pagination)
6. Implement Phase 4 (OAuth)
7. Implement Phase 5 (Integration)
8. Documentation
9. Version bump to 0.4.0-alpha.1

LFG! 🚀
