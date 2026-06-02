# OKTYV — STATUS

**Status:** active
**Phase:** v1.7.1 — Lazy-loading cold-start fix (73 tools, 10 engines)
**Last Sprint:** v1.7.1
**Last Updated:** 2026-06-02

---

## WHAT OKTYV IS

Oktyv is the universal automation execution layer for the portfolio — the hands of AI
agents. 10 engines: Browser, API, Database, Email, File, Cron, Vault, Parallel Execution,
Shell, Visual Inspection. Standalone MCP server. Production-hardened with load testing,
security audit (95/100), performance optimization, and error recovery. TypeScript strict mode.

## CURRENT STATE

v1.7.1 shipped 2026-06-02. Lazy-loading cold-start fix. All 17 heavy dependencies
(puppeteer, cheerio, googleapis, mongodb, mysql2, pg, better-sqlite3, etc.) now load via
dynamic import() on first tool call instead of at server startup. MCP initialize response
drops from 2-60+ s to ~500 ms. Eliminates the 35% startup timeout failure rate that plagued
Claude Desktop connections since April. SDK pinned exact @modelcontextprotocol/sdk@1.27.0.

v1.7.0 shipped 2026-04-21. Upwork adapter — 4 new tools (69→73). Isolated
puppeteer-real-browser session defeats Cloudflare Turnstile. CDP connection mode for
attaching to running browser.

v1.6.0 shipped 2026-04-16. Email (8), Cron (12), Database (9), Indeed (3) engines — 37→69 tools.

## OPEN WORK

- [ ] Integration with Easter Agency content operations (Wave 2)
- [ ] Wire into COVOS Intelligence Engine for automated scan dispatch
- [ ] Wire into ContentStudio for GAD fleet visual audit automation

## WHAT IS OPERATIONAL

All 10 engines, 73 tools fully operational:
- Browser Engine — Puppeteer, stealth, CDP connect, LinkedIn/Indeed/Wellfound/Upwork connectors ✅
- Visual Inspection — scroll_capture, selector_capture, computed_styles, batch_audit ✅
- Vault Engine — AES-256-GCM, OS keychain ✅
- API Engine — Universal HTTP, OAuth 2.0, circuit breaker ✅
- Shell Engine — shell_batch, concurrent child processes, DAG deps ✅
- Database Engine — PostgreSQL, MySQL, SQLite, MongoDB ✅
- Email Engine — Gmail OAuth, SMTP, IMAP, parse ✅
- File Engine — Local + archives (ZIP, TAR, TAR.GZ) ✅
- Cron Engine — Scheduled automation, timezone support, SQLite persistence ✅
- Parallel Execution Engine — DAG-based concurrency, variable substitution ✅

## ENTRY POINT

D:\Dev\oktyv\README.md — full tool reference
D:\Dev\oktyv\docs\ARCHITECTURE.md — system design
