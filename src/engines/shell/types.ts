/**
 * Shell Engine — Type Definitions
 *
 * Types for concurrent shell command execution via shell_batch.
 */

/** A single shell command to execute */
export interface ShellCommand {
  /** Unique identifier (used for dependsOn references) */
  id: string;
  /** Shell command string */
  cmd: string;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Per-command timeout in ms (overrides config.defaultTimeout) */
  timeout?: number;
  /** Shell override: "powershell" | "cmd" | "bash" | "sh" */
  shell?: string;
  /** Command IDs that must succeed before this command runs */
  dependsOn?: string[];
}

/** Batch execution configuration */
export interface ShellBatchConfig {
  /** Max simultaneous child processes (default: 5) */
  maxConcurrent?: number;
  /** Stop all remaining commands on first failure, or keep going (default: continue) */
  failureMode?: 'continue' | 'stop';
  /** Default per-command timeout ms (default: 300000) */
  defaultTimeout?: number;
  /** Default shell: auto-detected from platform if not set */
  defaultShell?: string;
}

/** Full batch request */
export interface ShellBatchRequest {
  commands: ShellCommand[];
  config?: ShellBatchConfig;
}

/** Result of a single command */
export interface ShellCommandResult {
  id: string;
  status: 'success' | 'failed' | 'skipped';
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  startTime: string;
  endTime: string;
  error?: string;
}

/** Full batch result */
export interface ShellBatchResult {
  executionId: string;
  status: 'success' | 'partial' | 'failure';
  startTime: string;
  endTime: string;
  duration: number;
  commands: Record<string, ShellCommandResult>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

/** Internal DAG node */
export interface ShellDAGNode {
  command: ShellCommand;
  dependencies: Set<string>;
  dependents: Set<string>;
}
