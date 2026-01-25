# PARALLEL EXECUTION ENGINE - IMPLEMENTATION SPEC

**Status:** APPROVED - Ready for Implementation  
**Decision:** Build complete DAG-based solution (Phase 2 only)  
**Rationale:** DAG is superset of simple parallel - handles all cases, no rework needed

---

## EXECUTIVE SUMMARY

Build a **Parallel Execution Engine** that allows Claude to execute multiple Oktyv operations concurrently with intelligent dependency management, resource control, and error handling.

**Core Capability:** User says "move files A→B AND fetch emails to Excel" - both operations run simultaneously.

**Key Decision:** Skip "simple parallel" MVP, build full DAG solution immediately.

---

## WHY DAG-FIRST (NOT PHASED APPROACH)

### The Wrong Approach (Rejected)
```yaml
phase_1: "Simple Promise.all() parallel (4-6 hours)"
phase_2: "Full DAG with dependencies (12-16 hours)"
total_time: "16-22 hours"
problem: "Phase 1 code is throwaway - completely replaced by Phase 2"
```

### The Right Approach (Approved)
```yaml
phase_2_only: "Full DAG from start (14-18 hours)"
benefit: "Handles simple AND complex cases from day 1"
savings: "2-4 hours + no rework + no breaking changes"
alignment: "Option B Perfection - do it right first time"
```

### DAG Handles Everything
```typescript
// Simple case (no dependencies):
tasks: [
  { id: "move", tool: "file_move", params: {...} },
  { id: "email", tool: "email_fetch", params: {...} }
]
// Both run in parallel (Level 0 of DAG)

// Complex case (with dependencies):
tasks: [
  { id: "fetch", tool: "email_fetch", params: {...} },
  { id: "parse", tool: "email_parse", dependsOn: ["fetch"] },
  { id: "save", tool: "file_write", dependsOn: ["parse"] }
]
// Level 0: fetch
// Level 1: parse (after fetch)
// Level 2: save (after parse)

// DAG handles BOTH cases perfectly
```

---

## ARCHITECTURE

### Core Components

```typescript
/**
 * Task Definition
 */
interface Task {
  id: string;                    // Unique identifier
  tool: string;                  // Oktyv tool name (e.g., "file_move")
  params: Record<string, any>;   // Tool parameters
  dependsOn?: string[];          // Task IDs this depends on (optional)
  priority?: number;             // 1-10, higher = first (optional)
  timeout?: number;              // Milliseconds (optional)
  vault?: string;                // Vault name for credentials (optional)
  retryPolicy?: {
    maxAttempts: number;
    backoff: 'exponential' | 'linear';
    initialDelay: number;
  };
}

/**
 * Execution Configuration
 */
interface ExecutionConfig {
  maxConcurrent?: number;        // Global concurrency limit (default: 10)
  failureMode?: 'continue' | 'stop' | 'rollback';  // Default: 'continue'
  timeout?: number;              // Overall timeout in ms (optional)
  enableRollback?: boolean;      // Enable transaction rollback (default: false)
}

/**
 * Execution Request
 */
interface ParallelExecutionRequest {
  tasks: Task[];
  config?: ExecutionConfig;
}

/**
 * Task Result
 */
interface TaskResult {
  taskId: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;              // Milliseconds
  result?: any;                  // Tool output
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  startTime: string;             // ISO timestamp
  endTime: string;               // ISO timestamp
}

/**
 * Execution Result
 */
interface ParallelExecutionResult {
  executionId: string;           // UUID for this execution
  status: 'success' | 'partial' | 'failure';
  startTime: string;
  endTime: string;
  duration: number;
  tasks: Record<string, TaskResult>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  dag?: {
    levels: string[][];          // Task IDs grouped by execution level
    edges: Array<{from: string; to: string}>;
  };
}
```

### DAG Builder

