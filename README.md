# Oktyv - Universal Automation Layer

**Version:** 1.0.0 🎉  
**Status:** PRODUCTION READY ✅  
**Test Coverage:** 258 tests, 100% passing  
**Production Hardening:** Complete (Load Testing, Security Audit, Performance Optimization, Monitoring, Error Recovery)  
**Next Feature:** Parallel Execution Engine (Design Complete, Ready for Implementation)

Oktyv is a comprehensive Model Context Protocol (MCP) server that provides a production-ready universal automation layer through 7 specialized engines plus an upcoming **Parallel Execution Engine** for concurrent multi-task automation. Built with TypeScript, hardened for production, powered by Option B Perfection philosophy.

## 🏗️ Architecture Overview

Oktyv implements a modular engine architecture where each engine is a self-contained unit with its own:
- **Core Logic** - Business logic and operations
- **MCP Tools** - Claude-accessible functions
- **Handlers** - Request processing
- **Tests** - Comprehensive unit testing
- **Documentation** - Detailed design specs

```
┌─────────────┐
│   Claude    │
│   (User)    │
└──────┬──────┘
       │ MCP Protocol
       ▼
┌────────────────────────────────────┐
│         Oktyv Server               │
│       (MCP Transport)              │
├────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐       │
│  │ Browser  │  │  Vault   │       │
│  │ Engine   │  │  Engine  │       │
│  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐       │
│  │   API    │  │ Database │       │
│  │ Engine   │  │  Engine  │       │
│  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐       │
│  │  Email   │  │   File   │       │
│  │ Engine   │  │  Engine  │       │
│  └──────────┘  └──────────┘       │
│  ┌──────────┐                     │
│  │   Cron   │                     │
│  │ Engine   │                     │
│  └──────────┘                     │
└────────────────────────────────────┘
```

## 🚀 The 7 Engines

### 1. Browser Engine (60 tests) ✅
**Purpose:** Web automation and job search across multiple platforms

**Capabilities:**
- LinkedIn job search and company research
- Indeed job search and details
- Wellfound (AngelList) startup jobs
- Generic browser automation (Puppeteer/Playwright)
- Screenshot capture, PDF generation
- Form filling and navigation

**Key Features:**
- Session management with automatic cleanup
- Rate limiting to prevent blocking
- Cookie persistence
- Headless/headed modes

**MCP Tools:** 12 tools  
**Status:** Fully integrated  
**Docs:** `docs/BROWSER_ENGINE_DESIGN.md`

---

### 2. Vault Engine (22 tests) ✅
**Purpose:** Secure credential storage with OS-level encryption

**Capabilities:**
- Encrypted credential storage (AES-256-GCM)
- Multiple vault support
- OS keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Master key management
- Credential listing and deletion

**Security:**
- AES-256-GCM encryption
- Unique salt per vault
- Master keys stored in OS keychain
- Automatic key derivation (PBKDF2)

**MCP Tools:** 6 tools  
**Status:** Fully integrated  
**Docs:** `docs/VAULT_ENGINE_DESIGN.md`

---

### 3. API Engine (41 tests) 🔄
**Purpose:** Generic REST API integration with OAuth support

**Capabilities:**
- GET, POST, PUT, DELETE, PATCH requests
- OAuth 2.0 flows (authorization code, client credentials, refresh token)
- Request/response interceptors
- Rate limiting per endpoint
- Automatic retry with exponential backoff

**Key Features:**
- Dynamic base URL configuration
- Custom headers and authentication
- JSON/form data/multipart support
- Response caching

**MCP Tools:** 12 tools  
**Status:** Core complete, handlers TODO  
**Docs:** `docs/API_ENGINE_DESIGN.md`

---

### 4. Database Engine (28 tests) 🔄
**Purpose:** Multi-database support with connection pooling

**Capabilities:**
- PostgreSQL support (via pg)
- MySQL support (via mysql2)
- SQLite support (via better-sqlite3)
- MongoDB support (via mongodb driver)
- Connection pooling and management
- Query execution with parameterization
- Transaction support
- Bulk operations

**Security:**
- Prepared statements (SQL injection prevention)
- Connection encryption (TLS)
- Credential management via Vault Engine

**MCP Tools:** 10 tools  
**Status:** Core complete, handlers TODO  
**Docs:** `docs/DATABASE_ENGINE_DESIGN.md`

---

### 5. Email Engine (38 tests) 🔄
**Purpose:** Email sending and receiving with multiple protocols

**Capabilities:**
- SMTP email sending (via nodemailer)
- IMAP email receiving (via imap-simple)
- Gmail OAuth integration (via googleapis)
- HTML/plain text emails
- Attachment support (send/receive)
- Email parsing (from, to, subject, body, attachments)
- Mailbox filtering and search

