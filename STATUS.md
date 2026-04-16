# OKTYV — STATUS

**Status:** active
**Phase:** v1.6.0 — All engines live (69 tools)
**Last Sprint:** v1.6.0
**Last Updated:** 2026-04-16

---

## WHAT OKTYV IS

Oktyv is the universal automation execution layer for the portfolio — the hands of AI
agents. 9 engines: Browser, API, Database, Email, File, Cron, Vault, Parallel Execution,
Shell. Standalone MCP server. Production-hardened with load testing, security audit (95/100),
performance optimization, and error recovery. TypeScript strict mode.

GREGORE orchestrates. Oktyv executes. Every product that needs to take action in the
real world calls Oktyv.

## CURRENT STATE

v1.6.0 shipped 2026-04-16. All remaining engines wired as MCP tools. 32 new tools:
Email (8): gmail send/read/search, SMTP connect/send, IMAP connect/fetch, parse.
Cron (12): create/update/delete/list/get/enable/disable/execute-now/history/stats/clear/validate.
Database (9): connect/query/insert/update/delete/transaction/raw-query/aggregate/disconnect.
Indeed (3): search_jobs/get_job/get_company.
Total: 37 → 69 tools across 10 engines. All engines fully operational as MCP tools.

v1.5.0 shipped 2026-04-16. API Engine wired as MCP tools.
Runs N shell commands concurrently as child processes with DAG-based dependency ordering.
Returns stdout, stderr, exit code, timing per command. Supports powershell/cmd/bash/sh.
Solves the sequential Desktop Commander bottleneck for independent shell tasks
(npm installs, git operations, tsc checks across multiple projects simultaneously).

v1.3.0 shipped 2026-03-27. McpServer migration (SDK 1.25.x) — server.ts rewritten,
deprecated Server → McpServer with Zod schemas.

v1.3.0 Visual Layer shipped 2026-03-21. 5 new MCP tools:
browser_scroll_capture, browser_selector_capture, browser_computed_styles,
browser_batch_audit, browser_session_cleanup.

v1.2.0 shipped 2026-03-20. All 8 engines complete. Browser engine operational.

## OPEN WORK

- [ ] Claude Desktop restart to activate v1.4.0 Shell Engine
- [ ] Integration with Easter Agency content operations (Wave 2)
- [ ] Wire into COVOS Intelligence Engine for automated scan dispatch
- [ ] Wire into ContentStudio for GAD fleet visual audit automation

## WHAT IS OPERATIONAL

- Email Engine — email_gmail_send/read/search, email_smtp_connect/send, email_imap_connect/fetch, email_parse ✅ (SHIPPED 2026-04-16)
- Cron Engine — 12 tools: create/update/delete/list/get/enable/disable/execute-now/history/stats/clear/validate ✅ (SHIPPED 2026-04-16)
- Database Engine — 9 tools: connect/query/insert/update/delete/transaction/raw-query/aggregate/disconnect ✅ (SHIPPED 2026-04-16)
- Indeed Connector — indeed_search_jobs, indeed_get_job, indeed_get_company ✅ (SHIPPED 2026-04-16)
- API Engine — api_request, api_oauth_init, api_oauth_callback, api_oauth_refresh ✅ (SHIPPED 2026-04-16)
- Browser Engine — Puppeteer, LinkedIn/Indeed/Wellfound connectors ✅
- Visual Inspection Layer — scroll_capture, selector_capture, computed_styles, batch_audit ✅
- Vault Engine — AES-256-GCM, OS keychain ✅
- API Engine — Universal HTTP, OAuth 2.0, circuit breaker ✅
- Database Engine — PostgreSQL, MySQL, SQLite, MongoDB ✅
- Email Engine — Gmail OAuth, SMTP, IMAP ✅
- File Engine — Local + S3, archives, batch operations ✅
- Cron Engine — Scheduled automation, timezone support ✅
- Parallel Execution Engine — DAG-based concurrency, variable substitution ✅

## ENTRY POINT

D:\Dev\oktyv\PROJECT_DNA.yaml — project identity and full capability map.
D:\Dev\oktyv\docs\SHELL_ENGINE_DESIGN.md — shell_batch spec and usage.
