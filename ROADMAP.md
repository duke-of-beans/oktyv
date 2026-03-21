# Oktyv Implementation Roadmap
**Universal Automation + Visual Inspection Layer**

Version: 1.2.0  
Created: 2026-01-24  
Updated: 2026-03-20

---

## Overview

Oktyv is the complete universal automation infrastructure with 8 engines plus a dedicated
visual inspection system. All 8 engines are production-complete. The next phase (v1.3.0)
delivers a generalized visual inspection layer usable across every project in the portfolio.

**Current Status:** All 8 engines ✅ PRODUCTION | Browser runtime ✅ CONFIRMED LIVE  
**Latest Version:** v1.2.0  
**Goal:** v1.3.0 — Visual Inspection Layer

---

## Phase 10: Visual Inspection Layer (v1.3.0) 🔲 NEXT

**Priority:** HIGH — unblocks automated visual QA across entire portfolio
**Scope:** Generalized. Works identically for GAD fleet, COVOS dashboard, GregLite, DTS, Easter Agency, Thalamic lander, any web surface.

### Design Principles
- Screenshots are **always temporary** — written to `D:/Dev/oktyv/screenshots/temp/{session-id}/`, auto-deleted after synthesis
- Never write to C:\ — all temp paths on D:\
- **Two capture modes:** comprehensive (scroll-and-capture full page) AND targeted (CSS selector)
- **Parallel within hardware limits** — batch audits run concurrent navigations
- **Computed styles** — inspect what the browser actually rendered, not what's in source HTML
- **Synthesis first** — capture → analyze → report → clean up. Images are means, not ends.

### New MCP Tools

#### `browser_scroll_capture`
Scrolls a fully-rendered page in viewport increments and captures each section.
```
params:
  url?: string              — navigate first if provided
  outputDir?: string        — temp dir (default: D:/Dev/oktyv/screenshots/temp/{uuid}/)
  viewportHeight?: number   — pixels per capture (default: 900)
  overlap?: number          — overlap between captures in px (default: 100)
  cleanup?: boolean         — delete files after returning paths (default: true)
returns:
  sessionId: string
  captures: [{index, path, scrollY}]
  totalHeight: number
  pageUrl: string
```

#### `browser_selector_capture`  
Captures specific DOM elements by CSS selector — element bounding box only, not full viewport.
```
params:
  selectors: string[]       — CSS selectors to capture
  url?: string              — navigate first if provided
  outputDir?: string        — temp dir
  cleanup?: boolean         — default true
returns:
  captures: [{selector, path, boundingBox, found: bool}]
```

#### `browser_computed_styles`
Extracts computed CSS properties for matching elements. Zero screenshots, pure data.
```
params:
  selectors: Record<string, string[]>  — {"label": ["selector", ["font-family", "color", ...]]}
returns:
  results: Record<string, {selector, properties: Record<string, string>, elementCount}>
```
Key use: verify fonts actually loaded, colors are correct, layout dimensions are as expected.
Works without screenshots — pure DOM inspection.

#### `browser_batch_audit`
Parallel visual audit across multiple URLs. Hardware-limited concurrency.
```
params:
  targets: [{url, label, selectors?, captureMode: 'scroll'|'selector'|'both'}]
  maxConcurrent?: number    — default 3 (hardware safe)
  outputDir?: string
  cleanup?: boolean         — default true
returns:
  results: [{url, label, captures, computedStyles, errors}]
  summary: {total, succeeded, failed, duration}
```

#### `browser_session_cleanup`
Explicit cleanup of a temp session directory.
```
params:
  sessionId: string         — from scroll_capture or batch_audit
  or outputDir: string      — direct path
returns:
  deleted: number           — files removed
  path: string
```

### Implementation Tracks

**Track A — Temp session management**
- `D:/Dev/oktyv/screenshots/temp/` as root (gitignored)
- UUID session IDs per capture run
- Auto-cleanup default true on all capture tools
- `browser_session_cleanup` for explicit manual cleanup
- Never write to C:\

**Track B — scroll-and-capture**
- Puppeteer `page.evaluate` to get full page height
- Scroll in `(viewportHeight - overlap)` increments
- `page.screenshot({path, clip: {x:0, y:scrollY, width, height}})` per section
- Return paths array + cleanup

**Track C — selector capture**
- `page.$(selector)` → `element.boundingBox()` → `page.screenshot({clip: boundingBox})`
- Multiple selectors in one call, one screenshot per element
- Return {selector, path, found} per item

**Track D — computed styles**
- `page.evaluate` → `window.getComputedStyle(element)` for each property
- Returns actual rendered values — catches font-load failures, color token errors
- Zero disk I/O — pure data return

