---
name: Oktyv
description: Universal automation execution layer for AI agents — 10 production-ready engines covering browser automation, authenticated API calls, shell execution, email, databases, file operations, credential vault, cron scheduling, parallel execution, and visual QA via MCP.
author: duke-of-beans
homepage: https://github.com/duke-of-beans/oktyv
license: MIT
---

# Oktyv Skills

## Authenticated API Execution

Make vault-backed HTTP requests to any API — credentials stored encrypted and
injected automatically. Full OAuth 2.0 flows for Google, GitHub, Stripe, Slack,
and Zoho. Secrets never appear in prompts or logs.

## Browser Automation & Visual QA

Puppeteer-based browser control for navigation, clicking, form filling, data
extraction, and screenshots. Parallel visual auditing across multiple URLs,
computed style verification, and scroll-capture for full-page layout checks.

## Shell & Parallel Execution

Run N shell commands concurrently with DAG-based dependency ordering. Execute
multiple Oktyv tools simultaneously with dependency resolution and variable
substitution between tasks.

## Email, Database & Scheduling

Send and receive email via Gmail OAuth, SMTP, and IMAP. Connect to PostgreSQL,
MySQL, SQLite, and MongoDB with vault-backed connection strings and ACID
transactions. Schedule recurring tasks with cron expressions and SQLite
persistence.

## Encrypted Credential Vault

AES-256-GCM encrypted credential storage with OS keychain master key. Store,
retrieve, and rotate API keys and tokens — never on disk in plaintext.

---

## Prompts

- "Make an authenticated API call to Vercel and list my deployments"
- "Run these 5 shell commands in parallel and tell me which fail"
- "Take a screenshot of this URL and check if the layout looks correct"
- "Send an email via Gmail to X about Y"
- "Store this API key securely in the vault"
- "Query the database and return all records from the users table"
- "Schedule a task to run every day at 9am"
- "Run a visual audit across these 10 URLs and compare their computed styles"
- "Execute these API calls concurrently and aggregate the results"

---

## Resources

- `.oktyvrc.example` — Example configuration file
- `src/engines/` — All 10 engine implementations
- `docs/SHELL_ENGINE_DESIGN.md` — Shell engine spec and usage
- `docs/PARALLEL_EXECUTION_DESIGN.md` — DAG parallel execution spec
- `docs/ARCHITECTURE.md` — Full system architecture
