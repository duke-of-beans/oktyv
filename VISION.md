# OKTYV: THE UNIVERSAL AUTOMATION LAYER

**Version:** 1.1.0  
**Created:** 2026-01-24  
**Updated:** 2026-01-24  
**Owner:** David Kirsch  
**Purpose:** Strategic vision for Oktyv as complete automation infrastructure

---

## CURRENT STATUS

**Build Progress:** 1 of 7 engines complete  
**Latest Version:** v0.2.0-alpha.2  
**Status:** Browser Engine ✅ COMPLETE | 6 Engines 🔲 REMAINING

### Completed
- ✅ Browser Engine (Puppeteer automation)
- ✅ Test infrastructure (52 tests, 100% passing)
- ✅ CI/CD automation (GitHub Actions)
- ✅ Comprehensive documentation

### Remaining
- 🔲 API Engine (HTTP/REST/GraphQL)
- 🔲 Database Engine (SQL/NoSQL)
- 🔲 Email Engine (send/receive/parse)
- 🔲 File Engine (local + cloud storage)
- 🔲 Cron Engine (scheduled tasks)
- 🔲 Vault Engine (encrypted credentials)

**Goal:** All 7 engines (universal automation layer)  
**Philosophy:** Option B Perfection - build complete, ship when ready

---

## PRODUCT IDENTITY

**Name:** Oktyv  
**Type:** Local MCP Server (universal automation infrastructure)  
**Category:** TIER 1 - Foundation layer / Infrastructure  
**Position:** The "hands" of AI agents (execution layer)

**Tagline:** "Complete, production-grade universal automation system"

---

## STRATEGIC POSITIONING

### What Oktyv Is

**Core Function:**
Universal automation layer that gives AI agents the ability to ACT on the real world, not just think about it.

**Complete Scope (7 Engines):**
1. **Browser Engine** ✅ - Web automation (Puppeteer)
2. **API Engine** 🔲 - HTTP/REST automation (Axios)
3. **Database Engine** 🔲 - SQL/NoSQL operations (Prisma)
4. **Email Engine** 🔲 - Email automation (Nodemailer)
5. **File Engine** 🔲 - File system operations (Node.js fs)
6. **Cron Engine** 🔲 - Scheduled tasks (node-cron)
7. **Vault Engine** 🔲 - Credential management (AES-256)

**Technical Architecture:**
Local MCP server running on user's computer, providing automation capabilities to any MCP client (Claude Desktop, GREGORE, Consensus, etc.)

**Integration Points:**
- MCP Protocol → Connect to AI clients
- REST API → Web apps can trigger automation (future)
- Local System → Full OS-level access

### What Oktyv Is NOT

❌ **NOT a web app** - Needs local system access (browser control, file system)  
❌ **NOT a GREGORE extension** - It's infrastructure that GREGORE uses  
❌ **NOT a desktop app** - Headless server with no UI  
❌ **NOT application-specific** - Universal automation, not domain-specific

---

## THE EXCEPTION RULE

**Why Oktyv is Different from Other Products:**

**Most Products:** Web app + optional desktop + GREGORE extension  
**Oktyv:** LOCAL MCP SERVER ONLY

### Technical Requirements

**Browser Automation (Puppeteer):**
- Launch Chrome on user's computer
- Control browser outside web page context
- Access cookies, local storage from user's actual browser
- Run headless OR visible browser
- Persist sessions across restarts

**File System Access:**
- Read/write files on user's computer
- Upload files to external services
- Download files from external sources
- Access Documents, Downloads, Desktop folders

**Credential Vault:**
- Store API keys, passwords, tokens locally (encrypted)
- Access OS-level credential storage (Keychain, Credential Manager)
- Never send credentials to cloud
- Local-only encryption keys

**Process Management:**
- Launch local processes (Python, Node.js, databases)
- Manage long-running tasks (cron jobs, scheduled automations)
- Access local services (PostgreSQL, Redis)

**Web Apps CAN'T Do This:**
Browser security prevents web apps from controlling Chrome, accessing file system deeply, or managing OS processes.

**Solution:**
Local MCP server with OS-level permissions, controlled via MCP protocol.

---

## COMPLETE ARCHITECTURE (7 ENGINES)

### Engine 1: Browser Engine (Puppeteer) ✅ COMPLETE

