/**
 * Parallel Execution Engine
 * 
 * Orchestrates parallel task execution with DAG-based dependency resolution.
 * Executes tasks level-by-level with concurrency control and handles partial failures.
 */

import { EventEmitter } from 'events';
// @ts-ignore - uuid types not needed for runtime
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';
import { validateAndBuildDAG } from './DAGBuilder.js';
import {
  resolveParams,
  executeWithTimeout,
  executeWithRetry,
  extractError
} from './TaskExecutor.js';
import {
  ParallelExecutionRequest,
  ParallelExecutionResult,
  ExecutionConfig,
  Task,
  TaskResult,
  DAGNode
} from './types.js';

const logger = createLogger('parallel-engine');

/**
 * Tool function signature
 */
type ToolFunction = (params: Record<string, any>) => Promise<any>;

/**
 * Parallel Execution Engine
 * 
 * Orchestrates the execution of multiple tasks with dependency management.
 */
export class ParallelExecutionEngine extends EventEmitter {
  private toolRegistry: Map<string, ToolFunction>;

  constructor(tools: Map<string, ToolFunction>) {
    super();
    this.toolRegistry = tools;
    
    logger.info(`Engine initialized`, {
      toolCount: tools.size
    });
  }

  /**
   * Execute a parallel execution request
   */
  async execute(request: ParallelExecutionRequest): Promise<ParallelExecutionResult> {
    const executionId = uuidv4();
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    
    logger.info(`Starting parallel execution`, {
      executionId,
      taskCount: request.tasks.length,
      failureMode: request.config?.failureMode || 'continue'
    });

    try {
      // Step 1: Build and validate DAG
      const { graph, levels } = validateAndBuildDAG(request.tasks);
      
      logger.info(`DAG built`, {
        executionId,
        levels: levels.length,
        taskCount: request.tasks.length
      });

      // Step 3: Execute level by level
      const taskResults: Record<string, TaskResult> = {};
      const config = request.config || {};
      const maxConcurrent = config.maxConcurrent || 5;

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        
        logger.info(`Executing level ${i}`, {
          executionId,
          taskCount: level.length,
          tasks: level
        });

        // Execute all tasks in this level with concurrency control
        const levelResults = await this.executeLevelWithConcurrency(
          level,
          graph,
          taskResults,
          maxConcurrent,
          config
        );

        // Merge results
        Object.assign(taskResults, levelResults);

        // Check if we should continue after failures
        const failureMode = config.failureMode || 'continue';
        if (failureMode === 'stop') {
          const failed = Object.values(levelResults).filter(r => r.status === 'failed');
          if (failed.length > 0) {
            logger.warn(`Level ${i} had failures, stopping execution`, {
              executionId,
              failedCount: failed.length,
              failedTasks: failed.map(r => r.taskId)
            });

            // Mark remaining tasks as skipped
            this.markRemainingAsSkipped(levels, i, taskResults);
            break;
          }
        }
      }

      // Step 4: Calculate summary
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

      logger.info(`Parallel execution complete`, {
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
      logger.error(`Parallel execution failed`, {
        executionId,
        error: error.message,
        stack: error.stack
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

    logger.info(`Executing task`, {
      taskId: task.id,
      tool: task.tool
    });

    try {
      // Resolve variable substitutions in params
      const resolvedParams = resolveParams(task.params, previousResults);

      // Get tool function
      const toolFn = this.toolRegistry.get(task.tool);
      if (!toolFn) {
        throw new Error(`Tool not found: ${task.tool}`);
      }

      // Create execution function
      const executeFn = async () => toolFn(resolvedParams);

      // Execute with retry if configured
      let result: any;
      if (task.retryPolicy) {
        result = await executeWithRetry(executeFn, task.retryPolicy, task.id);
      } else {
        // Execute with timeout only
        const timeout = task.timeout || config.timeout || 300000; // 5 min default
        result = await executeWithTimeout(executeFn, timeout, task.id);
      }

      const endTime = new Date().toISOString();
      const duration = Date.now() - startTimestamp;

      logger.info(`Task completed successfully`, {
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

      logger.error(`Task failed`, {
        taskId: task.id,
        error: error.message,
        errorType: error.constructor.name
      });

      return {
        taskId: task.id,
        status: 'failed',
        duration,
        error: extractError(error),
        startTime,
        endTime
      };
    }
  }

  /**
   * Mark remaining tasks as skipped
   */
  private markRemainingAsSkipped(
    levels: string[][],
    failedLevel: number,
    results: Record<string, TaskResult>
  ): void {
    for (let i = failedLevel + 1; i < levels.length; i++) {
      for (const taskId of levels[i]) {
        results[taskId] = {
          taskId,
          status: 'skipped',
          duration: 0,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        };
      }
    }
  }

  /**
   * Extract edges from graph for response
   */
  private extractEdges(graph: Map<string, DAGNode>): Array<{ from: string; to: string }> {
    const edges: Array<{ from: string; to: string }> = [];

    for (const [nodeId, node] of graph.entries()) {
      for (const depId of node.dependencies) {
        edges.push({ from: depId, to: nodeId });
      }
    }

    return edges;
  }

  /**
   * Add a tool to the registry
   */
  addTool(name: string, fn: ToolFunction): void {
    this.toolRegistry.set(name, fn);
    logger.info(`Tool registered`, { name });
  }

  /**
   * Remove a tool from the registry
   */
  removeTool(name: string): boolean {
    const deleted = this.toolRegistry.delete(name);
    if (deleted) {
      logger.info(`Tool removed`, { name });
    }
    return deleted;
  }

  /**
   * Get list of available tools
   */
  getAvailableTools(): string[] {
    return Array.from(this.toolRegistry.keys());
  }
}
