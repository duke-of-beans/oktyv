# Oktyv Implementation Roadmap
**7-Engine Universal Automation Layer**

Version: 1.0.0  
Created: 2026-01-24  
Target Completion: v1.0.0 by 2026 Q3

---

## Overview

Oktyv is the complete universal automation infrastructure with 7 core engines. This roadmap details the implementation plan for each engine.

**Current Status:** Phase 1 (Browser Engine) - In Progress  
**Next Milestone:** Complete Browser Engine (v0.2.0)

---

## Phase 0: Foundation ✅ COMPLETE

**Timeline:** 2026-01-22 (1 day)  
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

## Phase 1: Browser Engine (Puppeteer) ⚠️ IN PROGRESS

**Timeline:** 2026-01-22 to 2026-02-15 (3-4 weeks)  
**Version Target:** v0.2.0  
**Priority:** HIGH (Currently needed for Career System)

### Objectives
Build complete browser automation system with session persistence, platform connectors, and intelligent navigation.

### Core Components

#### 1.1 Browser Session Manager ✅ COMPLETE
- [x] Puppeteer integration
- [x] Cookie-based session persistence
- [x] Headless/headed mode switching
- [x] User data directory management
- [x] Browser lifecycle management

#### 1.2 LinkedIn Connector ✅ ALPHA COMPLETE
- [x] linkedin_search_jobs tool
- [x] linkedin_get_job tool  
- [x] linkedin_get_company tool
- [x] Rate limiting (token bucket, 10 req/min)
- [x] Error handling with retries
- [ ] Unit tests (80% coverage target)
- [ ] Integration tests (real LinkedIn validation)

#### 1.3 Indeed Connector 📋 TODO
- [ ] indeed_search_jobs tool
- [ ] indeed_get_job tool
- [ ] indeed_get_company tool
- [ ] Rate limiting (20 req/min)
- [ ] Error handling
- [ ] Tests

**Estimated:** 3-5 days

#### 1.4 Wellfound (AngelList) Connector 📋 TODO
- [ ] wellfound_search_jobs tool
- [ ] wellfound_get_job tool
- [ ] wellfound_get_company tool
- [ ] Rate limiting
- [ ] Error handling
- [ ] Tests

**Estimated:** 3-5 days

#### 1.5 Generic Browser Tools 📋 TODO
- [ ] browser_navigate - Go to URL
- [ ] browser_click - Click element
- [ ] browser_type - Type text
- [ ] browser_extract - Extract data via selector
- [ ] browser_screenshot - Capture screenshot
- [ ] browser_pdf - Generate PDF
- [ ] browser_form_fill - Fill forms automatically

**Estimated:** 5-7 days

### Phase 1 Success Criteria
- ✅ LinkedIn connector production-ready (3/3 tools working)
- 📋 Indeed connector complete
- 📋 Wellfound connector complete
- 📋 Generic browser tools working
- 📋 80%+ test coverage
- 📋 Documentation complete
- 📋 Real-world validation (50+ job searches)

**Timeline:** ~3-4 weeks total  
**Risk:** Low (foundation is solid, just needs expansion)

---

## Phase 2: API Engine (Axios) 📋 NEXT UP

**Timeline:** 2026-02-15 to 2026-03-15 (4 weeks)  
**Version Target:** v0.3.0  
**Priority:** HIGH (Needed for TESSRYX, Consensus, SCRVNR)

### Objectives
Build universal HTTP/REST automation with OAuth support, pagination, and rate limiting.

### Core Components

#### 2.1 HTTP Request Tools
- [ ] api_request - Generic HTTP client (GET/POST/PUT/DELETE/PATCH)
  - Header management
  - Query parameters
  - Request body (JSON, form-data, multipart)
  - Response parsing (JSON, XML, text, binary)
  - Timeout configuration
  - Retry logic with exponential backoff

**Estimated:** 3-4 days

#### 2.2 OAuth 2.0 Automation
- [ ] api_oauth_flow - OAuth 2.0 authentication
  - Authorization code flow
  - Client credentials flow
  - Refresh token handling
  - Token storage (encrypted)
  - Common providers (Google, GitHub, LinkedIn, Stripe)

**Estimated:** 5-7 days

#### 2.3 Pagination Handler
- [ ] api_paginate - Auto-pagination
  - Cursor-based pagination
  - Offset/limit pagination
  - Link header pagination
  - Custom pagination logic

**Estimated:** 2-3 days

#### 2.4 Common API Integrations
- [ ] GitHub API (repos, issues, PRs)
- [ ] Stripe API (customers, payments)
- [ ] Slack API (messages, channels)
- [ ] Google APIs (Drive, Calendar, Gmail)

