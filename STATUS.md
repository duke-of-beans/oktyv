# OKTYV — STATUS
Last Updated: 2026-03-21
Wave: 2 (Easter Agency content ops + portfolio automation layer)
Status: Production v1.3.0 — Visual Inspection Layer live. 5 new MCP tools for automated visual QA across entire portfolio.

---

## WHAT OKTYV IS

Oktyv is the universal automation execution layer for the portfolio — the hands of AI
agents. 8 engines: Browser, API, Database, Email, File, Cron, Vault, Parallel Execution.
Standalone MCP server. Production-hardened with load testing, security audit (95/100),
performance optimization, and error recovery. TypeScript strict mode.

GREGORE orchestrates. Oktyv executes. Every product that needs to take action in the
real world calls Oktyv.

## CURRENT STATE

v1.3.0 shipped 2026-03-21. Visual Inspection Layer complete. 5 new MCP tools:
browser_scroll_capture, browser_selector_capture, browser_computed_styles,
browser_batch_audit, browser_session_cleanup. Temp-only screenshots on D:\,
auto-cleanup default, parallel batch (maxConcurrent:3), computed styles zero disk I/O.
Session manager unit tests: 13/13 passing. Browser tools confirmed at build level;
live browser activation requires Claude Desktop restart (same pattern as v1.2.0).

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
- [x] v1.3.0: Visual Inspection Layer — browser_scroll_capture, browser_selector_capture,
       browser_computed_styles, browser_batch_audit, browser_session_cleanup. SHIPPED 2026-03-21.
- [ ] image_read tool — read local image file (PNG/JPG/GIF/WebP), return base64 for inline
       display. Completes local visual inspection capability alongside file:// browser support.
       ~20 lines. No Puppeteer needed — pure fs.readFileSync + base64 encode.
       Note: browser_navigate already supports file:// for local HTML/PDF/image rendering.
- [ ] Wire into COVOS Intelligence Engine for automated scan dispatch
- [ ] Wire into ContentStudio for GAD fleet visual audit automation
- [ ] Claude in Chrome navigate tool: consistently times out cross-domain — workaround: pre-load tabs manually

## WHAT IS OPERATIONAL

- Browser Engine — Puppeteer, LinkedIn/Indeed/Wellfound connectors, stealth mode ✅ (CONFIRMED LIVE 2026-03-20)
- Visual Inspection Layer — scroll_capture, selector_capture, computed_styles, batch_audit, session_cleanup ✅ (SHIPPED 2026-03-21)
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
