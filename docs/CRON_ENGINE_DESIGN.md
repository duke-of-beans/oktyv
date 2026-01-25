# Cron Engine Design Document

**Engine**: 7 of 7 (FINAL ENGINE!)
**Status**: 🔄 IN PROGRESS  
**Version**: 0.8.0-alpha.1 (target)  
**Dependencies**: None (standalone scheduling)

## Overview

The Cron Engine provides task scheduling and automation capabilities using cron expressions. It enables recurring tasks, one-time scheduled tasks, task monitoring, and execution history tracking.

## Core Capabilities

### 1. Task Scheduling
- Cron expression parsing and validation
- Recurring tasks (daily, weekly, monthly, custom)
- One-time scheduled tasks
- Timezone support
- Task queuing and execution

### 2. Task Management
- Create scheduled tasks
- List all tasks
- Get task details
- Pause/resume tasks
- Delete tasks
- Update task schedules

### 3. Execution Tracking
- Task execution history
- Success/failure tracking
- Execution logs
- Next run time calculation
- Statistics (success rate, avg duration)

### 4. Task Types
- Shell commands
- HTTP requests
- Function calls
- MCP tool calls

## Architecture

```
┌─────────────┐
│   Claude    │
│   (User)    │
└──────┬──────┘
       │ MCP Tools
       ▼
┌────────────────────────────────────┐
│         Cron Engine                │
│       (CronEngine.ts)              │
├────────────────────────────────────┤
│ ┌──────────────┐  ┌─────────────┐ │
│ │   Scheduler  │  │   Parser    │ │
│ │   Manager    │  │             │ │
│ └──────────────┘  └─────────────┘ │
│ ┌──────────────┐  ┌─────────────┐ │
│ │    Task      │  │  Execution  │ │
│ │   Manager    │  │   Tracker   │ │
│ └──────────────┘  └─────────────┘ │
│ ┌──────────────┐  ┌─────────────┐ │
│ │   History    │  │   Logger    │ │
│ │   Manager    │  │             │ │
│ └──────────────┘  └─────────────┘ │
└────────────────────────────────────┘
```

## Component Design

### 1. Scheduler Manager (`SchedulerManager.ts`)

**Purpose**: Core scheduling engine using node-cron

**Features**:
- Start/stop scheduler
- Schedule tasks with cron expressions
- Execute tasks at scheduled times
- Handle timezone conversions
- Manage task queue

**Key Operations**:
```typescript
- schedule(taskId, cronExpression, callback, timezone?) → ScheduledTask
- unschedule(taskId) → void
- pauseTask(taskId) → void
- resumeTask(taskId) → void
- getNextRun(cronExpression, timezone?) → Date
- validate(cronExpression) → boolean
```

### 2. Cron Parser (`CronParser.ts`)

**Purpose**: Parse and validate cron expressions

**Features**:
- Parse cron syntax (5 or 6 field)
- Validate expressions
- Calculate next execution times
- Human-readable descriptions
- Common presets (daily, weekly, etc.)

**Cron Format**:
```
┌───────────── minute (0-59)
│ ┌─────────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌─────── month (1-12)
│ │ │ │ ┌───── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *

Examples:
- "0 9 * * *"      → Daily at 9:00 AM
- "*/15 * * * *"   → Every 15 minutes
- "0 0 * * 0"      → Weekly on Sunday at midnight
- "0 0 1 * *"      → Monthly on the 1st at midnight
```

**Presets**:
```typescript
- @hourly    → "0 * * * *"
- @daily     → "0 0 * * *"
- @weekly    → "0 0 * * 0"
- @monthly   → "0 0 1 * *"
- @yearly    → "0 0 1 1 *"
```

### 3. Task Manager (`TaskManager.ts`)

**Purpose**: CRUD operations for scheduled tasks

**Features**:
- Create tasks
- List tasks (all, active, paused)
- Get task details
- Update tasks
- Delete tasks
- Task persistence (JSON file)