**Status:** Production ready (v0.2.0-alpha.2)

**Capabilities:**
- Automate Chrome/Chromium
- Navigate, click, type, extract data
- Screenshot capture, PDF generation
- Session persistence (cookie-based)
- Stealth mode (anti-bot detection)
- Platform connectors (LinkedIn, Indeed, Wellfound)
- Generic browser automation tools

**Tools Implemented:**
- ✅ linkedin_search_jobs, linkedin_get_job, linkedin_get_company
- ✅ indeed_search_jobs, indeed_get_job, indeed_get_company
- ✅ wellfound_search_jobs, wellfound_get_job, wellfound_get_company
- ✅ browser_navigate, browser_click, browser_type
- ✅ browser_extract, browser_screenshot, browser_pdf, browser_fillForm

**Testing:**
- 29 connector unit tests
- 23 parameter validation tests
- 100% pass rate
- CI/CD automation via GitHub Actions

---

### Engine 2: API Engine (Axios) 🔲 NOT STARTED

**Purpose:** HTTP/REST automation for external services

**Capabilities:**
- HTTP/REST requests (GET, POST, PUT, DELETE, PATCH)
- OAuth flows (Google, GitHub, LinkedIn, Stripe, etc.)
- Pagination handling
- Response parsing (JSON, XML, HTML)
- Rate limiting per endpoint
- Retry logic with exponential backoff
- Webhook management

**Tools to Build:**
- api_request - Generic HTTP request tool
- api_oauth_flow - OAuth 2.0 authentication
- api_paginate - Auto-pagination
- api_webhook_create - Set up webhooks
- api_webhook_list - List active webhooks

**Use Cases:**
- GitHub API automation
- Stripe payment operations
- Google APIs (Drive, Calendar, Gmail)
- Slack/Discord notifications
- Custom API integrations

---

### Engine 3: Database Engine (Prisma) 🔲 NOT STARTED

**Purpose:** SQL/NoSQL database operations

**Capabilities:**
- SQL operations (PostgreSQL, MySQL, SQLite)
- NoSQL operations (MongoDB, Redis)
- Transactions
- Migrations
- Backups
- Query builders
- Connection pooling

**Tools to Build:**
- db_query - Execute SQL queries
- db_insert - Insert records
- db_update - Update records
- db_delete - Delete records
- db_transaction - Multi-query transactions
- db_backup - Database backups
- db_migrate - Run migrations

**Supported Databases:**
- PostgreSQL (primary)
- MySQL/MariaDB
- SQLite (local)
- MongoDB (NoSQL)
- Redis (cache)

---

### Engine 4: Email Engine (Nodemailer) 🔲 NOT STARTED

**Purpose:** Email automation and management

**Capabilities:**
- Send emails (Gmail, Outlook, SMTP)
- Search inbox
- Extract data from emails
- Attachment handling (download, save)
- Email templates
- Bulk email operations
- Email parsing (extract structured data)

**Tools to Build:**
- email_send - Send email
- email_search - Search inbox
- email_get - Get email by ID
- email_download_attachment - Download attachments
- email_mark_read - Mark as read/unread
- email_delete - Delete emails
- email_template_send - Send templated emails

**Supported Providers:**
- Gmail (OAuth + SMTP)
- Outlook (OAuth + SMTP)
- Generic SMTP
- IMAP for reading

---

### Engine 5: File Engine (Node.js fs) 🔲 NOT STARTED

**Purpose:** File system operations and cloud storage

**Capabilities:**
- File operations (read, write, move, delete, copy)
- Directory operations (create, list, delete)
- Upload to cloud (S3, Google Drive, Dropbox)
- Download from URLs
- Format conversion (PDF, DOCX, CSV, JSON, XLSX)
- File compression (zip, tar)
- File encryption
- File watching (monitor changes)

**Tools to Build:**
- file_read - Read file contents
- file_write - Write file contents
- file_move - Move/rename files
- file_delete - Delete files
- file_upload_cloud - Upload to cloud storage
- file_download_url - Download from URL
- file_convert - Format conversion
- file_compress - Zip/archive files
- file_watch - Monitor file changes

**Cloud Integrations:**
- AWS S3
- Google Drive
- Dropbox
- OneDrive

---

### Engine 6: Cron Engine (node-cron) 🔲 NOT STARTED

**Purpose:** Scheduled task automation

