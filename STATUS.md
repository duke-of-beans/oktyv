# OKTYV — STATUS

**Status:** active
**Phase:** v1.5.0 — API Engine MCP tools
**Last Sprint:** v1.5.0
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

v1.5.0 shipped 2026-04-16. API Engine wired as MCP tools. 4 new tools:
api_request (vault-backed authenticated HTTP), api_oauth_init (generates auth URL),
api_oauth_callback (exchanges code for tokens, stores in vault), api_oauth_refresh
(refreshes expired tokens). OAuthManager extended with Zoho provider.
api_request reads credentials from Oktyv vault by name — any token prefix supported
(Bearer, sso-key, etc.) making GoDaddy/Vercel/GitHub/Neon calls native.

v1.4.0 shipped 2026-04-11. Shell Engine complete.
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

- API Engine — api_request, api_oauth_init, api_oauth_callback, api_oauth_refresh ✅ (SHIPPED 2026-04-16)
- Shell Engine — shell_batch, concurrent child processes, DAG deps, powershell/cmd/bash ✅ (SHIPPED 2026-04-11)
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