**Task Structure**:
```typescript
interface CronTask {
  id: string;
  name: string;
  description?: string;
  type: 'shell' | 'http' | 'function' | 'mcp';
  schedule: string; // cron expression
  timezone?: string;
  enabled: boolean;
  action: TaskAction;
  retries?: number;
  timeout?: number; // ms
  createdAt: Date;
  updatedAt: Date;
  lastRun?: Date;
  nextRun?: Date;
}

interface TaskAction {
  shell?: string; // Shell command
  http?: HttpAction; // HTTP request
  function?: string; // Function name
  mcp?: McpAction; // MCP tool call
}
```

### 4. Execution Tracker (`ExecutionTracker.ts`)

**Purpose**: Track task executions and results

**Features**:
- Record execution start/end
- Track success/failure
- Store execution logs
- Calculate statistics
- Execution history (last N runs)

**Execution Record**:
```typescript
interface TaskExecution {
  id: string;
  taskId: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // ms
  status: 'running' | 'success' | 'failed' | 'timeout';
  result?: any;
  error?: string;
  logs: string[];
  retryCount: number;
}
```

### 5. History Manager (`HistoryManager.ts`)

**Purpose**: Manage execution history and statistics

**Features**:
- Store execution records
- Query execution history
- Calculate statistics
- Prune old history
- Export history

**Operations**:
```typescript
- getHistory(taskId, limit?) → TaskExecution[]
- getStatistics(taskId) → TaskStatistics
- clearHistory(taskId) → void
- pruneHistory(olderThan: Date) → number
```

### 6. Logger (`CronLogger.ts`)

**Purpose**: Logging for cron operations

**Features**:
- Task execution logs
- Scheduler events
- Error logging
- Log rotation
- Log levels (debug, info, warn, error)

## MCP Tools

### `cron_create_task`

Create scheduled task:

```typescript
cron_create_task({
  name: "Daily Backup",
  description: "Backup database daily at 2 AM",
  schedule: "0 2 * * *", // 2 AM daily
  type: "shell",
  action: {
    shell: "pg_dump mydb > backup.sql"
  },
  timezone: "America/New_York",
  retries: 3,
  timeout: 300000 // 5 minutes
})
```

### `cron_list_tasks`

List all tasks:

```typescript
cron_list_tasks({
  status: "active" | "paused" | "all"
})
```

### `cron_get_task`

Get task details:

```typescript
cron_get_task({
  taskId: "task-123"
})
```

### `cron_update_task`

Update task:

```typescript
cron_update_task({
  taskId: "task-123",
  schedule: "0 3 * * *", // Change to 3 AM
  enabled: true
})
```

### `cron_delete_task`

Delete task:

```typescript
cron_delete_task({
  taskId: "task-123"
})
```

### `cron_pause_task`

Pause task:

```typescript
cron_pause_task({
  taskId: "task-123"
})
```

### `cron_resume_task`

Resume task:

```typescript
cron_resume_task({
  taskId: "task-123"
})
```

### `cron_run_now`

Execute task immediately:

```typescript
cron_run_now({
  taskId: "task-123"
})
```

### `cron_get_history`

Get execution history:

```typescript
cron_get_history({
  taskId: "task-123",
  limit: 20
})
```

### `cron_get_statistics`

Get task statistics:

```typescript
cron_get_statistics({
  taskId: "task-123"
})
```

### `cron_validate_expression`

Validate cron expression:

```typescript
cron_validate_expression({
  expression: "0 9 * * *"
})
// Returns: { valid: true, nextRun: Date, description: "Daily at 9:00 AM" }
```

## Dependencies

```json
{
  "node-cron": "^3.0.3",
  "cronstrue": "^2.50.0"
}
```

## Security Features

### 1. Command Injection Prevention
- Sanitize shell commands
- Whitelist allowed commands
- Validate parameters

### 2. Resource Limits
- Max concurrent executions
- Execution timeouts
- Memory limits

### 3. Access Control
- Task ownership
- Permission checks

## Error Handling