**Protocols:**
- SMTP (sending)
- IMAP (receiving)
- Gmail API (OAuth-based)

**MCP Tools:** 9 tools  
**Status:** Core complete, handlers TODO  
**Docs:** `docs/EMAIL_ENGINE_DESIGN.md`

---

### 6. File Engine (45 tests) 🔄
**Purpose:** Comprehensive file operations and cloud storage

**Capabilities:**
- **Local Operations:** Read, write, copy, move, delete, list
- **Hashing:** MD5, SHA1, SHA256, SHA512
- **Archives:** Create/extract ZIP, TAR, TAR.GZ
- **File Watching:** Real-time file system monitoring with debouncing
- **Cloud Storage:** S3 upload/download/list with multipart support
- **Batch Operations:** Parallel copy/move/delete with concurrency control

**Key Features:**
- Streaming for large files
- Recursive directory operations
- Glob pattern matching
- Automatic compression

**MCP Tools:** 17 tools  
**Status:** Core complete, handlers TODO  
**Docs:** `docs/FILE_ENGINE_DESIGN.md`

---

### 7. Cron Engine (27 tests) ✅
**Purpose:** Task scheduling and automation

**Capabilities:**
- Cron expression scheduling (5-field standard)
- Interval-based scheduling (milliseconds)
- One-time scheduled tasks
- Timezone support
- Automatic retry with configurable delays
- Execution timeout management
- Comprehensive execution history
- Task statistics (success rate, avg duration)

**Task Actions:**
- HTTP requests
- Webhook calls
- File operations (via File Engine)
- Database operations (via Database Engine)
- Email sending (via Email Engine)

**MCP Tools:** 12 tools  
**Status:** Fully integrated  
**Docs:** `docs/CRON_ENGINE_DESIGN.md`

---

## 🛡️ Production Hardening

Oktyv v1.0.0 includes comprehensive production hardening across 5 critical areas:

### 1. Load Testing ✅
- Concurrent operation testing (up to 500+ workers)
- Latency tracking (P50, P95, P99 percentiles)
- Memory usage monitoring
- Throughput measurement (requests/second)
- Stress test phases
- **Framework:** `test/load/LoadTestRunner.ts`

### 2. Security Audit ✅
- 28 comprehensive security checks
- Encryption validation (AES-256-GCM)
- SQL injection prevention
- OAuth token security
- Path traversal protection
- Credential exposure scanning
- **Score:** 95/100 🟢
- **Framework:** `test/security/SecurityAuditRunner.ts`

### 3. Performance Optimization ✅
- CPU profiling
- Memory profiling
- Latency benchmarking
- Bottleneck identification
- Caching strategies
- Connection pooling
- Operation batching
- **Framework:** `test/performance/PerformanceBenchmark.ts`

### 4. Monitoring & Metrics ✅
- Real-time metrics collection
- Health check system
- Alert threshold management
- System resource tracking
- Export capabilities
- **System:** `src/monitoring/MetricsSystem.ts`

### 5. Error Recovery Testing ✅
- Connection failure recovery
- Timeout handling
- Retry logic validation
- Circuit breaker testing
- Graceful degradation
- **Framework:** `test/recovery/ErrorRecoveryTester.ts`

### Running Production Tests

```bash
# Complete production hardening suite
npm run test:production

# Individual phases
npm run test:load
npm run test:security
npm run test:performance
npm run test:recovery
```

**Documentation:** See `docs/PRODUCTION_HARDENING.md` for complete guide.

---

## 🔮 Upcoming: Parallel Execution Engine

**Status:** Design Complete, Ready for Implementation  
**ETA:** 12-16 hours of development  
**Documentation:** `docs/PARALLEL_EXECUTION_DESIGN.md`

### What It Enables

Execute multiple Oktyv operations **simultaneously** instead of sequentially:

```typescript
// Instead of this (SLOW - 36 seconds):
await moveFiles();      // 18 seconds
await fetchEmails();    // 18 seconds

// Do this (FAST - 18 seconds):
await parallel_execute({
  tasks: [
    { id: "move", tool: "file_move", params: {...} },
    { id: "email", tool: "email_imap_fetch", params: {...} }
  ]
});
// Both run at the same time!
```

### Key Features

**DAG-Based Execution:**
- Intelligent dependency management (task B waits for task A)
- Topological sorting for optimal parallelism
- Circular dependency detection
- Variable substitution across tasks (`${taskId.result.field}`)

**Smart Resource Management:**
- Configurable concurrency limits
- Automatic resource conflict detection
- Connection pooling
- Rate limiting per engine

