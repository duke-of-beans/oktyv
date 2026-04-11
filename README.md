# Oktyv

Universal automation execution layer for AI agents.

**Version:** 1.4.0 | **Status:** Production | **Engines:** 9

> GREGORE orchestrates. Oktyv executes.

Oktyv is a Model Context Protocol (MCP) server that gives Claude hands — the ability to take real action in the world through 9 specialized engines. Browser automation, shell execution, file operations, vault credential storage, API calls, database queries, email, scheduled tasks, and parallel/concurrent execution with dependency management.

---

## Engines

| Engine | MCP Tools | Description |
|---|---|---|
| **Shell** | `shell_batch` | Run N shell commands concurrently as child processes with DAG-based dependency ordering |
| **Browser** | `browser_navigate`, `browser_click`, `browser_type`, `browser_extract`, `browser_screenshot`, `browser_pdf`, `browser_form_fill` | Puppeteer-based browser automation with LinkedIn, Indeed, Wellfound connectors |
| **Visual Inspection** | `browser_scroll_capture`, `browser_selector_capture`, `browser_computed_styles`, `browser_batch_audit`, `browser_session_cleanup` | Automated visual QA — scroll capture, element capture, computed styles, parallel audits |
| **Parallel Execution** | `parallel_execute` | Execute multiple Oktyv tools concurrently with DAG-based dependency resolution and variable substitution |
| **Vault** | `vault_set`, `vault_get`, `vault_list`, `vault_delete`, `vault_list_vaults`, `vault_delete_vault` | AES-256-GCM encrypted credential storage with OS keychain master key |
| **File** | `file_copy`, `file_delete`, `file_hash`, `file_archive_create`, `file_archive_extract`, `file_archive_list` | Local file operations and archive management |
| **API** | — | Universal HTTP client, OAuth 2.0, auto-pagination, circuit breaker |
| **Email** | — | Gmail OAuth, SMTP send, IMAP receive, attachment handling |
| **Cron** | — | Scheduled automation, timezone support, execution history |

---

## Quick Reference

### shell_batch — concurrent shell commands

Run independent commands simultaneously, sequence dependent ones:

```json
{
  "commands": [
    { "id": "install", "cmd": "npm install --no-audit --no-fund", "cwd": "D:\\Projects\\forme", "shell": "powershell" },
    { "id": "lint",    "cmd": "npm run lint", "cwd": "D:\\Dev\\oktyv", "shell": "powershell" },
    { "id": "tsc",     "cmd": "npx tsc --noEmit", "cwd": "D:\\Projects\\forme", "shell": "powershell", "dependsOn": ["install"] }
  ],
  "config": { "maxConcurrent": 5, "failureMode": "continue" }
}
```

`install` and `lint` run in parallel. `tsc` waits for `install`. Returns stdout, stderr, exit code, and timing per command.

**Note:** Oktyv's process doesn't inherit your shell PATH. Use full paths for git/node or use Desktop Commander for those operations.

### parallel_execute — concurrent Oktyv tools

Run multiple Oktyv tool calls simultaneously with optional dependency ordering and variable substitution:

```json
{
  "tasks": [
    { "id": "linkedin", "tool": "linkedin_search_jobs", "params": { "keywords": "software engineer", "location": "SF" } },
    { "id": "indeed",   "tool": "wellfound_search_jobs", "params": { "keywords": "software engineer" } },
    { "id": "save",     "tool": "file_copy", "params": { "source": "${linkedin.result}", "destination": "results.json" }, "dependsOn": ["linkedin"] }
  ]
}
```

### vault_set / vault_get — encrypted credentials

```json
{ "vaultName": "portfolio", "credentialName": "stripe-secret", "value": "sk_live_..." }
```

Credentials encrypted with AES-256-GCM. Master key in OS keychain. Never stored in plaintext.

---

## When to Use What

| Task | Tool |
|---|---|
| Run npm install + tsc + git status simultaneously | `shell_batch` |
| Scrape LinkedIn + Indeed + Wellfound at the same time | `parallel_execute` |
| Visual audit of 10 URLs in parallel | `browser_batch_audit` |
| Store an API key securely | `vault_set` |
| Single shell command or interactive process | Desktop Commander `start_process` |
| Git operations, node/npm commands | Desktop Commander (Oktyv process lacks PATH) |

---

## Architecture

```
Claude
  └── MCP Protocol
        └── Oktyv Server (src/server.ts)
              ├── ShellEngine          — child_process.spawn, DAG execution
              ├── BrowserSessionManager — Puppeteer, stealth mode
              ├── ParallelExecutionEngine — DAG + tool registry
              ├── VaultEngine          — AES-256-GCM, OS keychain
              ├── FileEngine           — local + S3, archives
              ├── LinkedInConnector    — job search, company lookup
              ├── WellfoundConnector   — startup job board
              ├── VisualInspectionConnector — scroll/selector/styles capture
              └── GenericBrowserConnector  — navigate, click, extract, screenshot
```

**Multi-tenant ready.** Each engine is self-contained. The parallel engine's tool registry contains all other engines — any tool can be composed into a parallel batch.

---

## Setup

Oktyv runs as a local MCP server managed by Claude Desktop.

### Prerequisites

- Node.js 20+
- Chrome (downloaded by Puppeteer automatically)

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
      "args": ["D:/Dev/oktyv/dist/server.js"],
      "env": {
        "OKTYV_BROWSER_DATA_DIR": "D:/Dev/oktyv/browser-data",
        "PUPPETEER_CACHE_DIR": "D:/Cache/puppeteer"
      }
    }
  }
}
```

Restart Claude Desktop after any changes to `dist/server.js`.

### Build

```bash
npm run build        # compile TypeScript → dist/
npm test             # run test suite
npm run lint         # ESLint check
```

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| **1.4.0** | 2026-04-11 | Shell Engine — `shell_batch` tool, concurrent child processes, DAG deps |
| 1.3.0 | 2026-03-27 | McpServer migration (SDK 1.25.x), fixes Claude Desktop 60s timeout |
| 1.3.0 | 2026-03-21 | Visual Inspection Layer — 5 new browser tools for automated QA |
| 1.2.0 | 2026-03-20 | Browser Engine runtime fix — Puppeteer Chrome path, session manager |
| 1.1.0 | — | Parallel Execution Engine, DAG-based concurrency |
| 1.0.0 | — | Initial release, 7 engines |

---

## Key Files

```
src/
  server.ts                        — MCP server, all tool registrations
  engines/
    shell/ShellEngine.ts           — shell_batch implementation
    parallel/ParallelExecutionEngine.ts — parallel_execute implementation
  browser/session.ts               — Puppeteer session management
  tools/vault/VaultEngine.ts       — credential encryption
  connectors/                      — LinkedIn, Wellfound, Visual, Generic
docs/
  SHELL_ENGINE_DESIGN.md           — shell_batch spec
  PARALLEL_EXECUTION_DESIGN.md     — parallel_execute spec
  ARCHITECTURE.md                  — full system design
```

---

*Oktyv is a product of [Borrowed Light Group LLC](https://borrowedlightgroup.com) · Wyoming*