**Capabilities:**
- Cron job scheduling
- Recurring tasks (daily, weekly, monthly)
- One-time scheduled tasks
- Task queues
- Job persistence (survives restarts)
- Job monitoring
- Error handling and retries
- Job history/logs

**Tools to Build:**
- cron_create - Create scheduled job
- cron_list - List all jobs
- cron_delete - Delete job
- cron_pause - Pause job
- cron_resume - Resume job
- cron_run_now - Execute job immediately
- cron_history - View job execution history

**Scheduling Patterns:**
- Cron syntax (standard)
- Natural language ("every Monday at 9am")
- Intervals ("every 5 minutes")
- Complex schedules ("first Monday of month")

---

### Engine 7: Vault Engine (AES-256) 🔲 NOT STARTED

**Purpose:** Secure credential storage and management

**Capabilities:**
- Encrypted storage (AES-256)
- OS keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Secure retrieval
- Export/import (encrypted)
- Credential rotation
- Access logging
- Multi-vault support (personal, work, project-specific)

**Tools to Build:**
- vault_set - Store credential
- vault_get - Retrieve credential
- vault_list - List credential names (not values)
- vault_delete - Delete credential
- vault_rotate - Update credential
- vault_export - Export encrypted vault
- vault_import - Import encrypted vault

**Credential Types:**
- API keys
- Passwords
- OAuth tokens
- SSH keys
- Certificates
- Environment variables

---

## SUPPORTING INFRASTRUCTURE

### Rate Limiter
- Global rate limiting across all engines
- Per-endpoint configuration
- Token bucket algorithm
- Burst allowances
- Backoff strategies

### Retry Manager
- Exponential backoff
- Circuit breakers
- Jitter for distributed systems
- Per-engine retry policies
- Max retry limits

### Session Manager
- Persist state across restarts
- Session recovery
- Multi-session support
- Session cleanup

### Audit Logger
- Track all actions (compliance)
- Structured logging (Winston)
- Log levels (debug, info, warn, error)
- Log rotation
- Export logs (JSON, CSV)

---

## PRODUCT RELATIONSHIPS

### Used By

**Claude Desktop:**
Standalone MCP client using Oktyv for all automation

**GREGORE:**
Includes Oktyv Pro, uses for all automation tasks across integrated products

**Consensus:**
Each AI instance can use Oktyv for automation tasks

**Web Apps (via API - future):**
- Buildr Web → Triggers Oktyv for deployments
- SCRVNR Web → Triggers Oktyv for file operations
- ConsciousnessBridge Web → Triggers Oktyv for exports
- Career System → Uses Oktyv for job applications

### Bundled In

**Consensus** (all tiers):
Oktyv Pro included free with Consensus Team/Enterprise

**GREGORE** (all tiers):
Oktyv Pro included free with GREGORE Consumer/Team/Enterprise

### Sold Standalone

**Oktyv Free:**
- Limited actions/day (10 browser, 100 API, 10 DB, 20 file, 5 email)
- Basic features
- Community support

**Oktyv Pro:**
- Unlimited automation across all engines
- All features available
- Priority support
- Advanced rate limiting

**Oktyv Enterprise:**
- Everything in Pro
- Team management (multi-user)
- SSO integration
- Audit logs and compliance
- SLA guarantees
- Dedicated support

---

## STRATEGIC ROLE IN ECOSYSTEM

### The Conversion Engine

**Funnel Position:**
Oktyv is the FIRST paid product users encounter after free tools (KERNL/SHIM)

**Why It Works:**
- Low friction (affordable entry point)
- High value (immediate automation across 7 domains)
- Creates yearning for more (upsell to Consensus/GREGORE)
- Natural progression: Free tools → Paid automation → Full ecosystem

### The Moat

**Competitive Advantage:**
Most AI products can only THINK. With Oktyv, your AI products can ACT.

**Lock-In:**
- User builds workflows dependent on Oktyv (7 engines)
- User's credential vault is in Oktyv (all API keys, passwords)
- User's scheduled automations live in Oktyv (cron jobs)
- User's browser sessions persist in Oktyv (stays logged in)
- Switching cost = losing entire automation infrastructure

### The Foundation