**Track E — batch audit**
- `Promise.allSettled` with semaphore for concurrency control
- Each target gets its own Puppeteer page (not new browser instance)
- Results aggregated into unified report
- Cleanup after all targets complete

**Track F — docs, version bump, commit**
- STATUS.md, PROJECT_DNA.yaml, CHANGELOG.md updated
- version → 1.3.0
- npm run build, git commit, git push

### Success Criteria
- `browser_scroll_capture` captures full GAD homepage in sections, temp files cleaned up
- `browser_selector_capture` captures each `<section>` element on a page individually  
- `browser_computed_styles` correctly identifies Inter Tight vs wrong font on any page
- `browser_batch_audit` audits all 7 GAD satellites in parallel, returns unified results
- Zero temp files left on disk after any capture run with cleanup=true
- All paths on D:\ — never C:\

---

---

## Phase 0: Foundation ✅ COMPLETE

**Version:** v0.1.0-alpha.1

### Deliverables ✅
- [x] Git repository initialized  
- [x] TypeScript project scaffolding (strict mode)
- [x] MCP server skeleton (`@modelcontextprotocol/sdk`)
- [x] Project registered with KERNL
- [x] Documentation structure (README, ARCHITECTURE, VISION)
- [x] GitHub remote configured
- [x] Initial commit and push

**Status:** 100% Complete

---

## Phase 1: Browser Engine (Puppeteer) ✅ COMPLETE

**Version:** v0.2.0-alpha.2  
**Priority:** HIGH

### Objectives
Build complete browser automation system with session persistence, platform connectors, and intelligent navigation.

### Core Components

#### 1.1 Browser Session Manager ✅ COMPLETE
- [x] Puppeteer integration
- [x] Cookie-based session persistence
- [x] Headless/headed mode switching
- [x] User data directory management
- [x] Browser lifecycle management

#### 1.2 LinkedIn Connector ✅ COMPLETE
- [x] linkedin_search_jobs tool
- [x] linkedin_get_job tool  
- [x] linkedin_get_company tool
- [x] Rate limiting (token bucket, 10 req/min)
- [x] Error handling with retries
- [x] Unit tests (100% passing)
- [x] Parameter validation tests

#### 1.3 Indeed Connector ✅ COMPLETE
- [x] indeed_search_jobs tool
- [x] indeed_get_job tool
- [x] indeed_get_company tool
- [x] Rate limiting
- [x] Error handling
- [x] Tests (100% passing)

#### 1.4 Wellfound Connector ✅ COMPLETE
- [x] wellfound_search_jobs tool
- [x] wellfound_get_job tool
- [x] wellfound_get_company tool
- [x] Rate limiting
- [x] Error handling
- [x] Tests (100% passing)

#### 1.5 Generic Browser Tools ✅ COMPLETE
- [x] browser_navigate - Go to URL
- [x] browser_click - Click element
- [x] browser_type - Type text
- [x] browser_extract - Extract data via selector
- [x] browser_screenshot - Capture screenshot
- [x] browser_pdf - Generate PDF
- [x] browser_fillForm - Fill forms automatically

### Phase 1 Success Criteria ✅ ALL COMPLETE
- ✅ LinkedIn connector production-ready (3/3 tools working)
- ✅ Indeed connector complete (3/3 tools working)
- ✅ Wellfound connector complete (3/3 tools working)
- ✅ Generic browser tools working (7/7 tools)
- ✅ 100% test pass rate (52/52 tests)
- ✅ CI/CD automation (GitHub Actions)
- ✅ Comprehensive documentation

**Status:** ✅ COMPLETE (v0.2.0-alpha.2)

---

## Phase 2: API Engine (Axios) 🔲 NEXT

**Priority:** HIGH

### Objectives
Build universal HTTP/REST/GraphQL client with OAuth flows, pagination, and rate limiting.

### Core Components

#### 2.1 HTTP Client ✅ CORE
- [ ] api_request - Universal HTTP/REST client
  - GET, POST, PUT, DELETE, PATCH
  - Headers, query params, body
  - Response parsing (JSON, XML, HTML)
  - Error handling

#### 2.2 OAuth 2.0 Integration
- [ ] api_oauth_flow - OAuth 2.0 automation
  - Authorization code flow
  - Client credentials flow
  - Refresh token handling
  - Common providers (Google, GitHub, Stripe, LinkedIn)

#### 2.3 Advanced Features
- [ ] api_paginate - Auto-pagination handler
- [ ] api_webhook_create - Webhook setup
- [ ] api_webhook_list - List webhooks
- [ ] api_graphql - GraphQL query tool

#### 2.4 Rate Limiting
- [ ] Per-endpoint rate limiting
- [ ] Global API throttling
- [ ] Retry with exponential backoff

