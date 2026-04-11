# Shell Engine — Design Spec
**Version:** 1.0.0
**Status:** Approved — implemented in this session
**Date:** 2026-04-11

---

## Problem

Desktop Commander `start_process` + `read_process_output` is sequential from Claude's
perspective. Starting three npm installs or git operations requires three separate
tool-call round-trips, each waiting for the previous. For independent shell commands
(different projects, different concerns) this is pure wasted wall-clock time.

## Solution

`shell_batch` — a single MCP tool that accepts N shell commands, runs them as concurrent
child processes, and returns all results when the last one finishes.

---

## Tool: `shell_batch`

```json
{
  "commands": [
    {
      "id": "install",
      "cmd": "npm install --no-audit --no-fund",
      "cwd": "D:\\Projects\\forme",
      "timeout": 120000
    },
    {
      "id": "lint",
      "cmd": "npm run lint",
      "cwd": "D:\\Dev\\oktyv"
    },
    {
      "id": "typecheck",
      "cmd": "npx tsc --noEmit",
      "cwd": "D:\\Projects\\forme",
      "dependsOn": ["install"]
    }
  ],
  "config": {
    "maxConcurrent": 5,
    "failureMode": "continue",
    "defaultTimeout": 60000,
    "defaultShell": "powershell"
  }
}
```

**Execution:** `install` and `lint` run immediately in parallel. `typecheck` waits for
`install` to complete (uses `dependsOn` — same DAG pattern as parallel engine).

---

## Types

### ShellCommand
| Field | Type | Required | Description |
|---|---|---|---|
| id | string | ✅ | Unique identifier for this command |
| cmd | string | ✅ | Shell command string to execute |
| cwd | string | ❌ | Working directory (default: D:\) |
| env | Record<string,string> | ❌ | Extra environment variables |
| timeout | number | ❌ | Per-command timeout ms (overrides config default) |
| shell | string | ❌ | Shell override: "powershell", "cmd", "bash" |
| dependsOn | string[] | ❌ | Command IDs that must succeed before this runs |

### ShellBatchConfig
| Field | Type | Default | Description |
|---|---|---|---|
| maxConcurrent | number | 5 | Max simultaneous child processes |
| failureMode | "continue"\|"stop" | "continue" | Stop all on first failure, or keep going |
| defaultTimeout | number | 300000 | Per-command timeout if not specified (5 min) |
| defaultShell | string | auto | "powershell" on Windows, "sh" on Unix |

### ShellCommandResult
| Field | Type | Description |
|---|---|---|
| id | string | Command ID |
| status | "success"\|"failed"\|"skipped" | Execution outcome |
| exitCode | number | Process exit code (-1 if timed out) |
| stdout | string | Standard output (trimmed) |
| stderr | string | Standard error (trimmed) |
| duration | number | Execution time in ms |
| startTime | string | ISO timestamp |
| endTime | string | ISO timestamp |

### ShellBatchResult
| Field | Type | Description |
|---|---|---|
| executionId | string | UUID for this batch run |
| status | "success"\|"partial"\|"failure" | Overall outcome |
| startTime | string | ISO timestamp |
| endTime | string | ISO timestamp |
| duration | number | Total wall-clock time in ms |
| commands | Record<string, ShellCommandResult> | Per-command results |
| summary | { total, succeeded, failed, skipped } | Counts |

---

## Architecture

Uses the same DAG + level-by-level execution pattern as ParallelExecutionEngine:
1. Build dependency graph from `dependsOn` declarations
2. Topological sort into levels
3. Execute each level with `Promise.allSettled` + concurrency cap
4. Collect results, handle `failureMode`
5. Return complete ShellBatchResult

Child process execution uses Node.js `child_process.spawn` with:
- Shell wrapping (`/bin/sh -c cmd` or `powershell -Command cmd`)
- stdout/stderr capture via streams
- Exit code capture
- Timeout via `setTimeout` + `process.kill()`

---

## Files

```
src/engines/shell/
  types.ts          — all TypeScript interfaces
  ShellEngine.ts    — main engine + DAG execution
```

`src/server.ts` — adds `shell_batch` MCP tool + handler

---

## Non-Goals

- No variable substitution between shell commands (use shell pipes for that)
- No rollback (shell commands are not transactional)
- No retry policy per command (retry at the caller level if needed)
- Not a replacement for Desktop Commander (still use DC for interactive processes)

---

## When to Use

| Scenario | Tool |
|---|---|
| Run npm install + tsc + git status simultaneously | `shell_batch` |
| Run browser scrape + file write + email send | `parallel_execute` |
| Stream output of a long-running process | Desktop Commander `start_process` |
| Single shell command | Desktop Commander `start_process` |

---

*Implemented: 2026-04-11 | Engine: Oktyv v1.4.0*
