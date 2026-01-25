# Oktyv

![Version](https://img.shields.io/badge/version-0.2.0--alpha.2-blue)
![Status](https://img.shields.io/badge/status-alpha-yellow)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/license-MIT-green)

**Universal automation layer - The hands of AI agents**

Oktyv is a complete automation infrastructure with 7 core engines enabling AI agents to ACT on the real world. Built on Option B Perfection principles - complete product, not MVP iterations.

## ⚠️ Development Status

**Current Version:** v0.2.0-alpha.2  
**Completed:** Browser Engine (1 of 7) ✅  
**Remaining:** 6 engines (API, Database, Email, File, Cron, Vault) 🔲  
**Production Ready:** ❌ Not yet - Browser Engine production-ready, other engines not started

The Browser Engine is feature-complete with test infrastructure and CI/CD. Building remaining 6 engines to achieve complete universal automation layer.

## What is Oktyv?

Oktyv is an MCP (Model Context Protocol) server providing complete automation infrastructure across 7 domains:

### ✅ Engine 1: Browser (Puppeteer) - COMPLETE
- Navigate complex web applications with intelligent decision-making
- Extract structured data from dynamic content (infinite scroll, modals, SPAs)
- Manage authenticated sessions across platforms (persistent login state)
- Platform connectors: LinkedIn, Indeed, Wellfound
- Generic browser tools: navigate, click, type, extract, screenshot, PDF, fillForm

### 🔲 Engine 2: API (Axios) - NOT STARTED
- HTTP/REST/GraphQL automation
- OAuth 2.0 flows (Google, GitHub, Stripe, etc.)
- Pagination handling
- Rate limiting per endpoint
- Webhook management

### 🔲 Engine 3: Database (Prisma) - NOT STARTED
- SQL operations (PostgreSQL, MySQL, SQLite)
- NoSQL operations (MongoDB, Redis)
- Transactions, migrations, backups
- Query builders

### 🔲 Engine 4: Email (Nodemailer) - NOT STARTED
- Send emails (Gmail, Outlook, SMTP)
- Search inbox, extract data
- Attachment handling
- Email templates

### 🔲 Engine 5: File (Node.js fs) - NOT STARTED
- File system operations
- Cloud storage (S3, Google Drive, Dropbox)
- Format conversion (PDF, DOCX, CSV, JSON)
- File compression, encryption

### 🔲 Engine 6: Cron (node-cron) - NOT STARTED
- Scheduled task automation
- Recurring and one-time tasks
- Job persistence, monitoring
- Error handling and retries

### 🔲 Engine 7: Vault (AES-256) - NOT STARTED
- Secure credential storage
- OS keychain integration
- API keys, passwords, tokens
- Local-only encryption

**Goal:** All 7 engines (universal automation layer)  
**Philosophy:** Option B Perfection - build complete, ship when ready

## ✨ Implemented Features (Browser Engine)

### Platform Connectors
**LinkedIn:**
- linkedin_search_jobs - Search with filters (keywords, location, remote, type, experience, salary, date)
- linkedin_get_job - Complete job details (description, skills, requirements, applicant count)
- linkedin_get_company - Company profiles (metrics, industry, size, headquarters, founded date)

**Indeed:**
- indeed_search_jobs - Search job listings
- indeed_get_job - Get job details
- indeed_get_company - Get company information

**Wellfound:**
- wellfound_search_jobs - Search startup jobs
- wellfound_get_job - Get job details
- wellfound_get_company - Get company profiles

### Generic Browser Tools
- browser_navigate - Navigate to URL
- browser_click - Click elements
- browser_type - Type text
- browser_extract - Extract data via selectors
- browser_screenshot - Capture screenshots
- browser_pdf - Generate PDFs
- browser_fillForm - Fill forms automatically

### Infrastructure
- **Session Management** - Persistent cookie-based authentication (stay logged in)
- **Rate Limiting** - Token bucket algorithm (10 req/min per platform)
- **Login Detection** - Platform-specific cookie validation
- **Error Handling** - Comprehensive error codes with retry logic
- **Testing** - 52 tests (100% passing), CI/CD via GitHub Actions

## Why "Oktyv"?

The name combines "oct" (eight, suggesting completeness) with modern tech aesthetic. Represents complete automation across all domains.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Claude Desktop / MCP Client         │
│                                                  │
│  Any MCP client + Claude AI                     │
└────────────┬────────────────────────────────────┘
             │ MCP Protocol
             ↓
┌─────────────────────────────────────────────────┐
│          Oktyv MCP Server (7 Engines)            │
│                                                  │
│  ✅ Browser Engine (Puppeteer)                   │
│  🔲 API Engine (Axios)                           │
│  🔲 Database Engine (Prisma)                     │
│  🔲 Email Engine (Nodemailer)                    │
│  🔲 File Engine (Node.js fs)                     │
│  🔲 Cron Engine (node-cron)                      │
│  🔲 Vault Engine (AES-256)                       │
└────────────┬────────────────────────────────────┘
             │ External Systems
             ↓
┌─────────────────────────────────────────────────┐
│  Chrome • APIs • Databases • SMTP • Cloud        │
│  Local Files • Cron Jobs • OS Keychain          │
└─────────────────────────────────────────────────┘
```

## Build Status

**Version:** v0.2.0-alpha.2  
**Created:** 2026-01-22  
**Updated:** 2026-01-24  
**Philosophy:** Option B perfection - do it right first time

### Completed Engines (1 of 7)
- ✅ Browser Engine
  - Session management with persistent auth
  - Rate limiting (token bucket algorithm)
  - LinkedIn connector (search, jobs, companies)
  - Indeed connector (search, jobs, companies)
  - Wellfound connector (search, jobs, companies)
  - Generic browser tools (7 tools)
  - TypeScript strict mode (0 errors)
  - Comprehensive error handling
  - Test suite (52 tests, 100% passing)
  - CI/CD automation (GitHub Actions)

### Remaining Engines (6 of 7)
- 🔲 API Engine - HTTP/REST/GraphQL automation
- 🔲 Database Engine - SQL/NoSQL operations
- 🔲 Email Engine - Send/receive/parse
- 🔲 File Engine - Local + cloud storage
- 🔲 Cron Engine - Scheduled automation
- 🔲 Vault Engine - Encrypted credentials

### Next Up
**Priority:** API Engine or Vault Engine (user decides)

## Installation

### Prerequisites
- Node.js 18+
- Chrome/Chromium installed
- MCP-compatible client (Claude Desktop, etc.)

### Setup
```bash
# Clone repository
git clone https://github.com/dkirchhof/oktyv.git
cd oktyv

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "oktyv": {
      "command": "node",
      "args": ["/absolute/path/to/oktyv/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop to load the server.

## Usage Examples

### Browser Engine

**Job Search:**
```
User: Find 10 remote senior software engineer jobs on LinkedIn

Claude uses:
1. linkedin_search_jobs with filters
2. linkedin_get_job for details on each
3. Returns structured results
```

**Company Research:**
```
User: Get company info for Microsoft from LinkedIn

Claude uses:
1. linkedin_get_company
2. Returns company profile, size, industry
```

**Generic Automation:**
```
User: Go to example.com and extract all h1 headings

Claude uses:
1. browser_navigate to URL
2. browser_extract with h1 selector
3. Returns extracted text
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Coverage text output
npm run test:coverage:text
```

### CI/CD
Automated testing via GitHub Actions on every push:
- Tests across Node.js 18.x, 20.x, 22.x
- Build validation
- Cross-platform (Windows + Linux)

## Development

### Project Structure
```
oktyv/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # Tool implementations
│   │   ├── browser/          # Generic browser tools
│   │   ├── linkedin/         # LinkedIn connector
│   │   ├── indeed/           # Indeed connector
│   │   └── wellfound/        # Wellfound connector
│   ├── connectors/           # Platform connectors
│   ├── managers/             # Session, rate limit, retry managers
│   ├── types/                # TypeScript types
│   └── utils/                # Utilities
├── tests/
│   ├── unit/                 # Unit tests
│   │   ├── connectors/       # Connector tests (29 tests)
│   │   └── tools/            # Tool parameter tests (23 tests)
│   └── integration/          # Integration tests (future)
├── docs/                     # Documentation
├── dist/                     # Compiled output
└── PROJECT_DNA.yaml          # Project truth file
```

### Adding New Engines

See VISION.md and ROADMAP.md for complete engine specifications.

Each engine requires:
1. Tool implementations (src/tools/<engine>/)
2. MCP tool definitions (src/index.ts)
3. Type definitions (src/types/)
4. Unit tests (tests/unit/)
5. Integration tests (tests/integration/)
6. Documentation

## Documentation

- **VISION.md** - Complete product vision (all 7 engines)
- **ROADMAP.md** - Implementation roadmap
- **PROJECT_DNA.yaml** - Project truth and status
- **ARCHITECTURE.md** - Technical architecture (future)
- **TESTING.md** - Testing documentation
- **CLI_USAGE.md** - Command-line usage

## Contributing

This is a personal project currently in alpha. Issues and PRs welcome once Browser Engine is production-validated.

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Ensure all tests pass (`npm test`)
5. Ensure build succeeds (`npm run build`)
6. Submit pull request

## License

MIT License - see LICENSE file

## Roadmap

See ROADMAP.md for detailed implementation plan.

**Current Focus:** Browser Engine complete, next engine TBD (API, Vault, or Database)

**Future Engines:**
- API Engine (HTTP/REST/GraphQL)
- Database Engine (SQL/NoSQL)
- Vault Engine (encrypted credentials)
- File Engine (local + cloud storage)
- Email Engine (send/receive/parse)
- Cron Engine (scheduled tasks)

**Target:** v1.0.0 when all 7 engines complete

## Support

- GitHub Issues: Bug reports and feature requests
- Documentation: See docs/ directory
- Discord: (future)

---

**Built with Option B Perfection**  
*Complete product, not MVP iterations. Zero technical debt.*