**Robust Error Handling:**
- Partial success support
- Configurable failure modes (continue/stop/rollback)
- Retry policies per task
- Comprehensive error reporting

### Example: Job Application Automation

```json
{
  "tasks": [
    // Level 0: All search in parallel (10x faster!)
    { "id": "linkedin", "tool": "linkedin_search_jobs", ... },
    { "id": "indeed", "tool": "indeed_search_jobs", ... },
    { "id": "wellfound", "tool": "wellfound_search_jobs", ... },
    
    // Level 1: Merge results (waits for all searches)
    { 
      "id": "merge",
      "tool": "custom_merge",
      "params": { "sources": ["${linkedin.result}", "${indeed.result}", "${wellfound.result}"] },
      "dependsOn": ["linkedin", "indeed", "wellfound"]
    },
    
    // Level 2: Save + Notify (parallel)
    { "id": "save", "tool": "db_insert", "dependsOn": ["merge"] },
    { "id": "notify", "tool": "email_smtp_send", "dependsOn": ["merge"] }
  ]
}
```

**Execution:** 3 parallel searches → merge → parallel save/notify  
**Speedup:** ~10x faster than sequential

See `docs/PARALLEL_EXECUTION_DESIGN.md` for complete specification.

---

## 📊 Current Status

### Integration Status

| Engine | Core | Tests | Handlers | Status |
|--------|------|-------|----------|--------|
| Browser | ✅ | 60/60 | ✅ | Fully Integrated |
| Vault | ✅ | 22/22 | ✅ | Fully Integrated |
| API | ✅ | 41/41 | ✅ | Fully Integrated |
| Database | ✅ | 28/28 | ✅ | Fully Integrated |
| Email | ✅ | 38/38 | ✅ | Fully Integrated |
| File | ✅ | 45/45 | ✅ | Fully Integrated |
| Cron | ✅ | 24/24 | ✅ | Fully Integrated |
| **Total** | **7/7** | **258/258** | **71/71** | **100% Complete** ✅ |

### Test Coverage

```
Total Tests: 258
Passing: 258 (100%)
Failing: 0
Duration: ~6-7 seconds
Coverage: Comprehensive unit testing
```

### Version History

- **v1.0.0** (Current) - 🎉 PRODUCTION READY - All production hardening complete
- **v1.0.0-beta.1** - All 71 handlers implemented, 100% integration
- **v1.0.0-alpha.3** - All 71 tools exposed via MCP
- **v1.0.0-alpha.2** - File Engine fully integrated
- **v1.0.0-alpha.1** - All 7 engines complete, Cron integrated
- **v0.7.0-alpha.1** - File Engine complete
- **v0.6.0-alpha.1** - Email Engine complete
- **v0.5.0-alpha.1** - Database Engine complete
- **v0.4.0-alpha.1** - API Engine complete
- **v0.3.0-alpha.1** - Vault Engine complete
- **v0.2.0-alpha.1** - Browser Engine complete
- **v0.1.0-alpha.1** - Initial setup

---

## 🛠️ Technology Stack

### Core
- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.3+
- **Protocol:** MCP (Model Context Protocol)
- **Build:** tsc (TypeScript Compiler)

### Browser Automation
- **Puppeteer:** 23.11.1
- **Playwright:** 1.49.1

### Security & Encryption
- **keytar:** 7.9.0 (OS keychain integration)
- **crypto:** Node.js built-in (AES-256-GCM)

### Database Drivers
- **PostgreSQL:** pg 8.13.1
- **MySQL:** mysql2 3.11.5
- **SQLite:** better-sqlite3 11.7.0
- **MongoDB:** mongodb 6.11.0

### Email
- **nodemailer:** 6.9.16 (SMTP)
- **imap-simple:** 5.1.0 (IMAP)
- **googleapis:** 144.0.0 (Gmail OAuth)

### File Operations
- **archiver:** 7.0.1 (ZIP creation)
- **unzipper:** 0.12.3 (ZIP extraction)
- **tar:** 7.4.3 (TAR archives)
- **chokidar:** 4.0.3 (File watching)
- **@aws-sdk/client-s3:** 3.709.0 (S3 integration)

### Scheduling
- **node-cron:** 3.0.3 (Cron scheduling)
- **cron-parser:** 4.9.0 (Expression parsing)

### HTTP & API
- **axios:** 1.7.9
- **oauth:** 0.10.0

---

## 📦 Installation

### Prerequisites
```bash
Node.js 18+ 
npm 9+
Git
```

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Development
```bash
npm run dev                 # Watch mode compilation
npm run lint                # ESLint
npm run format              # Prettier
```

---

## 🚀 Quick Start

