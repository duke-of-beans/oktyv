import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('task-manager');

export interface TaskSchedule {
  type: 'cron' | 'interval' | 'once';
  expression?: string; // cron expression
  interval?: number; // milliseconds
  executeAt?: Date; // one-time execution
}

export interface TaskAction {
  type: 'http' | 'webhook' | 'file' | 'database' | 'email';
  config: Record<string, any>;
}

export interface TaskOptions {
  timezone?: string;
  retryCount?: number;
  retryDelay?: number; // milliseconds
  timeout?: number; // milliseconds
  enabled?: boolean;
}

export interface TaskMetadata {
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  schedule: TaskSchedule;
  action: TaskAction;
  options: TaskOptions;
  metadata: TaskMetadata;
}

export interface TaskFilter {
  enabled?: boolean;
  scheduleType?: 'cron' | 'interval' | 'once';
  actionType?: 'http' | 'webhook' | 'file' | 'database' | 'email';
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Task Manager - CRUD operations for scheduled tasks
 */
export class TaskManager {
  private db: Database.Database;
  
  /**
   * Initialize task manager
   */
  constructor(dbPath?: string) {
    const defaultPath = path.join(process.cwd(), 'data', 'cron.db');
    const actualPath = dbPath || defaultPath;
    
    // Ensure directory exists
    const dir = path.dirname(actualPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Open database
    this.db = new Database(actualPath);
    
    // Initialize schema
    this.initializeSchema();
    
    logger.info('Task manager initialized', { dbPath: actualPath });
  }
  
  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }
  
  /**
   * Create new task
   */
  createTask(task: Omit<Task, 'id' | 'metadata'>): Task {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const fullTask: Task = {
      id,
      ...task,
      metadata: {
        tags: task.options.enabled !== undefined ? [] : [],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    };
    
    logger.info('Creating task', { id, name: fullTask.name });
    
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, name, description,
        schedule_type, schedule_expression, schedule_interval, schedule_execute_at,
        action_type, action_config,
        timezone, retry_count, retry_delay, timeout, enabled, tags,
        created_at, updated_at, created_by
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);
    
    stmt.run(
      fullTask.id,
      fullTask.name,
      fullTask.description || null,
      fullTask.schedule.type,
      fullTask.schedule.expression || null,
      fullTask.schedule.interval || null,
      fullTask.schedule.executeAt?.toISOString() || null,
      fullTask.action.type,
      JSON.stringify(fullTask.action.config),
      fullTask.options.timezone || 'UTC',
      fullTask.options.retryCount || 0,
      fullTask.options.retryDelay || 5000,
      fullTask.options.timeout || 30000,
      fullTask.options.enabled !== false ? 1 : 0,
      fullTask.metadata.tags ? JSON.stringify(fullTask.metadata.tags) : null,
      now,
      now,
      fullTask.metadata.createdBy || null
    );
    
    logger.info('Task created', { id });
    
    return fullTask;
  }
  
  /**
   * Get task by ID
   */
  getTask(id: string): Task | null {
    logger.debug('Getting task', { id });
    
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) {
      return null;
    }
    
    return this.rowToTask(row);
  }
  
  /**
   * Update task
   */
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'metadata'>>): Task {
    logger.info('Updating task', { id, updates });
    
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    
    const updatedTask = {
      ...task,
      ...updates,
      metadata: {
        ...task.metadata,
        updatedAt: new Date(),
      },
    };
    
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        name = ?,
        description = ?,
        schedule_type = ?,
        schedule_expression = ?,
        schedule_interval = ?,
        schedule_execute_at = ?,
        action_type = ?,
        action_config = ?,
        timezone = ?,
        retry_count = ?,
        retry_delay = ?,
        timeout = ?,
        enabled = ?,
        tags = ?,
        updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(
      updatedTask.name,
      updatedTask.description || null,
      updatedTask.schedule.type,
      updatedTask.schedule.expression || null,
      updatedTask.schedule.interval || null,
      updatedTask.schedule.executeAt?.toISOString() || null,
      updatedTask.action.type,
      JSON.stringify(updatedTask.action.config),
      updatedTask.options.timezone || 'UTC',
      updatedTask.options.retryCount || 0,
      updatedTask.options.retryDelay || 5000,
      updatedTask.options.timeout || 30000,
      updatedTask.options.enabled !== false ? 1 : 0,
      updatedTask.metadata.tags ? JSON.stringify(updatedTask.metadata.tags) : null,
      updatedTask.metadata.updatedAt.toISOString(),
      id
    );
    
    logger.info('Task updated', { id });
    
    return updatedTask;
  }
  
  /**
   * Delete task
   */
  deleteTask(id: string): void {
    logger.info('Deleting task', { id });
    
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes === 0) {
      throw new Error(`Task not found: ${id}`);
    }
    
    logger.info('Task deleted', { id });
  }
  
  /**
   * List tasks with filters
   */
  listTasks(filter: TaskFilter = {}): Task[] {
    logger.debug('Listing tasks', { filter });
    
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];
    
    if (filter.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }
    
    if (filter.scheduleType) {
      query += ' AND schedule_type = ?';
      params.push(filter.scheduleType);
    }
    
    if (filter.actionType) {
      query += ' AND action_type = ?';
      params.push(filter.actionType);
    }
    
    if (filter.tags && filter.tags.length > 0) {
      // Simple tag search (exact match)
      query += ' AND tags LIKE ?';
      params.push(`%${filter.tags[0]}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
      
      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => this.rowToTask(row));
  }
  
  /**
   * Enable task
   */
  enableTask(id: string): void {
    logger.info('Enabling task', { id });
    
    const stmt = this.db.prepare('UPDATE tasks SET enabled = 1, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    
    if (result.changes === 0) {
      throw new Error(`Task not found: ${id}`);
    }
    
    logger.info('Task enabled', { id });
  }
  
  /**
   * Disable task
   */
  disableTask(id: string): void {
    logger.info('Disabling task', { id });
    
    const stmt = this.db.prepare('UPDATE tasks SET enabled = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    
    if (result.changes === 0) {
      throw new Error(`Task not found: ${id}`);
    }
    
    logger.info('Task disabled', { id });
  }
  
  /**
   * Get all enabled tasks
   */
  getEnabledTasks(): Task[] {
    return this.listTasks({ enabled: true });
  }
  
  /**
   * Convert database row to Task object
   */
  private rowToTask(row: any): Task {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      schedule: {
        type: row.schedule_type,
        expression: row.schedule_expression || undefined,
        interval: row.schedule_interval || undefined,
        executeAt: row.schedule_execute_at ? new Date(row.schedule_execute_at) : undefined,
      },
      action: {
        type: row.action_type,
        config: JSON.parse(row.action_config),
      },
      options: {
        timezone: row.timezone,
        retryCount: row.retry_count,
        retryDelay: row.retry_delay,
        timeout: row.timeout,
        enabled: row.enabled === 1,
      },
      metadata: {
        tags: row.tags ? JSON.parse(row.tags) : [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        createdBy: row.created_by || undefined,
      },
    };
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Task manager closed');
  }
}