**Infrastructure Layer:**
Every product in the ecosystem uses Oktyv for external actions:
- GREGORE automates workflows via Oktyv (all engines)
- Buildr deploys apps via Oktyv (file + API)
- SCRVNR saves files via Oktyv (file engine)
- Career System applies to jobs via Oktyv (browser + email)
- Consensus coordinates AI instances via Oktyv (all engines)

**Removing Oktyv = removing hands from all AI agents**

---

## BUILD PLAN (NO TIME ESTIMATES)

### Phase 0: Foundation ✅ COMPLETE
- Git repository initialized
- TypeScript project configured
- MCP server skeleton
- Project registered with KERNL
- Documentation structure

### Phase 1: Browser Engine ✅ COMPLETE
- [x] Browser session manager
- [x] LinkedIn connector (search, jobs, companies)
- [x] Indeed connector (search, jobs, companies)
- [x] Wellfound connector (search, jobs, companies)
- [x] Generic browser tools (navigate, click, type, extract, screenshot, PDF, fillForm)
- [x] Rate limiting (token bucket)
- [x] Cookie persistence
- [x] Error handling and retry system
- [x] Comprehensive test suite (52 tests, 100% pass rate)
- [x] CI/CD automation (GitHub Actions)

**Status:** ✅ Complete (v0.2.0-alpha.2)

### Phase 2: API Engine 🔲 NEXT
**Priority:** HIGH

- [ ] Universal HTTP/REST client (GET, POST, PUT, DELETE, PATCH)
- [ ] OAuth 2.0 flow automation (Google, GitHub, Stripe, etc.)
- [ ] Pagination handler
- [ ] Response parser (JSON, XML)
- [ ] Rate limiter per endpoint
- [ ] Webhook management
- [ ] Common API integrations (GitHub, Stripe, Slack)
- [ ] Test suite for API tools

### Phase 3: Database Engine 🔲 PLANNED
**Priority:** HIGH

- [ ] Prisma integration
- [ ] PostgreSQL, MySQL, SQLite support
- [ ] MongoDB (NoSQL) support
- [ ] Transaction handling
- [ ] Backup automation
- [ ] Migration runner
- [ ] Test suite for database tools

### Phase 4: Vault Engine 🔲 PLANNED
**Priority:** HIGH (needed before production)

- [ ] AES-256 encryption
- [ ] OS keychain integration
- [ ] Secure credential storage/retrieval
- [ ] Multiple vault support
- [ ] Export/import (encrypted)
- [ ] Access logging
- [ ] Test suite for vault tools

### Phase 5: File Engine 🔲 PLANNED
**Priority:** MEDIUM

- [ ] Local file operations (CRUD)
- [ ] Cloud storage (S3, Google Drive, Dropbox)
- [ ] Format conversion (PDF, DOCX, XLSX, CSV)
- [ ] Archive operations (ZIP, TAR)
- [ ] File watching
- [ ] Encryption/decryption
- [ ] Test suite for file tools

### Phase 6: Email Engine 🔲 PLANNED
**Priority:** MEDIUM

- [ ] Nodemailer integration
- [ ] Gmail/Outlook (OAuth + SMTP)
- [ ] Inbox search and parsing (IMAP)
- [ ] Attachment handling
- [ ] Template rendering
- [ ] Bulk operations
- [ ] Test suite for email tools

### Phase 7: Cron Engine 🔲 PLANNED
**Priority:** MEDIUM

- [ ] node-cron integration
- [ ] Cron syntax support
- [ ] Natural language scheduling
- [ ] Task persistence
- [ ] Job history and logs
- [ ] Error handling and retries
- [ ] Test suite for cron tools

### Phase 8: Orchestration & Polish 🔲 FUTURE
**Priority:** LOW (after all 7 engines)

- [ ] Multi-engine workflows
- [ ] Conditional logic
- [ ] Error recovery
- [ ] Parallel execution
- [ ] Workflow templates
- [ ] Monitoring/observability
- [ ] Web API (REST endpoint for web apps)
- [ ] Team management (multi-user)
- [ ] SSO integration

**Target:** v1.0.0 production release (all 7 engines complete)

---

## USE CASES (ALL ENGINES)

### Job Search Automation (Browser + Email + DB)
```
User: "Search LinkedIn for 100 VP Operations jobs"

Oktyv:
1. Browser Engine → Navigate LinkedIn, scrape jobs
2. API Engine → Call Indeed API for additional jobs
3. Database Engine → Save to local PostgreSQL
4. Email Engine → Send summary to user
5. Cron Engine → Repeat daily
```