**Estimated:** 7-10 days

#### 2.5 Rate Limiting & Retry
- [ ] Per-endpoint rate limiting
- [ ] Retry with exponential backoff
- [ ] Circuit breaker pattern
- [ ] Request queueing

**Estimated:** 3-4 days

### Phase 2 Success Criteria
- 📋 Universal HTTP tool working
- 📋 OAuth flows for 4+ major providers
- 📋 Pagination auto-handling
- 📋 4+ API integrations complete
- 📋 80%+ test coverage
- 📋 Documentation with examples

**Timeline:** 4 weeks  
**Risk:** Medium (OAuth flows can be tricky, need careful testing)

---

## Phase 3: File Engine + Vault Engine 📋 PLANNED

**Timeline:** 2026-03-15 to 2026-04-15 (4 weeks)  
**Version Target:** v0.4.0  
**Priority:** MEDIUM (Needed for SCRVNR, Buildr, Research)

### Why Combined?
File operations often need credentials (S3, Google Drive), so vault must exist first.

### 3.1 Vault Engine (AES-256)

#### 3.1.1 Core Vault
- [ ] vault_set - Store credential (AES-256 encryption)
- [ ] vault_get - Retrieve credential
- [ ] vault_list - List credential names
- [ ] vault_delete - Delete credential
- [ ] Master password/key management

**Estimated:** 4-5 days

#### 3.1.2 OS Keychain Integration
- [ ] macOS Keychain integration
- [ ] Windows Credential Manager integration
- [ ] Linux Secret Service integration
- [ ] Fallback to encrypted file

**Estimated:** 5-7 days

#### 3.1.3 Vault Features
- [ ] vault_export - Export encrypted vault
- [ ] vault_import - Import encrypted vault
- [ ] vault_rotate - Rotate credential
- [ ] Access logging

**Estimated:** 3-4 days

### 3.2 File Engine (Node.js fs)

#### 3.2.1 Local File Operations
- [ ] file_read - Read file contents
- [ ] file_write - Write file contents
- [ ] file_move - Move/rename files
- [ ] file_delete - Delete files
- [ ] file_copy - Copy files
- [ ] file_mkdir - Create directory
- [ ] file_list - List directory

**Estimated:** 3-4 days

#### 3.2.2 Cloud Storage
- [ ] AWS S3 integration
- [ ] Google Drive integration
- [ ] Dropbox integration
- [ ] file_upload_cloud - Upload to cloud
- [ ] file_download_cloud - Download from cloud

**Estimated:** 7-10 days

#### 3.2.3 File Utilities
- [ ] file_convert - Format conversion (PDF, DOCX, XLSX, CSV, JSON)
- [ ] file_compress - Zip/tar archiving
- [ ] file_encrypt - Encrypt files
- [ ] file_watch - Monitor file changes

**Estimated:** 5-7 days

### Phase 3 Success Criteria
- 📋 Vault engine complete (all CRUD operations)
- 📋 OS keychain integration (3 platforms)
- 📋 Local file operations working
- 📋 Cloud storage (S3, Drive, Dropbox)
- 📋 Format conversion tools
- 📋 80%+ test coverage

**Timeline:** 4 weeks  
**Risk:** Medium (Cloud integrations require careful OAuth handling, format conversion needs libraries)

---

## Phase 4: Database Engine (Prisma) 📋 PLANNED

**Timeline:** 2026-04-15 to 2026-05-15 (4 weeks)  
**Version Target:** v0.5.0  
**Priority:** MEDIUM (Needed for TESSRYX, Career System, data persistence)

### Objectives
Build SQL/NoSQL database automation with transaction support, migrations, and backups.

### 4.1 PostgreSQL Support
- [ ] Prisma integration
- [ ] db_query - Execute SQL queries
- [ ] db_insert - Insert records
- [ ] db_update - Update records
- [ ] db_delete - Delete records
- [ ] db_transaction - Multi-query transactions

**Estimated:** 5-7 days

### 4.2 Additional SQL Databases
- [ ] MySQL/MariaDB support
- [ ] SQLite support (local)
- [ ] Connection pooling
- [ ] Query builder helpers

**Estimated:** 5-7 days

### 4.3 NoSQL Support
- [ ] MongoDB integration
- [ ] Redis integration (cache)
- [ ] Document CRUD operations

**Estimated:** 5-7 days

### 4.4 Database Utilities
- [ ] db_backup - Database backups
- [ ] db_restore - Restore from backup
- [ ] db_migrate - Run migrations
- [ ] db_seed - Seed test data

**Estimated:** 4-5 days

