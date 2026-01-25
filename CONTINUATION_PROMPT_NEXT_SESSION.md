# CONTINUATION PROMPT - NEXT SESSION

**Last Updated:** 2026-01-24  
**Version:** v0.2.0-alpha.2  
**Status:** Browser Engine COMPLETE | 6 Engines REMAINING

---

## CRITICAL: SCOPE CLARIFICATION HAPPENED

**What User Wants:** ALL 7 ENGINES (complete universal automation layer)  
**What's Been Built:** 1 of 7 engines (Browser Engine only)  
**What Remains:** 6 engines (API, Database, Email, File, Cron, Vault)

**DO NOT assume Browser Engine = complete product**  
**READ:** SCOPE_AGREEMENT.md for full context

---

## CURRENT STATUS

### ✅ COMPLETE (Browser Engine)
- Version: v0.2.0-alpha.2
- Status: Production-ready
- Testing: 52 tests, 100% passing
- CI/CD: GitHub Actions operational
- Documentation: Complete

**Capabilities:**
- LinkedIn connector (search, jobs, companies)
- Indeed connector (search, jobs, companies)
- Wellfound connector (search, jobs, companies)
- Generic browser tools (navigate, click, type, extract, screenshot, PDF, fillForm)
- Session persistence (cookie-based)
- Rate limiting (token bucket)
- Error handling and retry logic

### 🔲 NOT STARTED (6 Engines)

**API Engine (Axios):**
- HTTP/REST/GraphQL client
- OAuth 2.0 flows
- Pagination handling
- Rate limiting per endpoint
- Webhook management

**Database Engine (Prisma):**
- SQL operations (PostgreSQL, MySQL, SQLite)
- NoSQL operations (MongoDB, Redis)
- Transactions, migrations, backups
- Query builders

**Email Engine (Nodemailer):**
- Send emails (Gmail, Outlook, SMTP)
- Search inbox, extract data
- Attachment handling
- Email templates

**File Engine (Node.js fs):**
- File system operations
- Cloud storage (S3, Google Drive, Dropbox)
- Format conversion (PDF, DOCX, CSV, JSON)
- File compression, encryption

**Cron Engine (node-cron):**
- Scheduled task automation
- Recurring and one-time tasks
- Job persistence, monitoring
- Error handling and retries

**Vault Engine (AES-256):**
- Secure credential storage
- OS keychain integration
- API keys, passwords, tokens
- Local-only encryption

---

## NEXT STEPS (USER DECIDES)

**Before starting ANY work:**

1. **Read scope verification protocol:**
   ```bash
   Filesystem:read_file D:\Dev\SCOPE_VERIFICATION_PROTOCOL.md
   ```

2. **Ask user which engine to build next:**
   ```
   I see we've completed the Browser Engine (1 of 7). 
   Which engine should I build next?

   HIGH PRIORITY OPTIONS:
   1. API Engine - HTTP/REST/GraphQL automation (unlocks integrations)
   2. Vault Engine - Encrypted credential storage (required for production)
   3. Database Engine - SQL/NoSQL operations (enables data persistence)

   Or specify another engine from the remaining 6.
   ```

3. **Read engine specification from VISION.md:**
   - Review capabilities
   - Review tools to build
   - Review use cases
   - Review success criteria

4. **Create implementation plan:**
   - Core components
   - Tool definitions
   - Test strategy
   - CI/CD integration

5. **Get user approval**

6. **ONLY THEN start coding**

---

## IMPORTANT FILES TO READ

**Project Truth:**
- D:\Dev\oktyv\PROJECT_DNA.yaml (current state, scope agreement)
- D:\Dev\oktyv\SCOPE_AGREEMENT.md (why 7 engines, not 1)

**Product Vision:**
- D:\Dev\oktyv\VISION.md (complete 7-engine specifications)
- D:\Dev\oktyv\ROADMAP.md (implementation phases)

**Current Implementation:**
- D:\Dev\oktyv\README.md (what's built, what remains)
- D:\Dev\oktyv\src/ (Browser Engine source code)
- D:\Dev\oktyv\tests/ (52 tests, all passing)

**Process:**
- D:\Dev\SCOPE_VERIFICATION_PROTOCOL.md (prevent MVP creep)

---

## WHAT NOT TO DO

❌ **DO NOT rebuild Browser Engine** - It's complete unless user reports bugs  
❌ **DO NOT assume 1 engine = complete product** - Goal is ALL 7  
❌ **DO NOT provide time estimates** - No "Month X" or "X hours" estimates  
❌ **DO NOT start coding without scope confirmation** - Ask which engine first  
❌ **DO NOT skip tests** - Each engine needs comprehensive test suite  
❌ **DO NOT skip CI/CD** - Each engine needs GitHub Actions integration  
❌ **DO NOT skip docs** - Each engine needs complete documentation

---

## BUILD PHILOSOPHY

**Option B Perfection:**
- Do it right first time
- Zero technical debt
- No mocks, stubs, or placeholders
- Complete implementation before moving to next engine

**Each Engine Needs:**
1. Full implementation (all tools specified in VISION.md)
2. Comprehensive test suite (unit + integration, 100% passing)
3. CI/CD automation (GitHub Actions)
4. Complete documentation (README, tool docs, examples)

**Ship When:** All 7 engines complete (v1.0.0 production release)

---

## QUICK START (NEXT SESSION)

```typescript
// 1. Load context
KERNL:get_session_context({ project: "oktyv", mode: "auto" })

// 2. Read scope agreement
Filesystem:read_file("D:\\Dev\\oktyv\\SCOPE_AGREEMENT.md")

// 3. Ask user which engine to build
// (Don't start coding until user confirms)

// 4. Read engine spec from VISION.md
Filesystem:read_file("D:\\Dev\\oktyv\\VISION.md")

// 5. Create implementation plan
// 6. Get user approval
// 7. Start building next engine
```

---

## SESSION CHECKPOINTS

When building next engine:

**Every 5-10 tool calls:**
```typescript
SHIM:shim_auto_checkpoint({
  current_task: "Building [Engine Name] - [current component]",
  active_files: ["list of files being worked on"],
  decisions: ["key decisions made"],
  next_steps: ["what's next"],
  progress: 0.XX  // 0.0-1.0
})
```

**If session crashes:**
- Checkpoint data available for recovery
- Resume from last checkpoint
- Don't restart from scratch

---

## SUCCESS CRITERIA (COMPLETE PRODUCT)

**Oktyv is DONE when:**
- ✅ All 7 engines implemented
- ✅ All 7 engines tested (100% pass rate each)
- ✅ All 7 engines have CI/CD
- ✅ All 7 engines documented
- ✅ Integration testing complete
- ✅ Version bumped to v1.0.0

**Current Progress:** 1 of 7 engines (14%)  
**Remaining Work:** 6 engines (86%)

---

**Last Updated:** 2026-01-24  
**Next Action:** User decides which engine to build next  
**Status:** Awaiting user input