```typescript
/**
 * Dependency Graph Node
 */
interface DAGNode {
  task: Task;
  dependencies: Set<string>;     // Task IDs this depends on
  dependents: Set<string>;       // Task IDs that depend on this
  level?: number;                // Execution level (0 = no dependencies)
}

/**
 * Build dependency graph from tasks
 */
function buildDAG(tasks: Task[]): Map<string, DAGNode> {
  const graph = new Map<string, DAGNode>();
  
  // Step 1: Create nodes
  for (const task of tasks) {
    graph.set(task.id, {
      task,
      dependencies: new Set(task.dependsOn || []),
      dependents: new Set(),
      level: undefined
    });
  }
  
  // Step 2: Build reverse edges (dependents)
  for (const [taskId, node] of graph) {
    for (const depId of node.dependencies) {
      const depNode = graph.get(depId);
      if (!depNode) {
        throw new Error(`Task ${taskId} depends on non-existent task ${depId}`);
      }
      depNode.dependents.add(taskId);
    }
  }
  
  return graph;
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(graph: Map<string, DAGNode>): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(nodeId: string, path: string[]): string[] | null {
    if (recursionStack.has(nodeId)) {
      // Found cycle - return the cycle path
      const cycleStart = path.indexOf(nodeId);
      return path.slice(cycleStart).concat(nodeId);
    }
    
    if (visited.has(nodeId)) {
      return null; // Already processed
    }
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);
    
    const node = graph.get(nodeId)!;
    for (const depId of node.dependencies) {
      const cycle = dfs(depId, [...path]);
      if (cycle) return cycle;
    }
    
    recursionStack.delete(nodeId);
    return null;
  }
  
  for (const nodeId of graph.keys()) {
    if (!visited.has(nodeId)) {
      const cycle = dfs(nodeId, []);
      if (cycle) return cycle;
    }
  }
  
  return null;
}

/**
 * Topological sort - returns execution levels
 */
function topologicalSort(graph: Map<string, DAGNode>): string[][] {
  const levels: string[][] = [];
  const inDegree = new Map<string, number>();
  
  // Calculate in-degrees
  for (const [taskId, node] of graph) {
    inDegree.set(taskId, node.dependencies.size);
  }
  
  // Find all nodes with in-degree 0 (Level 0)
  let currentLevel = Array.from(graph.keys()).filter(id => inDegree.get(id) === 0);
  
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];
    
    // Process current level
    for (const taskId of currentLevel) {
      const node = graph.get(taskId)!;
      
      // Reduce in-degree of dependents
      for (const dependentId of node.dependents) {
        const newDegree = inDegree.get(dependentId)! - 1;
        inDegree.set(dependentId, newDegree);
        
        if (newDegree === 0) {
          nextLevel.push(dependentId);
        }
      }
    }
    
    currentLevel = nextLevel;
  }
  
  // Check if all nodes were processed
  if (levels.flat().length !== graph.size) {
    throw new Error('Topological sort failed - circular dependency detected');
  }
  
  return levels;
}
```

### Execution Engine

