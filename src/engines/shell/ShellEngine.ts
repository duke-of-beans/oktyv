/**
 * Shell Engine
 *
 * Executes multiple shell commands concurrently with optional dependency ordering.
 * Uses Node.js child_process.spawn — no shell injection risk from params since
 * commands are passed directly to the shell interpreter as a single string arg.
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { platform } from 'os';
import { createLogger } from '../../utils/logger.js';
import type {
  ShellCommand,
  ShellBatchConfig,
  ShellBatchRequest,
  ShellBatchResult,
  ShellCommandResult,
  ShellDAGNode,
} from './types.js';

const logger = createLogger('shell-engine');

/** Detect default shell for the current platform */
function defaultShell(): string {
  return platform() === 'win32' ? 'powershell' : 'sh';
}

/** Build spawn args for a given shell + command string */
function buildSpawnArgs(shell: string, cmd: string): [string, string[]] {
  switch (shell.toLowerCase()) {
    case 'powershell':
    case 'powershell.exe':
      return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]];
    case 'cmd':
    case 'cmd.exe':
      return ['cmd.exe', ['/c', cmd]];
    case 'bash':
      return ['bash', ['-c', cmd]];
    default:
      return ['sh', ['-c', cmd]];
  }
}

/** Run a single command as a child process, return result */
async function runCommand(
  command: ShellCommand,
  config: Required<ShellBatchConfig>
): Promise<ShellCommandResult> {
  const startTime = new Date().toISOString();
  const startTs = Date.now();
  const shell = command.shell ?? config.defaultShell;
  const timeout = command.timeout ?? config.defaultTimeout;
  const [bin, args] = buildSpawnArgs(shell, command.cmd);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(bin, args, {
      cwd: command.cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }, timeout);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const endTime = new Date().toISOString();
      const duration = Date.now() - startTs;
      const exitCode = timedOut ? -1 : (code ?? -1);
      const success = !timedOut && exitCode === 0;

      resolve({
        id: command.id,
        status: success ? 'success' : 'failed',
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration,
        startTime,
        endTime,
        error: timedOut ? `Timed out after ${timeout}ms` : undefined,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      const endTime = new Date().toISOString();
      resolve({
        id: command.id,
        status: 'failed',
        exitCode: -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTs,
        startTime,
        endTime,
        error: err.message,
      });
    });
  });
}

/** Build DAG from commands */
function buildDAG(commands: ShellCommand[]): Map<string, ShellDAGNode> {
  const graph = new Map<string, ShellDAGNode>();

  for (const cmd of commands) {
    graph.set(cmd.id, {
      command: cmd,
      dependencies: new Set(cmd.dependsOn ?? []),
      dependents: new Set(),
    });
  }

  for (const [id, node] of graph) {
    for (const depId of node.dependencies) {
      if (!graph.has(depId)) {
        throw new Error(`Command "${id}" depends on unknown command "${depId}"`);
      }
      graph.get(depId)!.dependents.add(id);
    }
  }

  // Cycle detection via DFS
  const visited = new Set<string>();
  const stack = new Set<string>();
  function dfs(id: string) {
    if (stack.has(id)) throw new Error(`Circular dependency detected at "${id}"`);
    if (visited.has(id)) return;
    stack.add(id);
    for (const dep of graph.get(id)!.dependencies) dfs(dep);
    stack.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) dfs(id);

  return graph;
}

/** Topological sort → execution levels */
function topoLevels(graph: Map<string, ShellDAGNode>): string[][] {
  const inDegree = new Map<string, number>();
  for (const [id, node] of graph) inDegree.set(id, node.dependencies.size);

  const levels: string[][] = [];
  let current = [...graph.keys()].filter(id => inDegree.get(id) === 0);

  while (current.length > 0) {
    levels.push(current);
    const next: string[] = [];
    for (const id of current) {
      for (const dep of graph.get(id)!.dependents) {
        const deg = inDegree.get(dep)! - 1;
        inDegree.set(dep, deg);
        if (deg === 0) next.push(dep);
      }
    }
    current = next;
  }

  return levels;
}

/** Execute one level with concurrency cap */
async function executeLevel(
  ids: string[],
  graph: Map<string, ShellDAGNode>,
  config: Required<ShellBatchConfig>,
  _results: Record<string, ShellCommandResult>
): Promise<Record<string, ShellCommandResult>> {
  const levelResults: Record<string, ShellCommandResult> = {};
  const queue = [...ids];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (queue.length > 0 && running.length < config.maxConcurrent) {
      const id = queue.shift()!;
      const node = graph.get(id)!;
      const p = runCommand(node.command, config)
        .then(r => { levelResults[id] = r; })
        .finally(() => { running.splice(running.indexOf(p), 1); });
      running.push(p);
    }
    if (running.length > 0) await Promise.race(running);
  }

  return levelResults;
}

/** Main entry point */
export class ShellEngine {
  async execute(request: ShellBatchRequest): Promise<ShellBatchResult> {
    const executionId = randomUUID();
    const startTime = new Date().toISOString();
    const startTs = Date.now();

    const config: Required<ShellBatchConfig> = {
      maxConcurrent: request.config?.maxConcurrent ?? 5,
      failureMode: request.config?.failureMode ?? 'continue',
      defaultTimeout: request.config?.defaultTimeout ?? 300_000,
      defaultShell: request.config?.defaultShell ?? defaultShell(),
    };

    logger.info('shell_batch start', { executionId, count: request.commands.length });

    const graph = buildDAG(request.commands);
    const levels = topoLevels(graph);
    const commandResults: Record<string, ShellCommandResult> = {};

    for (let i = 0; i < levels.length; i++) {
      const levelResults = await executeLevel(levels[i], graph, config, commandResults);
      Object.assign(commandResults, levelResults);

      if (config.failureMode === 'stop') {
        const failures = Object.values(levelResults).filter(r => r.status === 'failed');
        if (failures.length > 0) {
          // Mark remaining as skipped
          for (let j = i + 1; j < levels.length; j++) {
            for (const id of levels[j]) {
              commandResults[id] = {
                id, status: 'skipped', exitCode: -1, stdout: '', stderr: '',
                duration: 0, startTime: new Date().toISOString(), endTime: new Date().toISOString(),
              };
            }
          }
          break;
        }
      }
    }

    const succeeded = Object.values(commandResults).filter(r => r.status === 'success').length;
    const failed = Object.values(commandResults).filter(r => r.status === 'failed').length;
    const skipped = Object.values(commandResults).filter(r => r.status === 'skipped').length;
    const total = request.commands.length;
    const status = failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failure';

    logger.info('shell_batch complete', { executionId, status, succeeded, failed });

    return {
      executionId,
      status,
      startTime,
      endTime: new Date().toISOString(),
      duration: Date.now() - startTs,
      commands: commandResults,
      summary: { total, succeeded, failed, skipped },
    };
  }
}
