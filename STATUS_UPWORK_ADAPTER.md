# Oktyv Upwork Adapter — STATUS

**Last updated:** 2026-04-21
**Status:** Working end-to-end via `puppeteer-real-browser`. All three endpoints (`upwork_search_jobs`, `upwork_get_job`, `upwork_get_client`) bypass Cloudflare and return real data.

## The shipped architecture

Upwork is isolated from the shared `BrowserSessionManager` because it's the only platform with full Cloudflare Turnstile enforcement on job-detail and client-profile pages. All Upwork navigation routes through `src/browser/upwork-real-browser.ts`, which uses `puppeteer-real-browser` — a maintained library that handles Cloudflare Turnstile auto-solving and presents a non-automated browser fingerprint.

LinkedIn, Indeed, and Wellfound continue to use the standard session manager unchanged.

## Key files

- `src/browser/upwork-real-browser.ts` — Isolated real-browser session manager. Single cached browser instance, reused across calls within a server lifetime.
- `src/browser/auth.ts` — Platform-agnostic cookie persistence (save/load/verify/apply). Used for login state capture, not required for public pages.
- `src/connectors/upwork.ts` — `searchJobs`, `getJob`, `getClient`, `captureLogin` all route through `getUpworkRealSession()`.
- `src/tools/upwork-job.ts` — Text-pattern extractor (regex against `document.body.innerText`). Resilient to Upwork DOM revisions.
- `scripts/capture-upwork-login.mjs` — Standalone login re-seed utility (for when saved session expires).
- `scripts/test-real-browser.mjs` — Smoke test for `puppeteer-real-browser` cold-hit against Upwork.

## Why this path (what we learned)

Three approaches failed, confirming the research-backed route was correct:
1. **Profile-directory persistence (`userDataDir`):** Chrome 146 uses App-Bound Encryption (v20) for cookie values. Profile migration across binary versions invalidates sessions silently. Cookies in SQLite aren't decryptable outside Chrome's own process anymore.
2. **Stealth-plugin + bundled Chromium:** `puppeteer-extra-plugin-stealth` patches DOM/navigator properties but doesn't solve TLS fingerprint or Turnstile challenges. Cloudflare still challenges.
3. **Manual cookie extraction from real Chrome Profile 1:** v20 encryption blocks this (Google's deliberate defense against cookie-stealing malware, post-July-2024).

`puppeteer-real-browser` works because it launches a genuine Chrome binary, negotiates Turnstile server-side, and presents TLS/fingerprint signals that Cloudflare accepts. Verified working on 2026-04-21.

## Known limitations and edge cases

- **First-run latency:** Real-browser session takes ~8-12s to launch. Subsequent calls reuse the cached session.
- **Turnstile settle time:** 6s explicit delay after `networkidle2` before checking for selectors. Without this, the DOM isn't ready even though `load` fired.
- **Extractor field quality:** The text-pattern extractor sometimes grabs nearby UI text instead of actual values (`title: "Explore similar jobs on Upwork"`, `company: "Member"`, `country: "Member"`). Data that matters (bid range, proposals, client rating, hours/week, client activity) is clean. Minor field-mapping cleanups tracked as future work.
- **Auth cookies not strictly required** for public job/client pages. `captureLogin` + `auth.ts` are kept for future use cases that need authenticated-only fields (bid range for Freelancer Plus users, private client profile attributes).

## Routine maintenance

- **If the browser crashes:** The `disconnected` event clears the cached session. Next call launches a fresh one automatically.
- **If Upwork changes DOM:** The text-pattern extractor is more resilient than selectors but not immune. Update regex patterns in `src/tools/upwork-job.ts`.
- **If Cloudflare escalates:** `puppeteer-real-browser` maintainers ship updates regularly. `npm update puppeteer-real-browser` is the first move.

## Smoke test

```
Oktyv-MCP:upwork_get_job({jobId: "~022046430890836324972"})
```

Expected: ~15s wall time, returns `job` object with title, description, upworkMeta (proposalsRange, clientRating, clientTotalHires, clientActiveHires, clientMemberSince, hoursPerWeek, upworkExperienceLevel, projectType).

## Next steps (not done)

1. **Briefing layer:** Scoring rubric on top of `upwork_search_jobs` → daily ranked list of best-fit gigs to `D:/Meta/UPWORK_BRIEFING.md`. Score against profile: rate fit (0-40), skill overlap (0-30), client quality (0-20), keyword resonance (0-10), leverage-tier (0-10).
2. **Field-mapping cleanup:** Fix `title`/`company`/`country` "Member" artifacts in the extractor. Low priority — doesn't block decisions.
3. **Multi-job parallelization:** Currently one job detail at a time. For morning briefings, could parallelize 5-10 detail fetches.
