# Oktyv

Universal automation execution layer for AI agents.

**Version:** 1.7.0 | **Status:** Production | **Tools:** 73 | **Engines:** 10

> Give your AI agent hands. Oktyv executes.

Oktyv is a Model Context Protocol (MCP) server that gives Claude the ability to take real action in the world. Ten specialized engines cover authenticated API calls, browser automation, visual QA, shell execution, file operations, encrypted credential storage, OAuth flows, job board scraping, scheduled tasks, and parallel/concurrent execution with dependency management.

---

## Engines

| Engine | Tools | Description |
|---|---|---|
| **API** | `api_request` `api_oauth_init` `api_oauth_callback` `api_oauth_refresh` | Vault-backed authenticated HTTP, OAuth 2.0 flows (Google, GitHub, Stripe, Slack, Zoho) |
| **Shell** | `shell_batch` | Run N shell commands concurrently as child processes with DAG-based dependency ordering |
| **Email** | `email_gmail_send` `email_gmail_read` `email_gmail_search` `email_smtp_connect` `email_smtp_send` `email_imap_connect` `email_imap_fetch` `email_parse` | Gmail OAuth, SMTP send, IMAP receive, full email parsing |
| **Cron** | `cron_create_task` `cron_update_task` `cron_delete_task` `cron_list_tasks` `cron_get_task` `cron_enable_task` `cron_disable_task` `cron_execute_now` `cron_get_history` `cron_get_statistics` `cron_clear_history` `cron_validate_expression` | Scheduled automation with cron/interval/once scheduling, SQLite persistence, timezone support |
| **Database** | `db_connect` `db_query` `db_insert` `db_update` `db_delete` `db_transaction` `db_raw_query` `db_aggregate` `db_disconnect` | PostgreSQL, MySQL, SQLite, MongoDB — vault-backed connection strings, ACID transactions |
| **Browser** | `browser_navigate` `browser_click` `browser_type` `browser_extract` `browser_screenshot` `browser_pdf` `browser_form_fill` | Puppeteer-based browser automation |
| **Visual Inspection** | `browser_scroll_capture` `browser_selector_capture` `browser_computed_styles` `browser_batch_audit` `browser_session_cleanup` | Automated visual QA — scroll capture, element capture, computed styles, parallel audits |
| **Parallel Execution** | `parallel_execute` | Execute multiple Oktyv tools concurrently with DAG-based dependency resolution |
| **Vault** | `vault_set` `vault_get` `vault_list` `vault_delete` `vault_list_vaults` `vault_delete_vault` | AES-256-GCM encrypted credential storage with OS keychain master key |
| **File** | `file_copy` `file_delete` `file_hash` `file_archive_create` `file_archive_extract` `file_archive_list` | Local file operations and archive management (ZIP, TAR, TAR.GZ) |
| **Image** | `image_read` | Read local image files, return base64 — PNG, JPG, GIF, WebP, BMP, SVG |
| **LinkedIn** | `linkedin_search_jobs` `linkedin_get_job` `linkedin_get_company` | Job search and company lookup via LinkedIn |
| **Wellfound** | `wellfound_search_jobs` `wellfound_get_job` `wellfound_get_company` | Startup-focused job board (formerly AngelList Talent) |
| **Indeed** | `indeed_search_jobs` `indeed_get_job` `indeed_get_company` | Job search and company lookup via Indeed |
| **Upwork** | `upwork_search_jobs` `upwork_get_job` `upwork_get_client` `upwork_login_capture` | Freelance job board with Cloudflare bypass via `puppeteer-real-browser` |

---

## Tool Reference

### API Engine

The API engine makes authenticated HTTP calls to any service, pulling credentials directly from the Oktyv vault so secrets never appear in prompts or code.

**`api_request`** — Vault-backed authenticated HTTP

```json
{
  "url": "https://api.vercel.com/v13/deployments",
  "method": "POST",
  "vaultName": "apis",
  "credentialName": "vercel-token",
  "tokenPrefix": "Bearer",
  "data": { "name": "my-app", "gitSource": { "type": "github", "repoId": "123" } }
}
```

Parameters: `url`, `method` (GET/POST/PUT/PATCH/DELETE/HEAD), `headers`, `params`, `data`, `vaultName`, `credentialName`, `tokenPrefix` (default: Bearer). Any token prefix works — Bearer for Vercel/GitHub/Neon, `sso-key key:secret` for GoDaddy.

**`api_oauth_init`** — Start OAuth flow, get authorization URL

```json
{ "provider": "zoho", "clientId": "1000.XXX", "redirectUri": "http://localhost:8080/callback", "scopes": ["mail_read", "mail_send"] }
```

Returns `{ authUrl, state, codeVerifier? }`. User visits the URL, authorizes, gets a code.

**`api_oauth_callback`** — Exchange code for tokens, store in vault