### Phase 4 Success Criteria
- 📋 PostgreSQL fully working
- 📋 MySQL + SQLite support
- 📋 MongoDB + Redis support
- 📋 Transaction handling
- 📋 Backup/restore utilities
- 📋 80%+ test coverage

**Timeline:** 4 weeks  
**Risk:** Low (Prisma is mature, well-documented)

---

## Phase 5: Email Engine (Nodemailer) 📋 PLANNED

**Timeline:** 2026-05-15 to 2026-06-15 (4 weeks)  
**Version Target:** v0.6.0  
**Priority:** MEDIUM (Needed for notifications, Career System follow-ups)

### Objectives
Build email automation for sending, receiving, parsing, and managing emails.

### 5.1 Send Email
- [ ] Nodemailer integration
- [ ] email_send - Send email
- [ ] Gmail SMTP support (OAuth)
- [ ] Outlook SMTP support
- [ ] Generic SMTP support
- [ ] HTML email templates
- [ ] Attachment handling

**Estimated:** 5-7 days

### 5.2 Read Email (IMAP)
- [ ] IMAP integration
- [ ] email_search - Search inbox
- [ ] email_get - Get email by ID
- [ ] email_list - List emails
- [ ] email_download_attachment - Download attachments

**Estimated:** 5-7 days

### 5.3 Email Management
- [ ] email_mark_read - Mark as read/unread
- [ ] email_move - Move to folder
- [ ] email_delete - Delete email
- [ ] email_archive - Archive email

**Estimated:** 3-4 days

### 5.4 Email Parsing
- [ ] Extract structured data from emails
- [ ] Parse common formats (receipts, confirmations)
- [ ] Email template system

**Estimated:** 4-5 days

### Phase 5 Success Criteria
- 📋 Gmail integration (OAuth + SMTP + IMAP)
- 📋 Outlook integration
- 📋 Send/receive/parse emails
- 📋 Attachment handling
- 📋 Template system
- 📋 80%+ test coverage

**Timeline:** 4 weeks  
**Risk:** Medium (OAuth for Gmail/Outlook can be complex, IMAP parsing needs care)

---

## Phase 6: Cron Engine (node-cron) 📋 PLANNED

**Timeline:** 2026-06-15 to 2026-07-15 (4 weeks)  
**Version Target:** v0.7.0  
**Priority:** MEDIUM (Needed for scheduled automation, GREGORE workflows)

### Objectives
Build scheduled task automation with job persistence, monitoring, and error recovery.

### 6.1 Job Scheduling
- [ ] node-cron integration
- [ ] cron_create - Create scheduled job
- [ ] cron_delete - Delete job
- [ ] cron_pause - Pause job
- [ ] cron_resume - Resume job
- [ ] Cron syntax parser

**Estimated:** 4-5 days

### 6.2 Job Persistence
- [ ] Job storage (survives restarts)
- [ ] Job history/logs
- [ ] Job state management
- [ ] Missed job handling (catch-up)

**Estimated:** 4-5 days

### 6.3 Advanced Scheduling
- [ ] Natural language scheduling ("every Monday at 9am")
- [ ] Timezone support
- [ ] Complex schedules ("first Monday of month")
- [ ] Job dependencies (job B runs after job A)

**Estimated:** 5-7 days

### 6.4 Job Monitoring
- [ ] cron_list - List all jobs
- [ ] cron_history - View execution history
- [ ] Job execution stats
- [ ] Error tracking and alerts

**Estimated:** 4-5 days

### Phase 6 Success Criteria
- 📋 Cron job creation/management
- 📋 Job persistence across restarts
- 📋 Natural language scheduling
- 📋 Job monitoring/history
- 📋 Error handling/retries
- 📋 80%+ test coverage

**Timeline:** 4 weeks  
**Risk:** Low (node-cron is stable, persistence is straightforward)

---

## Phase 7: Polish + Production 📋 PLANNED

**Timeline:** 2026-07-15 to 2026-08-15 (4 weeks)  
**Version Target:** v1.0.0 🎉  
**Priority:** HIGH (Production release)

### Objectives
Polish all engines, add enterprise features, comprehensive testing, production deployment.

### 7.1 Web API (REST Endpoint)
- [ ] Express server for web apps
- [ ] REST API for all tools
- [ ] Authentication (API keys)
- [ ] Rate limiting per API key
- [ ] CORS configuration

**Estimated:** 5-7 days

### 7.2 Enterprise Features
- [ ] Team management (multi-user)
- [ ] SSO integration (SAML, OAuth)
- [ ] Role-based access control (RBAC)
- [ ] Audit logging (compliance)
- [ ] Tenant isolation

