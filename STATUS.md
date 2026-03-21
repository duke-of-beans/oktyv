# OKTYV — STATUS
Last Updated: 2026-03-20
Wave: 2 (Easter Agency content ops + portfolio automation layer)
Status: Production v1.2.0 — Browser engine fully operational end-to-end from Claude Desktop.

---

## WHAT OKTYV IS

Oktyv is the universal automation execution layer for the portfolio — the hands of AI
agents. 8 engines: Browser, API, Database, Email, File, Cron, Vault, Parallel Execution.
Standalone MCP server. Production-hardened with load testing, security audit (95/100),
performance optimization, and error recovery. TypeScript strict mode.

GREGORE orchestrates. Oktyv executes. Every product that needs to take action in the
real world calls Oktyv.

## CURRENT STATE

v1.2.0 shipped 2026-03-20. All 8 engines complete. 258/258 tests passing. Browser engine
now fully operational from Claude Desktop — navigate + screenshot + extract confirmed live.
CI/CD operational via GitHub Actions. Deployed as local MCP server (Claude Desktop config).
GitHub: duke-of-beans repo (check PROJECT_DNA.yaml for exact remote).

### v1.2.0 — Browser Engine Runtime Fix (2026-03-20)

The browser engine was theoretically complete but never actually worked from Claude Desktop
due to two environment issues that were never caught in testing:

**Bug 1 — Browser session path (EPERM):**
`BrowserSessionManager` defaulted to `'./browser-data'` which resolved to
`C:\Windows\system32\browser-data` when running as a Desktop Commander subprocess.
Fixed: hardcoded `D:/Dev/oktyv/browser-data` as default + `OKTYV_BROWSER_DATA_DIR`
env var wired into `claude_desktop_config.json`.

**Bug 2 — Puppeteer Chrome not installed:**
Puppeteer needs a separate Chrome download. The browser engine code was complete but
Chrome was never installed, so every `browser_navigate` call failed with
`Could not find Chrome (ver. 131.0.6778.204)`.
Fixed: ran `node node_modules/puppeteer/install.mjs` → Chrome installed to
`D:/Cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe`.
`PUPPETEER_CACHE_DIR=D:/Cache/puppeteer` added to claude_desktop_config.json.
`executablePath` now resolved from env var in `session.ts`.

**Result:** `browser_navigate` + `browser_screenshot` + `browser_extract` all confirmed
working live. First real end-to-end browser automation from Claude Desktop.

## OPEN WORK

- [ ] Integration with Easter Agency content operations (Wave 2 — automate posting/monitoring)
- [ ] Integration with Lead-Gen-System (Oktyv orchestrates scraping + enrichment pipeline)
- [ ] Integration with SCRVNR (Oktyv handles file output + delivery)
- [ ] v1.3.0: Visual Inspection Layer — browser_scroll_capture, browser_selector_capture,
       browser_computed_styles, browser_batch_audit, browser_session_cleanup.
       Temp screenshots on D:\ only, auto-cleanup, parallel hardware-limited batch.
       Generalized: works for GAD fleet, COVOS dashboard, GregLite, DTS, Easter Agency.
       See ROADMAP.md Phase 10 for full spec.
- [ ] Wire into COVOS Intelligence Engine for automated scan dispatch
- [ ] Wire into ContentStudio for GAD fleet visual audit automation
- [ ] Claude in Chrome navigate tool: consistently times out cross-domain — workaround: pre-load tabs manually

## WHAT IS OPERATIONAL

- Browser Engine — Puppeteer, LinkedIn/Indeed/Wellfound connectors, stealth mode ✅ (CONFIRMED LIVE 2026-03-20)
- Vault Engine — AES-256-GCM, OS keychain, encrypted credential storage ✅
- API Engine — Universal HTTP, OAuth 2.0, auto-pagination, circuit breaker ✅
- Database Engine — PostgreSQL, MySQL, SQLite, MongoDB, connection pooling ✅
- Email Engine — Gmail OAuth, SMTP send, IMAP receive, attachment handling ✅
- File Engine — Local + S3, archives, file watching, batch operations ✅
- Cron Engine — Scheduled automation, timezone support, execution history ✅
- Parallel Execution Engine — DAG-based concurrency, variable substitution ✅

## ENTRY POINT

D:\Dev\oktyv\PROJECT_DNA.yaml — project identity and full capability map.
D:\Dev\oktyv\README.md — usage documentation.