```json
{ "provider": "zoho", "clientId": "1000.XXX", "clientSecret": "...", "code": "code-from-redirect", "redirectUri": "http://localhost:8080/callback", "userId": "david" }
```

Tokens stored encrypted under `oauth-tokens` vault. Subsequent `api_request` calls with OAuth can auto-refresh.

**`api_oauth_refresh`** — Refresh expired access token

```json
{ "provider": "zoho", "userId": "david", "clientId": "1000.XXX", "clientSecret": "..." }
```

Reads refresh token from vault, exchanges for new access token, stores updated tokens. Providers: `google` `github` `stripe` `slack` `zoho`.

---

### Shell Engine

**`shell_batch`** — Run N shell commands concurrently with optional dependency ordering

```json
{
  "commands": [
    { "id": "install-forme",  "cmd": "npm install --no-audit --no-fund", "cwd": "D:\\Projects\\forme",   "shell": "cmd" },
    { "id": "install-oktyv",  "cmd": "npm install --no-audit --no-fund", "cwd": "D:\\Dev\\oktyv",        "shell": "cmd" },
    { "id": "build-oktyv",    "cmd": "npm run build",                    "cwd": "D:\\Dev\\oktyv",        "shell": "cmd", "dependsOn": ["install-oktyv"] },
    { "id": "tsc-forme",      "cmd": "npx tsc --noEmit",                 "cwd": "D:\\Projects\\forme",   "shell": "cmd", "dependsOn": ["install-forme"] }
  ],
  "config": { "maxConcurrent": 4, "failureMode": "continue" }
}
```

`install-forme` and `install-oktyv` run in parallel. `build-oktyv` and `tsc-forme` each wait for their dependency. Returns stdout, stderr, exit code, and timing per command.

**Note:** Oktyv's process doesn't inherit your shell PATH. Use full paths or `cwd` for resolution. Use Desktop Commander for git, node, npm commands that need PATH.

---

### Browser Engine

Puppeteer-based automation. Best for judgment-required tasks on unknown or ambiguous UIs — once the pattern is confirmed, hand off to `api_request` or `shell_batch` for efficiency.

**`browser_navigate`** — Navigate to URL, optionally wait for a selector

**`browser_click`** — Click element by CSS selector, optionally wait for navigation

**`browser_type`** — Type text into input, with optional delay and clear-first

**`browser_extract`** — Extract data from page using a map of `{ key: cssSelector }`, single or multiple elements

**`browser_screenshot`** — Capture current page or specific element, full-page or viewport

**`browser_pdf`** — Generate PDF from current page (Letter/Legal/A4, portrait/landscape)

**`browser_form_fill`** — Fill a form from `{ selector: value }` map, optionally submit

---

### Visual Inspection Engine

Purpose-built for automated visual QA across multiple pages or components.

**`browser_scroll_capture`** — Scroll a fully-rendered page in viewport increments, capture each section as PNG. Use to verify layout at full page height.

**`browser_selector_capture`** — Capture specific DOM elements by CSS selector — bounding box only. One screenshot per matched element.

**`browser_computed_styles`** — Extract computed CSS properties for matching elements. Zero disk I/O, pure data. Use to verify fonts, colors, spacing are applied correctly across a fleet of pages.

**`browser_batch_audit`** — Parallel visual audit across multiple URLs. Hardware-limited concurrency (default: 3). Returns screenshots + computed styles per URL in a single call.

**`browser_session_cleanup`** — Delete a temp screenshot session directory when `cleanup: false` was used.

---

### Vault Engine

AES-256-GCM encryption. Master key stored in OS keychain — never on disk in plaintext.

**`vault_set`** — Store a credential. Creates vault if it doesn't exist.

**`vault_get`** — Retrieve and decrypt a credential.

**`vault_list`** — List credential names in a vault (values never returned).

**`vault_delete`** — Delete a credential. Permanent.

**`vault_list_vaults`** — List all vault names.

**`vault_delete_vault`** — Delete an entire vault and all its credentials. Permanent.

```json
{ "vaultName": "apis", "credentialName": "vercel-token", "value": "vcp_..." }
```

Vault names: lowercase alphanumeric + hyphens. Credential names: lowercase alphanumeric + hyphens + underscores.

---

### Parallel Execution Engine

**`parallel_execute`** — Run multiple Oktyv tool calls simultaneously with DAG dependency resolution and variable substitution.

```json
{
  "tasks": [
    { "id": "search-linkedin",  "tool": "linkedin_search_jobs",  "params": { "keywords": "SEO director", "location": "Los Angeles" } },
    { "id": "search-wellfound", "tool": "wellfound_search_jobs", "params": { "keywords": "SEO director" } },
    { "id": "save-results",     "tool": "file_copy",             "params": { "source": "${search-linkedin.result}", "destination": "D:\\results.json" }, "dependsOn": ["search-linkedin"] }
  ],
  "config": { "maxConcurrent": 10 }
}
```