**Estimated:** 7-10 days

### 7.3 Testing & QA
- [ ] Comprehensive unit tests (90%+ coverage)
- [ ] Integration tests for all engines
- [ ] End-to-end test suite
- [ ] Performance testing
- [ ] Security audit

**Estimated:** 7-10 days

### 7.4 Documentation
- [ ] Complete API documentation
- [ ] User guides for each engine
- [ ] Integration examples
- [ ] Deployment guide
- [ ] Troubleshooting guide

**Estimated:** 5-7 days

### Phase 7 Success Criteria
- 📋 Web API complete
- 📋 Enterprise features implemented
- 📋 90%+ test coverage
- 📋 Complete documentation
- 📋 Production deployment ready
- 📋 v1.0.0 release! 🎉

**Timeline:** 4 weeks  
**Risk:** Low (mostly polish and documentation)

---

## Milestones Summary

| Phase | Version | Timeline | Status |
|-------|---------|----------|--------|
| Phase 0: Foundation | v0.1.0 | 2026-01-22 | ✅ Complete |
| Phase 1: Browser Engine | v0.2.0 | 2026-01-22 to 2026-02-15 | ⚠️ In Progress |
| Phase 2: API Engine | v0.3.0 | 2026-02-15 to 2026-03-15 | 📋 Planned |
| Phase 3: File + Vault | v0.4.0 | 2026-03-15 to 2026-04-15 | 📋 Planned |
| Phase 4: Database Engine | v0.5.0 | 2026-04-15 to 2026-05-15 | 📋 Planned |
| Phase 5: Email Engine | v0.6.0 | 2026-05-15 to 2026-06-15 | 📋 Planned |
| Phase 6: Cron Engine | v0.7.0 | 2026-06-15 to 2026-07-15 | 📋 Planned |
| Phase 7: Production | v1.0.0 | 2026-07-15 to 2026-08-15 | 📋 Planned |

**Total Timeline:** ~7 months (2026-01-22 to 2026-08-15)  
**Target Release:** v1.0.0 by August 2026

---

## Risks & Mitigations

### High-Risk Areas
1. **OAuth Flows (Phase 2)** - Complex, provider-specific quirks
   - Mitigation: Use battle-tested libraries, extensive testing
   
2. **Cloud Storage (Phase 3)** - API rate limits, file size limits
   - Mitigation: Implement chunked uploads, retry logic
   
3. **Email IMAP (Phase 5)** - Email parsing is messy, formats vary
   - Mitigation: Use robust parsing libraries, extensive test suite

### Medium-Risk Areas
1. **Database Migrations (Phase 4)** - Schema changes can be tricky
   - Mitigation: Use Prisma migrations, extensive testing
   
2. **Cron Persistence (Phase 6)** - Job recovery after crashes
   - Mitigation: Checkpoint frequently, test crash recovery

---

## Dependencies & Blockers

### External Dependencies
- Puppeteer (stable, mature)
- Axios (stable, mature)
- Prisma (stable, mature)
- Nodemailer (stable, mature)
- node-cron (stable, mature)

**Risk:** Low - all core dependencies are stable, well-maintained

### Project Dependencies
- **TESSRYX** depends on Oktyv Phase 6/7 (parallel execution via cron)
  - Decision: Build parallel execution in TESSRYX now, migrate to Oktyv later
  
- **Career System** depends on Oktyv Phase 1 (browser automation)
  - Status: Phase 1 in progress, on track

---

## Success Metrics

### Technical Metrics
- **Test Coverage:** 80%+ (target: 90%)
- **Uptime:** 99.9% (production SLA)
- **Latency:** <500ms per operation (target achieved)
- **Memory:** <1GB total footprint

### Business Metrics
- **Adoption:** 100+ active users by v1.0.0
- **Retention:** 80%+ month-over-month
- **Upsell:** 30%+ free → pro conversion
- **Satisfaction:** 4.5+ stars (user ratings)

---

## Next Actions

1. **Immediate (This Week):**
   - [ ] Complete LinkedIn connector testing
   - [ ] Build Indeed connector
   - [ ] Start generic browser tools

2. **Short-Term (Next 2 Weeks):**
   - [ ] Complete Phase 1 (Browser Engine)
   - [ ] Release v0.2.0
   - [ ] Begin Phase 2 (API Engine)

3. **Medium-Term (Next Month):**
   - [ ] Complete Phase 2 (API Engine)
   - [ ] Begin Phase 3 (File + Vault)

---

**Last Updated:** 2026-01-24  
**Owner:** David Kirsch  
**Review Frequency:** Weekly during active development
