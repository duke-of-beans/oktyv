import { TaskManager, Task } from './TaskManager.js';
import { SchedulerManager } from './SchedulerManager.js';
import { HistoryManager } from './HistoryManager.js';
import { ExecutorManager } from './ExecutorManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('cron-engine');

/**
 * Cron Engine - Main orchestrator for task scheduling
 */
export class CronEngine {
  public taskManager: TaskManager;
  public scheduler: SchedulerManager;
  public history: HistoryManager;
  public executor: ExecutorManager;
  
  /**
   * Initialize Cron Engine
   */
  constructor(dbPath?: string) {
    logger.info('Cron Engine initializing');
    
    // Initialize managers
    this.taskManager = new TaskManager(dbPath);
    this.scheduler = new SchedulerManager();
    this.history = new HistoryManager(this.taskManager['db']); // Access private db
    this.executor = new ExecutorManager(this.history);
    
    // Set up scheduler callback
    this.scheduler.setTriggerCallback(async (task) => {
      await this.executor.executeTask(task);
    });
    
    // Load and schedule existing enabled tasks
    this.loadTasks();
    
    logger.info('Cron Engine initialized');
  }
  
  /**
   * Load existing enabled tasks into scheduler
   */
  private loadTasks(): void {
    const tasks = this.taskManager.getEnabledTasks();
    
    logger.info('Loading existing tasks', { count: tasks.length });
    
    for (const task of tasks) {
      try {
        this.scheduler.schedule(task);
      } catch (error) {
        logger.error('Failed to schedule task', { id: task.id, error });
      }
    }
  }
  
  /**
   * Create and schedule task
   */
  createTask(taskData: Omit<Task, 'id' | 'metadata'>): Task {
    const task = this.taskManager.createTask(taskData);
    
    if (task.options.enabled !== false) {
      this.scheduler.schedule(task);
    }
    
    return task;
  }
  
  /**
   * Update task
   */
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'metadata'>>): Task {
    const task = this.taskManager.updateTask(taskId, updates);
    
    // Reschedule if schedule changed and task is enabled
    if (task.options.enabled) {
      this.scheduler.unschedule(taskId);
      this.scheduler.schedule(task);
    }
    
    return task;
  }
  
  /**
   * Delete task
   */
  deleteTask(taskId: string): void {
    this.scheduler.unschedule(taskId);
    this.taskManager.deleteTask(taskId);
  }
  
  /**
   * Enable task
   */
  enableTask(taskId: string): void {
    this.taskManager.enableTask(taskId);
    
    const task = this.taskManager.getTask(taskId);
    if (task) {
      this.scheduler.schedule(task);
    }
  }
  
  /**
   * Disable task
   */
  disableTask(taskId: string): void {
    this.scheduler.unschedule(taskId);
    this.taskManager.disableTask(taskId);
  }
  
  /**
   * Execute task immediately
   */
  async executeNow(taskId: string): Promise<void> {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    await this.executor.executeTask(task);
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Verify managers are initialized
      return !!(
        this.taskManager &&
        this.scheduler &&
        this.history &&
        this.executor
      );
    } catch {
      return false;
    }
  }
  
  /**
   * Close engine and cleanup
   */
  close(): void {
    logger.info('Closing Cron Engine');
    
    this.scheduler.stopAll();
    this.taskManager.close();
    
    logger.info('Cron Engine closed');
  }
}