Any Oktyv tool can be composed into a parallel batch. The DAG engine resolves dependencies, runs independent tasks in parallel, and sequences dependent ones.

---

### File Engine

**`file_copy`** — Copy file or directory, optional overwrite

**`file_delete`** — Delete file or directory, optional recursive

**`file_hash`** — Compute file hash (MD5, SHA1, SHA256, SHA512)

**`file_archive_create`** — Create ZIP, TAR, or TAR.GZ from a list of sources

**`file_archive_extract`** — Extract archive to destination

**`file_archive_list`** — List archive contents without extracting

---

### Image Engine

**`image_read`** — Read a local image file and return base64. Supports PNG, JPG, GIF, WebP, BMP, SVG. D:\ paths only.

---

### Job Board Engines

**LinkedIn**
- `linkedin_search_jobs` — Search by keywords, location, remote flag, limit (max 50)
- `linkedin_get_job` — Get full job details by LinkedIn job ID, optionally include company
- `linkedin_get_company` — Get company profile by LinkedIn company ID or vanity name

**Wellfound** (formerly AngelList Talent — startup-focused)
- `wellfound_search_jobs` — Search by keywords, location, remote flag, limit
- `wellfound_get_job` — Get job details by Wellfound slug
- `wellfound_get_company` — Get company profile including funding info by slug

**Indeed**
- `indeed_search_jobs` — Search by keywords, location, remote flag, limit
- `indeed_get_job` — Get full job details by Indeed job key
- `indeed_get_company` — Get company profile by Indeed employer ID

**Upwork** (freelance platform with aggressive Cloudflare protection)
- `upwork_search_jobs` — Search by keywords, hourly/fixed range, experience level, project length, payment-verified filter (max 50)
- `upwork_get_job` — Full job detail including bid range (for Freelancer Plus users), proposal count, client quality signals, `includeClient` option
- `upwork_get_client` — Client profile: total spent, hire rate, jobs posted, rating, member-since
- `upwork_login_capture` — One-time authentication: opens a browser window, polls for `master_refresh_token` + `console_user` cookies, saves to JSON. Re-run every ~2-3 weeks when the session expires. Only needed for authenticated-only fields; public job/client pages work without it.

Upwork uses an **isolated session manager** (`puppeteer-real-browser`) to defeat Cloudflare's v20-era Turnstile challenges, which vanilla Puppeteer + stealth plugins cannot bypass on Chrome 127+. See `STATUS_UPWORK_ADAPTER.md` for architecture details.

---

## Decision Matrix — Which Tool to Use

| Task | Tool |
|---|---|
| Authenticated API call to Vercel / GoDaddy / Neon / GitHub | `api_request` with `vaultName` + `credentialName` |
| OAuth flow for Zoho / Google / GitHub / Slack | `api_oauth_init` → user visits URL → `api_oauth_callback` |
| Run npm install + tsc + git status simultaneously | `shell_batch` with `dependsOn` for sequenced steps |
| Scrape LinkedIn + Wellfound simultaneously | `parallel_execute` with both job search tools |
| Freelance gig triage on Upwork | `upwork_search_jobs` + `upwork_get_job` (Cloudflare handled automatically) |
| Visual audit of 10 URLs in parallel | `browser_batch_audit` |
| Verify fonts/colors fleet-wide | `browser_computed_styles` |
| Store an API key securely | `vault_set` |
| Single shell command or interactive/git process | Desktop Commander `start_process` |
| First-pass unknown UI / ambiguous state | `browser_navigate` + `browser_extract` (then hand off to API) |

---

## Setup

### Prerequisites

- Node.js 20+
- Chrome (downloaded by Puppeteer on first run)

### Install

```bash
cd D:\Dev\oktyv
npm install
npm run build
```

### Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oktyv": {
      "command": "node",
      "args": ["/path/to/oktyv/dist/server.js"],
      "env": {
        "OKTYV_BROWSER_DATA_DIR": "/path/to/oktyv/browser-data",
        "PUPPETEER_CACHE_DIR": "/path/to/cache/puppeteer"
      }
    }
  }
}
```

Restart Claude Desktop after any `npm run build`.

### Build

```bash
npm run build    # compile TypeScript → dist/
npm test         # run test suite (258 tests)
npm run lint     # ESLint check
```

---

## Architecture

```
Claude
  └── MCP Protocol
        └── Oktyv Server (src/server.ts)
              ├── ApiEngine              — HTTP client, OAuth 2.0, rate limiting, pagination
              │     └── OAuthManager    — Google, GitHub, Stripe, Slack, Zoho token flows
              ├── ShellEngine            — child_process.spawn, DAG execution
              ├── BrowserSessionManager  — Puppeteer, stealth mode, session reuse
              ├── ParallelExecutionEngine — DAG + full tool registry
              ├── VaultEngine            — AES-256-GCM, OS keychain master key
              ├── FileEngine             — local + archives
              ├── VisualInspectionConnector — scroll/selector/styles/batch capture
              ├── GenericBrowserConnector   — navigate, click, extract, screenshot
              ├── LinkedInConnector      — job search, company lookup
              ├── WellfoundConnector     — startup job board
              ├── IndeedConnector        — job search, company lookup
              └── UpworkConnector        — freelance platform (isolated puppeteer-real-browser session)
