import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('history-manager');

export interface TaskExecution {
  id: string;
  taskId: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // milliseconds
  status: 'running' | 'success' | 'failed' | 'timeout';
  result?: any;
  error?: string;
  retryCount: number;
}

export interface TaskStatistics {
  totalRuns: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  avgDuration: number; // milliseconds
  lastRun?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
}

/**
 * History Manager - Track task execution history
 */
export class HistoryManager {
  private db: Database.Database;
  
  /**
   * Initialize history manager
   */
  constructor(db: Database.Database) {
    this.db = db;
    this.initializeSchema();
    logger.info('History manager initialized');
  }
  
  /**
   * Initialize database schema for executions
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration INTEGER,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'timeout')),
        result TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    `);
  }
  
  /**
   * Start execution tracking
   */
  startExecution(taskId: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    logger.info('Starting execution', { id, taskId });
    
    const stmt = this.db.prepare(`
      INSERT INTO executions (
        id, task_id, started_at, status, retry_count
      ) VALUES (?, ?, ?, 'running', 0)
    `);
    
    stmt.run(id, taskId, now);
    
    return id;
  }
  
  /**
   * Complete execution with success
   */
  completeExecution(executionId: string, result?: any): void {
    const now = new Date().toISOString();
    
    logger.info('Completing execution', { executionId, status: 'success' });
    
    // Get start time to calculate duration
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    
    const duration = new Date(now).getTime() - execution.startedAt.getTime();
    
    const stmt = this.db.prepare(`
      UPDATE executions SET
        completed_at = ?,
        duration = ?,
        status = 'success',
        result = ?
      WHERE id = ?
    `);
    
    stmt.run(
      now,
      duration,
      result ? JSON.stringify(result) : null,
      executionId
    );
  }
  
  /**
   * Fail execution
   */
  failExecution(executionId: string, error: string): void {
    const now = new Date().toISOString();
    
    logger.info('Failing execution', { executionId, error });
    
    // Get start time to calculate duration
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    
    const duration = new Date(now).getTime() - execution.startedAt.getTime();
    
    const stmt = this.db.prepare(`
      UPDATE executions SET
        completed_at = ?,
        duration = ?,
        status = 'failed',
        error = ?
      WHERE id = ?
    `);
    
    stmt.run(now, duration, error, executionId);
  }
  
  /**
   * Mark execution as timeout
   */
  timeoutExecution(executionId: string): void {
    const now = new Date().toISOString();
    
    logger.info('Timing out execution', { executionId });
    
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    
    const duration = new Date(now).getTime() - execution.startedAt.getTime();
    
    const stmt = this.db.prepare(`
      UPDATE executions SET
        completed_at = ?,
        duration = ?,
        status = 'timeout'
      WHERE id = ?
    `);
    
    stmt.run(now, duration, executionId);
  }
  
  /**
   * Get execution by ID
   */
  getExecution(executionId: string): TaskExecution | null {
    const stmt = this.db.prepare('SELECT * FROM executions WHERE id = ?');
    const row = stmt.get(executionId) as any;
    
    if (!row) {
      return null;
    }
    
    return this.rowToExecution(row);
  }
  
  /**
   * Get execution history for task
   */
  getHistory(taskId: string, limit: number = 50): TaskExecution[] {
    logger.debug('Getting history', { taskId, limit });
    
    const stmt = this.db.prepare(`
      SELECT * FROM executions
      WHERE task_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(taskId, limit) as any[];
    
    return rows.map(row => this.rowToExecution(row));
  }
  
  /**
   * Get task statistics
   */
  getStatistics(taskId: string): TaskStatistics {
    logger.debug('Getting statistics', { taskId });
    
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
        AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE NULL END) as avg_duration,
        MAX(CASE WHEN status != 'running' THEN started_at ELSE NULL END) as last_run,
        MAX(CASE WHEN status = 'success' THEN started_at ELSE NULL END) as last_success,
        MAX(CASE WHEN status = 'failed' THEN started_at ELSE NULL END) as last_failure
      FROM executions
      WHERE task_id = ?
    `);
    
    const row = stmt.get(taskId) as any;
    
    return {
      totalRuns: row.total_runs || 0,
      successCount: row.success_count || 0,
      failureCount: row.failure_count || 0,
      timeoutCount: row.timeout_count || 0,
      avgDuration: row.avg_duration || 0,
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
      lastSuccess: row.last_success ? new Date(row.last_success) : undefined,
      lastFailure: row.last_failure ? new Date(row.last_failure) : undefined,
    };
  }
  
  /**
   * Clear history for task
   */
  clearHistory(taskId: string): number {
    logger.info('Clearing history', { taskId });
    
    const stmt = this.db.prepare('DELETE FROM executions WHERE task_id = ?');
    const result = stmt.run(taskId);
    
    return result.changes;
  }
  
  /**
   * Prune old history
   */
  pruneHistory(olderThan: Date): number {
    logger.info('Pruning history', { olderThan });
    
    const stmt = this.db.prepare(`
      DELETE FROM executions
      WHERE started_at < ?
      AND status != 'running'
    `);
    
    const result = stmt.run(olderThan.toISOString());
    
    logger.info('History pruned', { deleted: result.changes });
    
    return result.changes;
  }
  
  /**
   * Convert database row to TaskExecution
   */
  private rowToExecution(row: any): TaskExecution {
    return {
      id: row.id,
      taskId: row.task_id,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      duration: row.duration || undefined,
      status: row.status,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      retryCount: row.retry_count || 0,
    };
  }
}