```typescript
/**
 * Parallel Execution Engine
 */
class ParallelExecutionEngine {
  private vaultEngine: VaultEngine;
  private toolRegistry: Map<string, Function>;
  
  constructor(vaultEngine: VaultEngine, toolRegistry: Map<string, Function>) {
    this.vaultEngine = vaultEngine;
    this.toolRegistry = toolRegistry;
  }
  
  /**
   * Execute tasks in parallel with dependency management
   */
  async execute(request: ParallelExecutionRequest): Promise<ParallelExecutionResult> {
    const executionId = crypto.randomUUID();
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    
    logger.info('Starting parallel execution', {
      executionId,
      taskCount: request.tasks.length,
      config: request.config
    });
    
    try {
      // Step 1: Build DAG
      const graph = buildDAG(request.tasks);
      
      // Step 2: Detect circular dependencies
      const cycle = detectCircularDependencies(graph);
      if (cycle) {
        throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`);
      }
      
      // Step 3: Topological sort
      const levels = topologicalSort(graph);
      
      logger.info('DAG built successfully', {
        executionId,
        levels: levels.length,
        tasksPerLevel: levels.map(l => l.length)
      });
      
      // Step 4: Execute level by level
      const taskResults: Record<string, TaskResult> = {};
      const config = request.config || {};
      const maxConcurrent = config.maxConcurrent || 10;
      
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        const level = levels[levelIndex];
        
        logger.info(`Executing level ${levelIndex}`, {
          executionId,
          taskCount: level.length
        });
        
        // Execute all tasks in this level in parallel (with concurrency limit)
        const levelResults = await this.executeLevelWithConcurrency(
          level,
          graph,
          taskResults,
          maxConcurrent,
          config
        );
        
        // Merge results
        Object.assign(taskResults, levelResults);
        
        // Check failure mode
        const failures = Object.values(levelResults).filter(r => r.status === 'failed');
        if (failures.length > 0 && config.failureMode === 'stop') {
          logger.warn('Stopping execution due to failures', {
            executionId,
            failedCount: failures.length
          });
          
          // Mark remaining tasks as skipped
          for (let i = levelIndex + 1; i < levels.length; i++) {
            for (const taskId of levels[i]) {
              taskResults[taskId] = {
                taskId,
                status: 'skipped',
                duration: 0,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString()
              };
            }
          }
          
          break;
        }
      }
      
      // Step 5: Calculate summary
      const summary = {
        total: request.tasks.length,
        succeeded: Object.values(taskResults).filter(r => r.status === 'success').length,
        failed: Object.values(taskResults).filter(r => r.status === 'failed').length,
        skipped: Object.values(taskResults).filter(r => r.status === 'skipped').length
      };
      
      const endTime = new Date().toISOString();
      const duration = Date.now() - startTimestamp;
      
      const status: 'success' | 'partial' | 'failure' =
        summary.failed === 0 ? 'success' :
        summary.succeeded > 0 ? 'partial' :
        'failure';
      
      logger.info('Parallel execution complete', {
        executionId,
        status,
        summary,
        duration
      });
      
      return {
        executionId,
        status,
        startTime,
        endTime,
        duration,
        tasks: taskResults,
        summary,
        dag: {
          levels,
          edges: this.extractEdges(graph)
        }
      };
      
    } catch (error: any) {
      logger.error('Parallel execution failed', {
        executionId,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Execute a level with concurrency control
   */
  private async executeLevelWithConcurrency(
    taskIds: string[],
    graph: Map<string, DAGNode>,
    previousResults: Record<string, TaskResult>,
    maxConcurrent: number,
    config: ExecutionConfig
  ): Promise<Record<string, TaskResult>> {
    const results: Record<string, TaskResult> = {};
    const queue = [...taskIds];
    const executing: Promise<void>[] = [];
    
    while (queue.length > 0 || executing.length > 0) {
      // Start new tasks up to concurrency limit
      while (queue.length > 0 && executing.length < maxConcurrent) {
        const taskId = queue.shift()!;
        const node = graph.get(taskId)!;
        
        const promise = this.executeTask(node.task, previousResults, config)
          .then(result => {
            results[taskId] = result;
          })
          .finally(() => {
            const index = executing.indexOf(promise);
            if (index > -1) executing.splice(index, 1);
          });
        
        executing.push(promise);
      }
      
      // Wait for at least one to complete
      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }
    
    return results;
  }
  
  /**
   * Execute a single task
   */
  private async executeTask(
    task: Task,
    previousResults: Record<string, TaskResult>,
    config: ExecutionConfig
  ): Promise<TaskResult> {
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    
    logger.info('Executing task', { taskId: task.id, tool: task.tool });
    
    try {
      // Resolve variable substitutions in params (${taskId.output.field})
      const resolvedParams = this.resolveParams(task.params, previousResults);
      
      // Get tool function
      const toolFn = this.toolRegistry.get(task.tool);
      if (!toolFn) {
        throw new Error(`Tool not found: ${task.tool}`);
      }
      
      // Execute with timeout
      const timeout = task.timeout || config.timeout || 300000; // 5 min default
      const result = await Promise.race([
        toolFn(resolvedParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), timeout)
        )
      ]);
      
      const endTime = new Date().toISOString();
      const duration = Date.now() - startTimestamp;
      
      logger.info('Task completed successfully', {
        taskId: task.id,
        duration
      });
      
      return {
        taskId: task.id,
        status: 'success',
        duration,
        result,
        startTime,
        endTime
      };
      
    } catch (error: any) {
      const endTime = new Date().toISOString();
      const duration = Date.now() - startTimestamp;
      
      logger.error('Task failed', {
        taskId: task.id,
        error: error.message
      });
      
      return {
        taskId: task.id,
        status: 'failed',
        duration,
        error: {
          code: error.code || 'TASK_ERROR',
          message: error.message,
          stack: error.stack
        },
        startTime,
        endTime
      };
    }
  }
  
  /**
   * Resolve variable substitutions like ${taskId.output.field}
   */
  private resolveParams(
    params: Record<string, any>,
    previousResults: Record<string, TaskResult>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        // Variable substitution
        const path = value.slice(2, -1); // Remove ${ and }
        const [taskId, ...rest] = path.split('.');
        
        const taskResult = previousResults[taskId];
        if (!taskResult || taskResult.status !== 'success') {
          throw new Error(`Cannot resolve ${value}: task ${taskId} failed or not found`);
        }
        
        // Navigate the path in the result
        let current = taskResult.result;
        for (const segment of rest) {
          current = current?.[segment];
          if (current === undefined) {
            throw new Error(`Cannot resolve ${value}: path not found`);
          }
        }
        
        resolved[key] = current;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively resolve nested objects
        resolved[key] = this.resolveParams(value, previousResults);
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }
  
  /**
   * Extract edges for visualization
   */
  private extractEdges(graph: Map<string, DAGNode>): Array<{from: string; to: string}> {
    const edges: Array<{from: string; to: string}> = [];
    
    for (const [taskId, node] of graph) {
      for (const depId of node.dependencies) {
        edges.push({ from: depId, to: taskId });
      }
    }
    
    return edges;
  }
}
```

### MCP Tool Integration

```typescript
/**
 * MCP Tool: parallel_execute
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'parallel_execute') {
    const args = request.params.arguments as any;
    
    logger.info('Handling parallel_execute', {
      taskCount: args.tasks?.length,
      config: args.config
    });
    
    try {
      // Execute parallel tasks
      const result = await parallelExecutionEngine.execute({
        tasks: args.tasks,
        config: args.config
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
      
    } catch (error: any) {
      logger.error('Parallel execution failed', { error });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: {
              code: error.code || 'PARALLEL_EXECUTION_ERROR',
              message: error.message
            }
          }, null, 2)
        }],
        isError: true
      };
    }
  }
});
```

---

## IMPLEMENTATION PLAN

### Files to Create

```yaml
src/engines/parallel/:
  - ParallelExecutionEngine.ts  # Main engine class
  - DAGBuilder.ts                # Graph construction and validation
  - TaskExecutor.ts              # Individual task execution
  - types.ts                     # TypeScript interfaces

src/engines/parallel/__tests__/:
  - DAGBuilder.test.ts           # Graph tests
  - TaskExecutor.test.ts         # Execution tests
  - ParallelEngine.test.ts       # Integration tests

docs/:
  - PARALLEL_EXECUTION_DESIGN.md # This file
  - PARALLEL_EXECUTION_EXAMPLES.md # Usage examples
```

### Implementation Steps

```yaml
step_1_types:
  file: "src/engines/parallel/types.ts"
  duration: "30 minutes"
  action: "Define all TypeScript interfaces"

step_2_dag_builder:
  file: "src/engines/parallel/DAGBuilder.ts"
  duration: "2-3 hours"
  action: "Implement graph construction, cycle detection, topological sort"
  tests: "Comprehensive - test cycles, valid DAGs, edge cases"

step_3_task_executor:
  file: "src/engines/parallel/TaskExecutor.ts"
  duration: "2-3 hours"
  action: "Implement variable resolution, timeout handling, error handling"
  tests: "Test param resolution, timeouts, retries"

step_4_engine:
  file: "src/engines/parallel/ParallelExecutionEngine.ts"
  duration: "3-4 hours"
  action: "Integrate DAG + executor, level-by-level execution"
  tests: "End-to-end scenarios"

step_5_integration:
  file: "src/server.ts"
  duration: "1-2 hours"
  action: "Add parallel_execute MCP tool"
  tests: "Integration with existing tools"

step_6_documentation:
  files: ["docs/PARALLEL_EXECUTION_EXAMPLES.md", "README.md"]
  duration: "1-2 hours"
  action: "Write comprehensive examples and update main docs"

total_estimate: "12-16 hours"
```

### Testing Strategy

```yaml
unit_tests:
  DAGBuilder:
    - Empty task list
    - Single task (no dependencies)
    - Multiple independent tasks
    - Simple chain (A → B → C)
    - Diamond pattern (A → B,C → D)
    - Circular dependency detection
    - Missing dependency error
    - Invalid task ID error
    
  TaskExecutor:
    - Successful execution
    - Timeout handling
    - Error handling
    - Retry logic
    - Variable resolution
    - Nested variable resolution
    - Variable resolution errors
    
  ParallelEngine:
    - Simple parallel (no dependencies)
    - Sequential pipeline
    - Complex DAG
    - Partial failure (continue mode)
    - Partial failure (stop mode)
    - Concurrency limiting
    - Overall timeout

integration_tests:
  - Real file operations in parallel
  - Email fetch + parse + save pipeline
  - Mixed engine operations
  - Resource contention handling
  - Long-running operations
```

---

## USAGE EXAMPLES

### Example 1: Simple Parallel (No Dependencies)

```json
{
  "tasks": [
    {
      "id": "move_files",
      "tool": "file_move",
      "params": {
        "source": "/path/to/source",
        "dest": "/path/to/dest"
      }
    },
    {
      "id": "fetch_emails",
      "tool": "email_imap_fetch",
      "params": {
        "connectionId": "gmail-conn",
        "folder": "INBOX",
        "limit": 100
      }
    }
  ],
  "config": {
    "maxConcurrent": 2
  }
}
```

**Execution:**
- Both tasks run simultaneously (Level 0)
- Complete in ~18 seconds (instead of 36 sequentially)

### Example 2: Pipeline (Sequential Dependencies)

```json
{
  "tasks": [
    {
      "id": "fetch",
      "tool": "email_imap_fetch",
      "params": {
        "connectionId": "gmail-conn",
        "folder": "INBOX",
        "limit": 100
      }
    },
    {
      "id": "parse",
      "tool": "email_parse",
      "params": {
        "rawEmail": "${fetch.result.emails}"
      },
      "dependsOn": ["fetch"]
    },
    {
      "id": "save",
      "tool": "file_write",
      "params": {
        "path": "emails.xlsx",
        "content": "${parse.result}"
      },
      "dependsOn": ["parse"]
    }
  ]
}
```

**Execution:**
- Level 0: fetch (16s)
- Level 1: parse (2s)
- Level 2: save (1s)
- Total: 19s

### Example 3: Complex DAG (Diamond Pattern)

```json
{
  "tasks": [
    {
      "id": "fetch_data",
      "tool": "api_request",
      "params": {
        "url": "https://api.example.com/data",
        "method": "GET"
      }
    },
    {
      "id": "process_format_a",
      "tool": "custom_processor",
      "params": {
        "data": "${fetch_data.result}",
        "format": "A"
      },
      "dependsOn": ["fetch_data"]
    },
    {
      "id": "process_format_b",
      "tool": "custom_processor",
      "params": {
        "data": "${fetch_data.result}",
        "format": "B"
      },
      "dependsOn": ["fetch_data"]
    },
    {
      "id": "merge",
      "tool": "custom_merge",
      "params": {
        "dataA": "${process_format_a.result}",
        "dataB": "${process_format_b.result}"
      },
      "dependsOn": ["process_format_a", "process_format_b"]
    }
  ]
}
```

**Execution:**
- Level 0: fetch_data
- Level 1: process_format_a + process_format_b (parallel)
- Level 2: merge
- Diamond pattern optimized

### Example 4: Job Application Automation

```json
{
  "tasks": [
    {
      "id": "search_linkedin",
      "tool": "linkedin_search_jobs",
      "params": {
        "keywords": "software engineer",
        "location": "San Francisco"
      }
    },
    {
      "id": "search_indeed",
      "tool": "indeed_search_jobs",
      "params": {
        "keywords": "software engineer",
        "location": "San Francisco"
      }
    },
    {
      "id": "search_wellfound",
      "tool": "wellfound_search_jobs",
      "params": {
        "keywords": "software engineer",
        "location": "San Francisco"
      }
    },
    {
      "id": "merge_results",
      "tool": "custom_merge",
      "params": {
        "sources": [
          "${search_linkedin.result}",
          "${search_indeed.result}",
          "${search_wellfound.result}"
        ]
      },
      "dependsOn": ["search_linkedin", "search_indeed", "search_wellfound"]
    },
    {
      "id": "save_to_db",
      "tool": "db_insert",
      "params": {
        "connectionId": "jobs-db",
        "table": "job_applications",
        "data": "${merge_results.result}"
      },
      "dependsOn": ["merge_results"]
    },
    {
      "id": "send_notification",
      "tool": "email_smtp_send",
      "params": {
        "connectionId": "smtp-conn",
        "to": "user@example.com",
        "subject": "Job Search Complete",
        "body": "Found ${merge_results.result.length} jobs"
      },
      "dependsOn": ["merge_results"]
    }
  ]
}
```

**Execution:**
- Level 0: All 3 searches in parallel (fast!)
- Level 1: Merge results
- Level 2: Save to DB + Send email (parallel)

---

## ERROR HANDLING

### Circular Dependency Detection

```typescript
// Input:
tasks: [
  { id: "A", dependsOn: ["B"] },
  { id: "B", dependsOn: ["C"] },
  { id: "C", dependsOn: ["A"] }  // Circular!
]

// Error:
{
  error: {
    code: "CIRCULAR_DEPENDENCY",
    message: "Circular dependency detected: A → B → C → A",
    cycle: ["A", "B", "C", "A"]
  }
}
```

### Missing Dependency

```typescript
// Input:
tasks: [
  { id: "A", dependsOn: ["B"] }
  // B doesn't exist!
]

// Error:
{
  error: {
    code: "MISSING_DEPENDENCY",
    message: "Task A depends on non-existent task B"
  }
}
```

### Variable Resolution Error

```typescript
// Input:
tasks: [
  { id: "A", tool: "...", params: {...} },
  { id: "B", tool: "...", params: { data: "${A.result.missing}" }, dependsOn: ["A"] }
]

// Error (during B execution):
{
  taskId: "B",
  status: "failed",
  error: {
    code: "VARIABLE_RESOLUTION_ERROR",
    message: "Cannot resolve ${A.result.missing}: path not found"
  }
}
```

### Partial Failure

```typescript
// Result:
{
  status: "partial",
  tasks: {
    "task1": { status: "success", ... },
    "task2": { status: "failed", error: {...} },
    "task3": { status: "success", ... }
  },
  summary: {
    total: 3,
    succeeded: 2,
    failed: 1,
    skipped: 0
  }
}
```

---

## PERFORMANCE TARGETS

```yaml
parsing:
  100_tasks: "<100ms"
  circular_detection: "<50ms"
  topological_sort: "<50ms"

execution:
  simple_parallel_10_tasks: "~same as slowest task (not sum)"
  complex_dag_50_tasks: "<2x slowest critical path"
  
memory:
  overhead_per_task: "<1KB"
  100_tasks: "<100KB overhead"

concurrency:
  max_concurrent: 50  # Configurable, default 10
  queue_overhead: "<1ms per task"
```

---

## FUTURE ENHANCEMENTS (NOT NOW)

### Phase 3: Advanced Features (Later)
```yaml
features:
  - Rollback support (undo failed operations)
  - Retry policies per task
  - Progress callbacks (real-time updates)
  - Resource locking (prevent conflicts)
  - Distributed execution (multiple machines)
  - Persistent execution (survive crashes)
  - Priority scheduling
  - Dynamic DAG (add tasks mid-execution)

estimated_effort: "20-30 hours additional"
priority: "Low - validate Phase 2 first"
```

---

## DEFINITION OF DONE

```yaml
code_complete:
  - All TypeScript files implemented
  - Zero TypeScript errors
  - Zero ESLint warnings

tests_complete:
  - All unit tests passing
  - All integration tests passing
  - Edge cases covered
  - Error scenarios covered

documentation_complete:
  - This design doc finalized
  - Examples doc created
  - README updated
  - API reference complete

integration_complete:
  - MCP tool exposed
  - Works with all existing engines
  - No breaking changes to existing tools

validation_complete:
  - Manual testing with real scenarios
  - Performance targets met
  - Error messages clear and actionable
```

---

## COMMIT STRATEGY

```yaml
commit_1:
  message: "feat(parallel): Add types and interfaces for parallel execution engine"
  files: ["src/engines/parallel/types.ts"]

commit_2:
  message: "feat(parallel): Implement DAG builder with cycle detection and topological sort"
  files: ["src/engines/parallel/DAGBuilder.ts", "tests/..."]

commit_3:
  message: "feat(parallel): Implement task executor with variable resolution"
  files: ["src/engines/parallel/TaskExecutor.ts", "tests/..."]

commit_4:
  message: "feat(parallel): Implement parallel execution engine with level-by-level execution"
  files: ["src/engines/parallel/ParallelExecutionEngine.ts", "tests/..."]

commit_5:
  message: "feat(parallel): Integrate parallel_execute MCP tool"
  files: ["src/server.ts", "tests/integration/..."]

commit_6:
  message: "docs(parallel): Add comprehensive documentation and examples"
  files: ["docs/PARALLEL_EXECUTION_EXAMPLES.md", "README.md"]
```

---

## ACCEPTANCE CRITERIA

**This feature is complete when:**

1. ✅ User can execute 2+ independent tasks in parallel
2. ✅ User can define task dependencies (A → B → C)
3. ✅ Variable substitution works (${taskId.result.field})
4. ✅ Circular dependencies are detected and rejected
5. ✅ Partial failures are handled gracefully
6. ✅ Concurrency is limited (configurable)
7. ✅ All tests passing (unit + integration)
8. ✅ Documentation complete with examples
9. ✅ Performance targets met
10. ✅ Clean TypeScript build (0 errors)

---

**Status:** READY TO IMPLEMENT  
**Estimated Duration:** 12-16 hours  
**Priority:** HIGH - Major new capability  
**Assigned To:** Next Claude instance  
**Dependencies:** None - all Oktyv engines already complete

---

**IMPLEMENTATION INSTRUCTIONS FOR NEXT INSTANCE:**

1. Read this entire document
2. Create file structure in `src/engines/parallel/`
3. Implement in order: types → DAGBuilder → TaskExecutor → Engine → Integration
4. Test thoroughly at each step
5. Commit frequently with clear messages
6. Update documentation
7. Mark complete when all acceptance criteria met

**START HERE:** Create `src/engines/parallel/types.ts` with all interfaces from this spec.
