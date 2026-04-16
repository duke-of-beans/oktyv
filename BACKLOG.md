# OKTYV — BACKLOG
Last Updated: 2026-04-16

## P1 — High Priority
- [ ] Integration with Easter Agency content operations (Wave 2 — automate posting/monitoring)
- [ ] Wire into ContentStudio for GAD fleet visual audit automation

## P2 — Normal Queue
- [ ] Integration with Lead-Gen-System (orchestrate scraping + enrichment pipeline)
- [ ] Integration with SCRVNR (file output + delivery handling)
- [ ] Wire into COVOS Intelligence Engine for automated scan dispatch
- [ ] Claude in Chrome cross-domain timeout — workaround is pre-load tabs; proper fix is retry/wait logic in GenericBrowserConnector

## P3 — Eventually
- [ ] Full GREGORE integration as execution layer
- [ ] Email engine MCP tools — EmailEngine exists (Gmail OAuth, SMTP, IMAP) but tools not registered in server.ts
- [ ] Cron engine MCP tools — CronEngine exists but tools not registered in server.ts
- [ ] Database engine MCP tools — DatabaseEngine exists but tools not registered in server.ts
- [ ] Indeed job board connector — files exist (indeed-search.ts, indeed-job.ts, indeed-company.ts) but not wired into server.ts

## Completed
- [x] v1.6.0: Email engine MCP tools (8 tools: Gmail, SMTP, IMAP, parse)
- [x] v1.6.0: Cron engine MCP tools (12 tools: task management, history, validation)
- [x] v1.6.0: Database engine MCP tools (9 tools: PostgreSQL, MySQL, SQLite, MongoDB)
- [x] v1.6.0: Indeed connector MCP tools (3 tools: search, job detail, company)
- [x] v1.5.0: API engine MCP tools — api_request (vault-backed), api_oauth_init/callback/refresh, Zoho OAuth provider
- [x] v1.4.0: Shell Engine — shell_batch, concurrent child processes, DAG deps
- [x] v1.3.0: image_read tool — local image file → base64, no Puppeteer
- [x] v1.3.0: Visual Inspection Layer — browser_scroll_capture, browser_selector_capture, browser_computed_styles, browser_batch_audit, browser_session_cleanup
- [x] v1.3.0: McpServer migration (SDK 1.25.x) — fixes Claude Desktop 60s timeout
- [x] v1.2.0: All engines complete, 258/258 tests, browser runtime fixed (EPERM + Puppeteer Chrome)
- [x] CI/CD via GitHub Actions operational
- [x] Security audit 95/100