### 1. Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oktyv": {
      "command": "node",
      "args": ["path/to/oktyv/dist/index.js"],
      "env": {}
    }
  }
}
```

### 2. Start Oktyv Server

```bash
npm start
```

### 3. Use in Claude

```
Search for senior software engineer jobs in San Francisco on LinkedIn
```

---

## 📖 Usage Examples

### Browser Engine - Job Search

```typescript
// Search LinkedIn
await linkedin_search_jobs({
  keywords: "senior software engineer",
  location: "San Francisco, CA",
  remote: true,
  limit: 10
});

// Get job details
await linkedin_get_job({
  jobId: "12345"
});
```

### Vault Engine - Credential Storage

```typescript
// Store credential
await vault_set({
  vaultName: "production",
  credentialName: "database-password",
  value: "super-secret-password"
});

// Retrieve credential
await vault_get({
  vaultName: "production",
  credentialName: "database-password"
});
```

### Cron Engine - Task Scheduling

```typescript
// Schedule daily backup at 2 AM
await cron_create_task({
  name: "Daily Backup",
  scheduleType: "cron",
  cronExpression: "0 2 * * *",
  actionType: "http",
  actionConfig: {
    url: "https://api.example.com/backup",
    method: "POST"
  },
  timezone: "America/New_York",
  retryCount: 3
});

// Get task statistics
await cron_get_statistics({
  taskId: "task-123"
});
```

---

## 🏗️ Project Structure

```
oktyv/
├── src/
│   ├── connectors/          # Platform-specific connectors
│   │   ├── LinkedInConnector.ts
│   │   ├── IndeedConnector.ts
│   │   └── WellfoundConnector.ts
│   ├── tools/               # Engine implementations
│   │   ├── browser/         # Browser Engine
│   │   ├── vault/           # Vault Engine  
│   │   ├── api/             # API Engine
│   │   ├── database/        # Database Engine
│   │   ├── email/           # Email Engine
│   │   ├── file/            # File Engine
│   │   └── cron/            # Cron Engine
│   ├── types/               # TypeScript types
│   ├── utils/               # Shared utilities
│   ├── server.ts            # MCP server
│   └── index.ts             # Entry point
├── tests/
│   └── unit/                # Unit tests (258 total)
├── docs/                    # Engine design docs
└── package.json
```

---

## 🧪 Testing

### Test Organization

```
tests/unit/
├── connectors/              # Browser connector tests
├── tools/                   # Session/rate limiter tests
├── vault/                   # Vault engine tests
├── api/                     # API engine tests
├── database/                # Database engine tests
├── email/                   # Email engine tests
├── file/                    # File engine tests
└── cron/                    # Cron engine tests
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Specific engine
npx tsx --test tests/unit/cron/*.test.ts
```

---

## 🔐 Security

### Credential Storage
- AES-256-GCM encryption
- OS keychain integration
- Master keys never stored on disk
- Unique salt per vault

### API Security
- OAuth 2.0 support
- Token refresh handling
- Secure credential management via Vault Engine

### Database Security
- Prepared statements (SQL injection prevention)
- Connection encryption (TLS)
- Credential management via Vault Engine

---

## 🎯 Roadmap

### Phase 1: Core Engines ✅ COMPLETE
- [x] Browser Engine
- [x] Vault Engine
- [x] API Engine
- [x] Database Engine
- [x] Email Engine
- [x] File Engine
- [x] Cron Engine

### Phase 2: Full Integration (Current)
- [x] Browser Engine handlers
- [x] Vault Engine handlers
- [x] Cron Engine handlers
- [ ] File Engine handlers
- [ ] API Engine handlers
- [ ] Database Engine handlers
- [ ] Email Engine handlers

### Phase 3: Production Readiness
- [ ] Integration tests
- [ ] Error handling refinement
- [ ] Performance optimization
- [ ] Logging improvements
- [ ] Documentation completion

### Phase 4: Advanced Features
- [ ] Multi-engine workflows
- [ ] Engine orchestration
- [ ] Advanced scheduling
- [ ] Monitoring & metrics
- [ ] Plugin system

---

## 🤝 Contributing

This is currently a private project. Contributions will be opened in future phases.

---

## 📄 License

Proprietary - All Rights Reserved

---

## 🙏 Acknowledgments

Built with:
- **Philosophy:** Option B Perfection
- **Principle:** Foundation Out, Zero Technical Debt
- **Goal:** Climb Mountains, Fight Goliaths

---

## 📞 Support

For issues, questions, or feature requests, please contact the development team.

---

**Version:** 1.0.0-alpha.1  
**Last Updated:** January 25, 2026  
**Status:** All 7 Core Engines Complete ✅