### App Deployment (File + API + Vault)
```
User: "Deploy this app to Vercel"

Buildr Web → API call to Oktyv
Oktyv:
1. Vault Engine → Retrieve Vercel API key
2. File Engine → Save deployment config locally
3. API Engine → Call Vercel API for deployment
4. Database Engine → Log deployment history
5. Email Engine → Send deployment confirmation
```

### Research Automation (Browser + File + Cron)
```
User: "Download PDFs from these 50 paper links daily"

Oktyv:
1. Browser Engine → Navigate to each link
2. File Engine → Download PDFs to local folder
3. Database Engine → Track download status
4. Cron Engine → Schedule daily runs
5. Email Engine → Daily summary report
```

### Data Pipeline (API + Database + Cron)
```
User: "Pull Stripe data hourly and sync to PostgreSQL"

Oktyv:
1. Vault Engine → Retrieve Stripe API key
2. API Engine → Fetch transactions
3. Database Engine → Insert/update PostgreSQL
4. Cron Engine → Run hourly
5. Email Engine → Alert on errors
```

---

## INTEGRATION WITH META-STRATEGY

### Standalone Positioning
Oktyv is complete and powerful as standalone product for users who just want automation without full GREGORE ecosystem.

**Value Proposition:**
- Universal automation across 7 domains
- Replace multiple SaaS tools (Zapier, IFTTT, cron-job.org, password managers)
- Local-first (privacy, security, speed)
- No vendor lock-in (export workflows, vault)

### GREGORE Meta-Value
When integrated with GREGORE:
- Cross-product automation (Buildr → SCRVNR → Deploy)
- Context-aware scheduling (knows your calendar, priorities)
- Unified credential management (one vault for all products)
- Workflow orchestration (multi-step automations across products)
- Shared browser sessions (all products use same logged-in state)

### Enterprise Value
When integrated with Consensus:
- Each AI instance gets full automation capabilities
- Parallel automation (3 AIs scraping different sources simultaneously)
- Coordinated workflows (AI-1 researches, AI-2 writes, AI-3 deploys)
- Team-wide vault (shared credentials, scoped access)

---

## DISTRIBUTION MODELS

### Standalone Installation

**npm (cross-platform):**
```bash
npm install -g oktyv
oktyv start
```

**Homebrew (Mac):**
```bash
brew install oktyv
oktyv start
```

**Windows Installer:**
Download oktyv-setup.exe, run installer

### Bundled Installation

**GREGORE:**
Oktyv included in GREGORE installer, auto-starts with GREGORE

**Consensus:**
Oktyv included in Consensus installer, available to all AI instances

### MCP Client Compatibility

Works with any MCP-compatible client:
- Claude Desktop
- GREGORE Desktop
- Consensus instances
- Custom MCP clients
- Future MCP ecosystem products

---

## PERFORMANCE TARGETS

### Latency
- Browser operations: <500ms (excluding page render)
- API requests: <200ms
- File operations: <100ms
- Database queries: <50ms
- Vault operations: <50ms

### Throughput
- Concurrent browser sessions: 3-5
- API requests: 1000/min
- File operations: 100/min
- Database transactions: 500/min

### Resource Usage
- Memory: <1GB total (all engines)
- CPU: <10% idle, <50% active
- Disk: <500MB (excluding user data)

---

## REFERENCE

**Parent Strategy:** D:\Meta\PRODUCT_STRATEGY.md  
**Product Portfolio:** D:\Meta\PRODUCT_PORTFOLIO.md  
**Product Registry:** D:\Meta\PRODUCT_REGISTRY.md

---

## VERSION HISTORY

**v1.1.0 (2026-01-24):**
- Updated status: Browser Engine COMPLETE (not IN PROGRESS)
- Removed all time estimates (Month X phasing)
- Clarified goal: ALL 7 engines (universal automation layer)
- Updated build plan with priority order
- Added CURRENT STATUS section for quick reference

**v1.0.0 (2026-01-24):**
- Initial comprehensive vision document
- Defined complete scope (7 engines)
- Established roadmap
- Clarified integration points
- Documented use cases across all engines
- Migrated from AUTOPILOT_VISION.md

---

**Last Updated:** 2026-01-24  
**Next Review:** After next engine completion