#### 2.5 Common Integrations
- [ ] GitHub API connector
- [ ] Stripe API connector
- [ ] Slack API connector
- [ ] Google APIs (Drive, Calendar, Gmail)

### Phase 2 Success Criteria
- [ ] Universal HTTP client working
- [ ] OAuth flows automated
- [ ] Pagination handling
- [ ] Rate limiting per endpoint
- [ ] Test suite (100% pass rate)
- [ ] Documentation complete

---

## Phase 3: Database Engine (Prisma) 🔲 PLANNED

**Priority:** HIGH

### Objectives
Build universal database operations layer with SQL, NoSQL, transactions, and migrations.

### Core Components

#### 3.1 SQL Operations (Prisma)
- [ ] db_query - Execute SQL queries
- [ ] db_insert - Insert records
- [ ] db_update - Update records
- [ ] db_delete - Delete records
- [ ] db_transaction - Multi-query transactions

#### 3.2 Database Support
- [ ] PostgreSQL integration
- [ ] MySQL/MariaDB integration
- [ ] SQLite integration (local)

#### 3.3 NoSQL Operations
- [ ] MongoDB integration
- [ ] Redis integration (cache)

#### 3.4 Advanced Features
- [ ] db_backup - Database backups
- [ ] db_migrate - Run migrations
- [ ] Connection pooling
- [ ] Query builder

### Phase 3 Success Criteria
- [ ] All SQL databases supported
- [ ] NoSQL databases supported
- [ ] Transaction handling
- [ ] Migration system
- [ ] Test suite complete

---

## Phase 4: Vault Engine (AES-256) 🔲 PLANNED

**Priority:** HIGH (required before production)

### Objectives
Build secure credential storage with AES-256 encryption and OS keychain integration.

### Core Components

#### 4.1 Encryption System
- [ ] vault_set - Store credential (encrypted)
- [ ] vault_get - Retrieve credential (decrypted)
- [ ] vault_delete - Delete credential
- [ ] vault_rotate - Update credential

#### 4.2 OS Integration
- [ ] macOS Keychain integration
- [ ] Windows Credential Manager integration
- [ ] Linux Secret Service integration

#### 4.3 Advanced Features
- [ ] vault_list - List credential names
- [ ] vault_export - Export vault (encrypted)
- [ ] vault_import - Import vault
- [ ] Multi-vault support (personal, work, project)
- [ ] Access logging (audit trail)

### Phase 4 Success Criteria
- [ ] AES-256 encryption working
- [ ] OS keychain integration
- [ ] Multi-vault support
- [ ] Export/import functionality
- [ ] Test suite complete

---

## Phase 5: File Engine (Node.js fs) 🔲 PLANNED

**Priority:** MEDIUM

### Objectives
Build file system operations with cloud storage integration and format conversion.

### Core Components

#### 5.1 Local File Operations
- [ ] file_read - Read file contents
- [ ] file_write - Write file contents
- [ ] file_move - Move/rename files
- [ ] file_delete - Delete files
- [ ] file_copy - Copy files

#### 5.2 Cloud Storage
- [ ] file_upload_cloud - Upload to S3/Drive/Dropbox
- [ ] file_download_url - Download from URL
- [ ] AWS S3 integration
- [ ] Google Drive integration
- [ ] Dropbox integration
- [ ] OneDrive integration

#### 5.3 Format Conversion
- [ ] file_convert - Convert formats
  - PDF ↔ DOCX
  - CSV ↔ JSON ↔ XLSX
  - Image conversions

#### 5.4 Advanced Features
- [ ] file_compress - ZIP/TAR operations
- [ ] file_watch - Monitor file changes
- [ ] file_encrypt - Encryption/decryption

### Phase 5 Success Criteria
- [ ] All file operations working
- [ ] Cloud storage integrations
- [ ] Format conversions
- [ ] Compression support
- [ ] Test suite complete

---

## Phase 6: Email Engine (Nodemailer) 🔲 PLANNED

**Priority:** MEDIUM

### Objectives
Build email automation with Gmail/Outlook integration, inbox management, and templating.

### Core Components

#### 6.1 Email Sending
- [ ] email_send - Send email
- [ ] email_template_send - Send templated email
- [ ] Gmail integration (OAuth + SMTP)
- [ ] Outlook integration (OAuth + SMTP)
- [ ] Generic SMTP support

#### 6.2 Email Reading
- [ ] email_search - Search inbox
- [ ] email_get - Get email by ID
- [ ] email_download_attachment - Download attachments
- [ ] IMAP integration

#### 6.3 Email Management
- [ ] email_mark_read - Mark as read/unread
- [ ] email_delete - Delete emails
- [ ] email_move - Move to folder