```

**Multi-tenant ready.** Each engine is self-contained. The parallel engine's tool registry contains all other engines — any tool can be composed into a parallel batch.

**Vault-first design.** `api_request` reads credentials from the vault by name and injects them as Authorization headers. Secrets never appear in prompts or logs.

**Isolated session for hostile platforms.** Upwork's Cloudflare Turnstile enforcement and Chrome 127+ App-Bound Encryption (v20) made the shared `BrowserSessionManager` insufficient. `UpworkConnector` runs its own `puppeteer-real-browser` session — other connectors are unaffected.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| **1.7.0** | 2026-04-21 | **Upwork adapter** — `upwork_search_jobs`, `upwork_get_job`, `upwork_get_client`, `upwork_login_capture` (69→73 tools). Isolated `puppeteer-real-browser` session defeats Cloudflare Turnstile. Platform-agnostic cookie-JSON auth persistence (`src/browser/auth.ts`) for future authenticated-only endpoints. Chrome 146-compatible — replaces profile-dir persistence that broke on App-Bound Encryption (v20). |
| **1.6.0** | 2026-04-16 | Email (8), Cron (12), Database (9), Indeed (3) engines wired as MCP tools — 37→69 total tools. Indeed connector bug fixes. |
| **1.5.0** | 2026-04-16 | API Engine MCP tools — `api_request`, `api_oauth_init`, `api_oauth_callback`, `api_oauth_refresh`. Zoho added as OAuth provider. Vault-backed auth for any API. |
| **1.4.0** | 2026-04-11 | Shell Engine — `shell_batch`, concurrent child processes, DAG deps, powershell/cmd/bash/sh |
| 1.3.0 | 2026-03-27 | McpServer migration (SDK 1.25.x) — deprecated Server → McpServer with Zod schemas, fixes Claude Desktop 60s timeout |
| 1.3.0 | 2026-03-21 | Visual Inspection Layer — `browser_scroll_capture`, `browser_selector_capture`, `browser_computed_styles`, `browser_batch_audit`, `browser_session_cleanup` |
| 1.2.0 | 2026-03-20 | Browser Engine runtime fix — Puppeteer Chrome path, session manager, EPERM fix |
| 1.1.0 | — | Parallel Execution Engine, DAG-based concurrency, variable substitution |
| 1.0.0 | — | Initial release — Browser, Vault, File, LinkedIn, Wellfound engines |

---

## Key Files

```
src/
  server.ts                              — MCP server, all 73 tool registrations
  engines/
    shell/ShellEngine.ts                 — shell_batch implementation
    parallel/ParallelExecutionEngine.ts  — parallel_execute + tool registry
  tools/
    api/
      ApiEngine.ts                       — HTTP orchestrator
      OAuthManager.ts                    — OAuth 2.0 provider flows
      HttpClient.ts                      — retry, circuit breaker
    vault/VaultEngine.ts                 — AES-256-GCM credential storage
    file/FileEngine.ts                   — local file + archive ops
  browser/
    session.ts                           — shared Puppeteer session manager (LinkedIn/Wellfound/Indeed)
    upwork-real-browser.ts               — isolated puppeteer-real-browser session (Upwork only)
    auth.ts                              — platform-agnostic cookie-JSON persistence
  connectors/
    linkedin.ts                          — LinkedIn automation
    wellfound.ts                         — Wellfound automation
    indeed.ts                            — Indeed automation
    upwork.ts                            — Upwork automation (Cloudflare-bypass via real-browser)
    visual-inspection.ts                 — scroll/selector/styles/batch
    generic.ts                           — navigate, click, extract, screenshot
scripts/
  capture-upwork-login.mjs               — standalone Upwork login re-seed utility
  test-real-browser.mjs                  — smoke test for puppeteer-real-browser
docs/
  SHELL_ENGINE_DESIGN.md                 — shell_batch spec
  PARALLEL_EXECUTION_DESIGN.md          — parallel_execute spec
  ARCHITECTURE.md                        — full system design
STATUS_UPWORK_ADAPTER.md                 — Upwork adapter status, architecture, maintenance
```

---

*Oktyv is a product of [Borrowed Light Group LLC](https://borrowedlightgroup.com) · Wyoming*
