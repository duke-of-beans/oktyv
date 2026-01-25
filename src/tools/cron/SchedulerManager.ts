import cron from 'node-cron';
import cronParser from 'cron-parser';
import type { Task } from './TaskManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('scheduler-manager');

export type TaskTriggerCallback = (task: Task) => Promise<void>;

interface ScheduledJob {
  task: Task;
  cronJob?: cron.ScheduledTask;
  intervalId?: NodeJS.Timeout;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Scheduler Manager - Cron scheduling engine
 */
export class SchedulerManager {
  private jobs: Map<string, ScheduledJob> = new Map();
  private triggerCallback?: TaskTriggerCallback;
  
  /**
   * Initialize scheduler manager
   */
  constructor() {
    logger.info('Scheduler manager initialized');
  }
  
  /**
   * Set callback for task triggers
   */
  setTriggerCallback(callback: TaskTriggerCallback): void {
    this.triggerCallback = callback;
  }
  
  /**
   * Schedule task
   */
  schedule(task: Task): void {
    logger.info('Scheduling task', { id: task.id, type: task.schedule.type });
    
    // Unschedule if already scheduled
    if (this.jobs.has(task.id)) {
      this.unschedule(task.id);
    }
    
    const job: ScheduledJob = { task };
    
    switch (task.schedule.type) {
      case 'cron':
        this.scheduleCron(job);
        break;
      case 'interval':
        this.scheduleInterval(job);
        break;
      case 'once':
        this.scheduleOnce(job);
        break;
    }
    
    this.jobs.set(task.id, job);
    logger.info('Task scheduled', { id: task.id });
  }
  
  /**
   * Schedule cron task
   */
  private scheduleCron(job: ScheduledJob): void {
    const { task } = job;
    
    if (!task.schedule.expression) {
      throw new Error('Cron expression required for cron tasks');
    }
    
    // Validate cron expression
    if (!this.validate(task.schedule.expression)) {
      throw new Error(`Invalid cron expression: ${task.schedule.expression}`);
    }
    
    // Create cron job
    job.cronJob = cron.schedule(
      task.schedule.expression,
      async () => {
        logger.info('Cron task triggered', { id: task.id });
        if (this.triggerCallback) {
          await this.triggerCallback(task);
        }
      },
      {
        scheduled: true,
        timezone: task.options.timezone || 'UTC',
      }
    );
  }
  
  /**
   * Schedule interval task
   */
  private scheduleInterval(job: ScheduledJob): void {
    const { task } = job;
    
    if (!task.schedule.interval) {
      throw new Error('Interval required for interval tasks');
    }
    
    // Create interval
    job.intervalId = setInterval(async () => {
      logger.info('Interval task triggered', { id: task.id });
      if (this.triggerCallback) {
        await this.triggerCallback(task);
      }
    }, task.schedule.interval);
  }
  
  /**
   * Schedule one-time task
   */
  private scheduleOnce(job: ScheduledJob): void {
    const { task } = job;
    
    if (!task.schedule.executeAt) {
      throw new Error('Execute time required for one-time tasks');
    }
    
    const now = Date.now();
    const executeTime = task.schedule.executeAt.getTime();
    const delay = executeTime - now;
    
    if (delay < 0) {
      throw new Error('Execute time must be in the future');
    }
    
    // Create timeout
    job.timeoutId = setTimeout(async () => {
      logger.info('One-time task triggered', { id: task.id });
      if (this.triggerCallback) {
        await this.triggerCallback(task);
      }
      
      // Remove job after execution
      this.jobs.delete(task.id);
    }, delay);
  }
  
  /**
   * Unschedule task
   */
  unschedule(taskId: string): void {
    logger.info('Unscheduling task', { id: taskId });
    
    const job = this.jobs.get(taskId);
    if (!job) {
      return;
    }
    
    // Stop cron job
    if (job.cronJob) {
      job.cronJob.stop();
    }
    
    // Clear interval
    if (job.intervalId) {
      clearInterval(job.intervalId);
    }
    
    // Clear timeout
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }
    
    this.jobs.delete(taskId);
    logger.info('Task unscheduled', { id: taskId });
  }
  
  /**
   * Pause task
   */
  pause(taskId: string): void {
    logger.info('Pausing task', { id: taskId });
    
    const job = this.jobs.get(taskId);
    if (!job) {
      throw new Error(`Task not scheduled: ${taskId}`);
    }
    
    if (job.cronJob) {
      job.cronJob.stop();
    }
    
    logger.info('Task paused', { id: taskId });
  }
  
  /**
   * Resume task
   */
  resume(taskId: string): void {
    logger.info('Resuming task', { id: taskId });
    
    const job = this.jobs.get(taskId);
    if (!job) {
      throw new Error(`Task not scheduled: ${taskId}`);
    }
    
    if (job.cronJob) {
      job.cronJob.start();
    }
    
    logger.info('Task resumed', { id: taskId });
  }
  
  /**
   * Validate cron expression
   */
  validate(expression: string): boolean {
    try {
      // Use cron.validate from node-cron
      const isValid = cron.validate(expression);
      
      // Also check with cron-parser for 5-field format
      if (isValid) {
        try {
          cronParser.parseExpression(expression);
          return true;
        } catch {
          return false;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }
  
  /**
   * Get next run time for cron expression
   */
  getNextRun(expression: string, timezone?: string): Date | null {
    try {
      const options: any = {
        currentDate: new Date(),
      };
      
      if (timezone) {
        options.tz = timezone;
      }
      
      const interval = cronParser.parseExpression(expression, options);
      const next = interval.next();
      return next.toDate();
    } catch (error) {
      logger.error('Failed to parse cron expression', { expression, error });
      return null;
    }
  }
  
  /**
   * Check if task is scheduled
   */
  isScheduled(taskId: string): boolean {
    return this.jobs.has(taskId);
  }
  
  /**
   * Get scheduled task count
   */
  getScheduledCount(): number {
    return this.jobs.size;
  }
  
  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    logger.info('Stopping all tasks', { count: this.jobs.size });
    
    for (const taskId of this.jobs.keys()) {
      this.unschedule(taskId);
    }
    
    logger.info('All tasks stopped');
  }
}