#### 6.4 Advanced Features
- [ ] Template rendering (Handlebars)
- [ ] Bulk email operations
- [ ] Email parsing (extract structured data)
- [ ] Attachment handling

### Phase 6 Success Criteria
- [ ] Email sending working
- [ ] Inbox management
- [ ] Template support
- [ ] Attachment handling
- [ ] Test suite complete

---

## Phase 7: Cron Engine (node-cron) 🔲 PLANNED

**Priority:** MEDIUM

### Objectives
Build scheduled task automation with persistence, monitoring, and error handling.

### Core Components

#### 7.1 Job Scheduling
- [ ] cron_create - Create scheduled job
- [ ] cron_list - List all jobs
- [ ] cron_delete - Delete job
- [ ] cron_pause - Pause job
- [ ] cron_resume - Resume job
- [ ] cron_run_now - Execute immediately

#### 7.2 Scheduling Patterns
- [ ] Standard cron syntax
- [ ] Natural language ("every Monday at 9am")
- [ ] Interval-based ("every 5 minutes")
- [ ] Complex schedules ("first Monday of month")

#### 7.3 Job Persistence
- [ ] Jobs survive restarts
- [ ] Job state management
- [ ] Job history/logs
- [ ] cron_history - View execution history

#### 7.4 Error Handling
- [ ] Retry logic with exponential backoff
- [ ] Error notifications
- [ ] Job monitoring
- [ ] Failure recovery

### Phase 7 Success Criteria
- [ ] Job scheduling working
- [ ] Persistence implemented
- [ ] Error handling robust
- [ ] History tracking
- [ ] Test suite complete

---

## Phase 8: Orchestration & Polish 🔲 FUTURE

**Priority:** LOW (after all 7 engines complete)

### Objectives
Build multi-engine workflows, enterprise features, and production optimizations.

### Core Components

#### 8.1 Multi-Engine Workflows
- [ ] Workflow builder
- [ ] Conditional logic
- [ ] Error recovery
- [ ] Parallel execution

#### 8.2 Enterprise Features
- [ ] Web API (REST endpoint for web apps)
- [ ] Team management (multi-user)
- [ ] SSO integration
- [ ] Audit logging
- [ ] Compliance features

#### 8.3 Performance Optimization
- [ ] Connection pooling
- [ ] Caching layer
- [ ] Resource management
- [ ] Monitoring/observability

#### 8.4 Production Deployment
- [ ] Docker support
- [ ] Kubernetes support
- [ ] CI/CD pipelines
- [ ] Health checks

### Phase 8 Success Criteria
- [ ] Workflow orchestration working
- [ ] Enterprise features complete
- [ ] Performance optimized
- [ ] Production-ready deployment

---

## Testing Strategy

### Test Coverage Goals
- Unit tests: 100% pass rate (critical paths)
- Integration tests: All tools validated
- End-to-end tests: Real-world scenarios
- CI/CD: Automated on every commit

### Test Infrastructure ✅ COMPLETE (Phase 1)
- Node.js built-in test runner
- tsx for TypeScript execution
- c8 for coverage reporting
- GitHub Actions for CI/CD

---

## Documentation Requirements

Each phase must include:
- Tool documentation (inputs, outputs, examples)
- API reference
- Integration guides
- Error handling docs
- Migration guides (if applicable)

---

## Release Strategy

### Alpha Releases (v0.x.x-alpha.x)
- Individual engine implementations
- Breaking changes allowed
- Limited testing
- Development use only

### Beta Releases (v0.x.x-beta.x)
- Multiple engines integrated
- Feature complete per engine
- Comprehensive testing
- Early adopter use

### Release Candidates (v0.x.x-rc.x)
- All 7 engines complete
- Full integration testing
- Production-ready code
- Bug fixes only

### Production Release (v1.0.0)
- All 7 engines complete and tested
- Comprehensive documentation
- Enterprise features
- Production deployment

---

## Current Progress

**Completed Engines:** 1 of 7 (Browser Engine ✅)  
**In Progress:** None  
**Next Up:** API Engine 🔲

**Build Status:**
- ✅ Tests: 52/52 passing (100%)
- ✅ CI/CD: GitHub Actions operational
- ✅ Docs: Comprehensive
- ✅ Version: v0.2.0-alpha.2

---

## Version History

**v1.1.0 (2026-01-24):**
- Updated Browser Engine status to COMPLETE
- Removed all time estimates
- Clarified: Goal is ALL 7 engines
- Updated progress tracking

**v1.0.0 (2026-01-24):**
- Initial roadmap created
- Defined all 7 phases
- Success criteria established
