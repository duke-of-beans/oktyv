/**
 * Supabase-backed CronEngine for ASURIQ mode.
 *
 * Wraps the existing hands_schedules table to provide the same interface
 * as the SQLite-backed CronEngine. The table schema maps to webhook/http
 * actions (the primary Hands use case).
 *
 * This replaces better-sqlite3 on Railway where native addons are tricky.
 */

import { SchedulerManager } from './SchedulerManager.js';
import { ExecutorManager } from './ExecutorManager.js';
import type { Task, TaskFilter } from './TaskManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('supabase-cron');

interface SupabaseCronConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * Supabase-backed TaskManager replacement.
 * Uses the hands_schedules table via REST API.
 */
class SupabaseTaskManager {
  private url: string;
  private key: string;

  constructor(config: SupabaseCronConfig) {
    this.url = config.supabaseUrl;
    this.key = config.serviceRoleKey;
  }

  private async supaFetch(path: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        Prefer: options.method === 'POST' ? 'return=representation' : 'return=minimal',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase cron error ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) return res.json();
    return null;
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      name: row.name || 'Unnamed',
      description: undefined,
      schedule: {
        type: 'cron' as const,
        expression: row.cron_expression,
      },
      action: {
        type: 'http' as const,
        config: {
          url: row.webhook_url,
          method: row.webhook_method || 'POST',
          headers: row.webhook_headers || {},
          body: row.webhook_body,
        },
      },
      options: {
        timezone: row.timezone || 'UTC',
        enabled: row.enabled !== false,
        timeout: 30000,
        retryCount: 0,
      },
      metadata: {
        tags: [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      },
    };
  }

  private taskToRow(task: Omit<Task, 'id' | 'metadata'>, userId: string): Record<string, any> {
    return {
      user_id: userId,
      name: task.name,
      webhook_url: task.action.config.url || '',
      webhook_method: task.action.config.method || 'POST',
      webhook_headers: task.action.config.headers || {},
      webhook_body: task.action.config.body || null,
      cron_expression: task.schedule.expression || '* * * * *',
      timezone: task.options.timezone || 'UTC',
      enabled: task.options.enabled !== false,
    };
  }

  async createTask(task: Omit<Task, 'id' | 'metadata'>, userId = 'system'): Promise<Task> {
    const row = this.taskToRow(task, userId);
    const result = await this.supaFetch('hands_schedules', {
      method: 'POST',
      body: JSON.stringify(row),
    });
    return this.rowToTask(Array.isArray(result) ? result[0] : result);
  }

  async getTask(id: string): Promise<Task | null> {
    const rows = await this.supaFetch(`hands_schedules?id=eq.${id}&limit=1`);
    return rows && rows.length > 0 ? this.rowToTask(rows[0]) : null;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'metadata'>>): Promise<Task> {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name) patch.name = updates.name;
    if (updates.schedule?.expression) patch.cron_expression = updates.schedule.expression;
    if (updates.action?.config?.url) patch.webhook_url = updates.action.config.url;
    if (updates.action?.config?.method) patch.webhook_method = updates.action.config.method;
    if (updates.options?.timezone) patch.timezone = updates.options.timezone;
    if (updates.options?.enabled !== undefined) patch.enabled = updates.options.enabled;

    await this.supaFetch(`hands_schedules?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const task = await this.getTask(id);
    if (!task) throw new Error(`Task not found after update: ${id}`);
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await this.supaFetch(`hands_schedules?id=eq.${id}`, { method: 'DELETE' });
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    let query = 'hands_schedules?order=created_at.desc';
    if (filter.enabled !== undefined) query += `&enabled=eq.${filter.enabled}`;
    if (filter.limit) query += `&limit=${filter.limit}`;
    if (filter.offset) query += `&offset=${filter.offset}`;

    const rows = await this.supaFetch(query);
    return (rows || []).map((r: any) => this.rowToTask(r));
  }

  async enableTask(id: string): Promise<void> {
    await this.supaFetch(`hands_schedules?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true, updated_at: new Date().toISOString() }),
    });
  }

  async disableTask(id: string): Promise<void> {
    await this.supaFetch(`hands_schedules?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
    });
  }

  async getEnabledTasks(): Promise<Task[]> {
    return this.listTasks({ enabled: true });
  }

  close(): void {
    // No-op — Supabase is stateless
  }
}

/**
 * Supabase-backed CronEngine for ASURIQ mode.
 * Drop-in replacement for CronEngine when better-sqlite3 isn't available.
 */
export class SupabaseCronEngine {
  public taskManager: SupabaseTaskManager;
  public scheduler: SchedulerManager;
  public executor: ExecutorManager;
  // History not backed by Supabase yet — in-memory only for MVP

  constructor(config: SupabaseCronConfig) {
    logger.info('SupabaseCronEngine initializing');
    this.taskManager = new SupabaseTaskManager(config);
    this.scheduler = new SchedulerManager();
    this.executor = new ExecutorManager({} as any); // placeholder history manager

    this.scheduler.setTriggerCallback(async (task) => {
      await this.executor.executeTask(task);
    });

    // Load tasks async after construction
    this.loadTasks().catch(err => logger.error('Failed to load tasks', { error: err }));
    logger.info('SupabaseCronEngine initialized');
  }

  private async loadTasks(): Promise<void> {
    const tasks = await this.taskManager.getEnabledTasks();
    logger.info('Loading existing tasks from Supabase', { count: tasks.length });
    for (const task of tasks) {
      try { this.scheduler.schedule(task); } catch (err) {
        logger.error('Failed to schedule task', { id: task.id, error: err });
      }
    }
  }

  async createTask(taskData: Omit<Task, 'id' | 'metadata'>): Promise<Task> {
    const task = await this.taskManager.createTask(taskData);
    if (task.options.enabled !== false) this.scheduler.schedule(task);
    return task;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'metadata'>>): Promise<Task> {
    const task = await this.taskManager.updateTask(id, updates);
    if (task.options.enabled) {
      this.scheduler.unschedule(id);
      this.scheduler.schedule(task);
    }
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    this.scheduler.unschedule(id);
    await this.taskManager.deleteTask(id);
  }

  async enableTask(id: string): Promise<void> {
    await this.taskManager.enableTask(id);
    const task = await this.taskManager.getTask(id);
    if (task) this.scheduler.schedule(task);
  }

  async disableTask(id: string): Promise<void> {
    this.scheduler.unschedule(id);
    await this.taskManager.disableTask(id);
  }

  async executeNow(id: string): Promise<void> {
    const task = await this.taskManager.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    await this.executor.executeTask(task);
  }

  async healthCheck(): Promise<boolean> {
    return !!(this.taskManager && this.scheduler && this.executor);
  }

  close(): void {
    logger.info('Closing SupabaseCronEngine');
    this.scheduler.stopAll();
    this.taskManager.close();
  }
}