**Error Codes**:
- `INVALID_CRON_EXPRESSION` - Invalid cron syntax
- `TASK_NOT_FOUND` - Task doesn't exist
- `TASK_ALREADY_EXISTS` - Duplicate task ID
- `EXECUTION_TIMEOUT` - Task exceeded timeout
- `EXECUTION_FAILED` - Task execution failed
- `SCHEDULER_ERROR` - Scheduler malfunction

## Performance Optimization

### 1. Efficient Scheduling
- Single scheduler instance
- Minimal overhead
- Event-driven execution

### 2. History Management
- Automatic pruning
- Configurable retention
- Indexed queries

### 3. Parallel Execution
- Non-blocking execution
- Concurrent task support
- Queue management

## File Structure

```
src/tools/cron/
├── CronEngine.ts           # Main orchestrator
├── SchedulerManager.ts     # Task scheduling
├── CronParser.ts           # Cron expression parsing
├── TaskManager.ts          # Task CRUD
├── ExecutionTracker.ts     # Execution tracking
├── HistoryManager.ts       # History management
├── CronLogger.ts           # Logging
└── tools.ts                # MCP tool definitions
```

## Testing Strategy

### Unit Tests
- Cron expression parsing
- Schedule validation
- Next run calculation
- Task CRUD operations
- Execution tracking

### Integration Tests
- End-to-end task scheduling
- Task execution
- History tracking
- Error scenarios

### Target: 40+ tests

## Implementation Plan

### Phase 1: Core Scheduling (Day 1)
- [ ] CronParser.ts - Expression parsing
- [ ] SchedulerManager.ts - Task scheduling
- [ ] Tests: 15 tests

### Phase 2: Task Management (Day 1-2)
- [ ] TaskManager.ts - Task CRUD
- [ ] ExecutionTracker.ts - Execution tracking
- [ ] Tests: 12 tests

### Phase 3: History & Logging (Day 2)
- [ ] HistoryManager.ts - History management
- [ ] CronLogger.ts - Logging
- [ ] Tests: 8 tests

### Phase 4: Integration (Day 2-3)
- [ ] CronEngine.ts - Main orchestrator
- [ ] tools.ts - 11 MCP tools
- [ ] Server integration
- [ ] Tests: 10+ tests

### Total: 45+ tests, 3 days

## Example Workflows

### Workflow 1: Daily Database Backup

```typescript
// 1. Create backup task
await cron_create_task({
  name: "Daily DB Backup",
  schedule: "0 2 * * *", // 2 AM daily
  type: "shell",
  action: {
    shell: "pg_dump production > /backups/db-$(date +%Y%m%d).sql"
  },
  timezone: "UTC",
  retries: 2
});

// 2. Monitor executions
const history = await cron_get_history({
  taskId: "backup-task",
  limit: 7
});

// 3. Check statistics
const stats = await cron_get_statistics({
  taskId: "backup-task"
});
```

### Workflow 2: API Health Check

```typescript
// Check API health every 5 minutes
await cron_create_task({
  name: "API Health Check",
  schedule: "*/5 * * * *",
  type: "http",
  action: {
    http: {
      url: "https://api.example.com/health",
      method: "GET",
      expectedStatus: 200
    }
  },
  timeout: 5000
});
```

### Workflow 3: Weekly Report Generation

```typescript
// Generate report every Monday at 9 AM
await cron_create_task({
  name: "Weekly Report",
  schedule: "0 9 * * 1", // Monday 9 AM
  type: "mcp",
  action: {
    mcp: {
      tool: "generate_report",
      args: {
        type: "weekly",
        recipients: ["team@example.com"]
      }
    }
  }
});
```

## Next Steps

1. Install dependencies (node-cron, cronstrue)
2. Create file structure
3. Implement Phase 1 (Parser + Scheduler)
4. Implement Phase 2 (Task Management + Tracking)
5. Implement Phase 3 (History + Logging)
6. Implement Phase 4 (Integration)
7. Documentation
8. Version bump to 0.8.0-alpha.1

**THE FINAL ENGINE!** 🎯

LFG! ⏰
