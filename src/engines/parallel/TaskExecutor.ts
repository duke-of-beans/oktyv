/**
 * Task Executor - Individual Task Execution with Variable Resolution
 * 
 * Handles execution of single tasks including:
 * - Variable substitution in parameters (${taskId.result.field})
 * - Timeout management
 * - Error handling and retry logic
 */

import { TaskResult } from './types.js';

/**
 * Custom error for variable resolution failures
 */
export class VariableResolutionError extends Error {
  constructor(
    public variable: string,
    public reason: string
  ) {
    super(`Cannot resolve variable ${variable}: ${reason}`);
    this.name = 'VariableResolutionError';
  }
}

/**
 * Custom error for task timeouts
 */
export class TaskTimeoutError extends Error {
  constructor(
    public taskId: string,
    public timeoutMs: number
  ) {
    super(`Task ${taskId} exceeded timeout of ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
  }
}

/**
 * Resolve variable substitutions in task parameters
 * 
 * Variables have the format: ${taskId.result.field.nestedField}
 * 
 * @param params - Parameters containing potential variable substitutions
 * @param previousResults - Results from previously executed tasks
 * @returns Resolved parameters with variables replaced by actual values
 * @throws {VariableResolutionError} If variable cannot be resolved
 */
export function resolveParams(
  params: Record<string, any>,
  previousResults: Record<string, TaskResult>
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    resolved[key] = resolveValue(value, previousResults);
  }
  
  return resolved;
}

/**
 * Resolve a single value (string, object, array, or primitive)
 */
function resolveValue(
  value: any,
  previousResults: Record<string, TaskResult>
): any {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return value;
  }
  
  // Handle strings (potential variables)
  if (typeof value === 'string') {
    return resolveString(value, previousResults);
  }
  
  // Handle arrays recursively
  if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, previousResults));
  }
  
  // Handle objects recursively
  if (typeof value === 'object') {
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, previousResults);
    }
    return resolved;
  }
  
  // Handle primitives (numbers, booleans)
  return value;
}

/**
 * Resolve variables in a string value
 * 
 * Supports:
 * - Full variable replacement: "${taskId.result.field}"
 * - Embedded variables: "prefix ${taskId.result.field} suffix"
 */
function resolveString(
  str: string,
  previousResults: Record<string, TaskResult>
): any {
  // Pattern: ${variable.path.here}
  const variablePattern = /\$\{([^}]+)\}/g;
  
  // Check if the entire string is just one variable
  const fullMatch = str.match(/^\$\{([^}]+)\}$/);
  if (fullMatch) {
    // Full replacement - return the actual value (could be object, array, etc.)
    const path = fullMatch[1];
    return resolveVariablePath(path, previousResults);
  }
  
  // Partial replacement - replace variables within string
  return str.replace(variablePattern, (_match, path) => {
    const value = resolveVariablePath(path, previousResults);
    
    // Convert to string for embedding
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  });
}

/**
 * Resolve a variable path like "taskId.result.field.nested"
 * 
 * @param path - Dot-separated path to the value
 * @param previousResults - Results from previously executed tasks
 * @returns The value at the specified path
 * @throws {VariableResolutionError} If path cannot be resolved
 */
function resolveVariablePath(
  path: string,
  previousResults: Record<string, TaskResult>
): any {
  const segments = path.split('.');
  
  if (segments.length < 2) {
    throw new VariableResolutionError(
      `\${${path}}`,
      'Variable must have at least taskId and field (e.g., ${taskId.result})'
    );
  }
  
  const [taskId, ...rest] = segments;
  
  // Get task result
  const taskResult = previousResults[taskId];
  if (!taskResult) {
    throw new VariableResolutionError(
      `\${${path}}`,
      `Task ${taskId} not found in previous results`
    );
  }
  
  // Check task succeeded
  if (taskResult.status !== 'success') {
    throw new VariableResolutionError(
      `\${${path}}`,
      `Task ${taskId} did not succeed (status: ${taskResult.status})`
    );
  }
  
  // Navigate the path in the result
  let current: any = taskResult;
  for (const segment of rest) {
    if (current === null || current === undefined) {
      throw new VariableResolutionError(
        `\${${path}}`,
        `Path segment "${segment}" accessed on null/undefined value`
      );
    }
    
    current = current[segment];
    
    if (current === undefined) {
      throw new VariableResolutionError(
        `\${${path}}`,
        `Path "${rest.join('.')}" not found in task ${taskId} result`
      );
    }
  }
  
  return current;
}

/**
 * Execute a task with timeout
 * 
 * @param operation - Async operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param taskId - Task ID for error messages
 * @returns Promise that resolves to operation result or rejects on timeout
 * @throws {TaskTimeoutError} If operation exceeds timeout
 */
export async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  taskId: string
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TaskTimeoutError(taskId, timeoutMs));
      }, timeoutMs);
    })
  ]);
}

/**
 * Execute a task with retry logic
 * 
 * Implements exponential or linear backoff based on retry policy.
 * 
 * @param operation - Async operation to execute
 * @param retryPolicy - Retry configuration
 * @param taskId - Task ID for logging
 * @returns Promise that resolves to operation result
 * @throws Last error if all retries exhausted
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  retryPolicy: {
    maxAttempts: number;
    backoff: 'exponential' | 'linear';
    initialDelay: number;
  },
  _taskId: string
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === retryPolicy.maxAttempts - 1) {
        break;
      }
      
      // Calculate delay
      const delay = calculateBackoff(
        attempt,
        retryPolicy.backoff,
        retryPolicy.initialDelay
      );
      
      // Retry after backoff delay
      // Could log: Task failed, retrying attempt ${attempt + 1}/${retryPolicy.maxAttempts}
      
      // Wait before retry
      await sleep(delay);
    }
  }
  
  // All retries exhausted
  // Could log: Task ${taskId} failed after ${retryPolicy.maxAttempts} attempts
  
  throw lastError!;
}

/**
 * Calculate backoff delay for retry
 */
function calculateBackoff(
  attempt: number,
  strategy: 'exponential' | 'linear',
  initialDelay: number
): number {
  if (strategy === 'exponential') {
    // Exponential: delay * 2^attempt
    return initialDelay * Math.pow(2, attempt);
  } else {
    // Linear: delay * (attempt + 1)
    return initialDelay * (attempt + 1);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe error extraction
 * 
 * Converts any error into a standardized error object
 */
export function extractError(error: any): {
  code: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      code: error.name || 'ERROR',
      message: error.message,
      stack: error.stack
    };
  }
  
  if (typeof error === 'string') {
    return {
      code: 'ERROR',
      message: error
    };
  }
  
  if (error && typeof error === 'object') {
    return {
      code: error.code || error.name || 'ERROR',
      message: error.message || String(error),
      stack: error.stack
    };
  }
  
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error)
  };
}
