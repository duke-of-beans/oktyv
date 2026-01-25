import type { Task } from './TaskManager.js';
import type { HistoryManager } from './HistoryManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('executor-manager');

/**
 * Executor Manager - Execute task actions
 */
export class ExecutorManager {
  private historyManager: HistoryManager;
  
  /**
   * Initialize executor manager
   */
  constructor(historyManager: HistoryManager) {
    this.historyManager = historyManager;
    logger.info('Executor manager initialized');
  }
  
  /**
   * Execute task
   */
  async executeTask(task: Task): Promise<void> {
    if (!task.options.enabled) {
      logger.warn('Task is disabled, skipping execution', { id: task.id });
      return;
    }
    
    const executionId = this.historyManager.startExecution(task.id);
    
    logger.info('Executing task', { id: task.id, type: task.action.type });
    
    try {
      // Execute with timeout
      const timeout = task.options.timeout || 30000;
      const result = await this.executeWithTimeout(task, timeout);
      
      // Complete execution
      this.historyManager.completeExecution(executionId, result);
      
      logger.info('Task executed successfully', { id: task.id });
    } catch (error: any) {
      logger.error('Task execution failed', { id: task.id, error });
      
      // Check if timeout
      if (error.message === 'EXECUTION_TIMEOUT') {
        this.historyManager.timeoutExecution(executionId);
      } else {
        // Check for retry
        const retryCount = task.options.retryCount || 0;
        
        if (retryCount > 0) {
          logger.info('Retrying task', { id: task.id, retriesLeft: retryCount });
          
          // Wait before retry
          await this.delay(task.options.retryDelay || 5000);
          
          // Retry (decrement retry count)
          const retryTask = {
            ...task,
            options: {
              ...task.options,
              retryCount: retryCount - 1,
            },
          };
          
          await this.executeTask(retryTask);
        } else {
          this.historyManager.failExecution(executionId, error.message);
        }
      }
    }
  }
  
  /**
   * Execute task with timeout
   */
  private async executeWithTimeout(task: Task, timeout: number): Promise<any> {
    return Promise.race([
      this.executeAction(task),
      this.timeoutPromise(timeout),
    ]);
  }
  
  /**
   * Execute task action
   */
  private async executeAction(task: Task): Promise<any> {
    switch (task.action.type) {
      case 'http':
        return await this.executeHttp(task);
      
      case 'webhook':
        return await this.executeWebhook(task);
      
      case 'file':
        return await this.executeFile(task);
      
      case 'database':
        return await this.executeDatabase(task);
      
      case 'email':
        return await this.executeEmail(task);
      
      default:
        throw new Error(`Unknown action type: ${task.action.type}`);
    }
  }
  
  /**
   * Execute HTTP action
   */
  private async executeHttp(task: Task): Promise<any> {
    const { url, method = 'GET', headers, body } = task.action.config;
    
    logger.debug('Executing HTTP request', { url, method });
    
    const response = await fetch(url, {
      method,
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json().catch(() => response.text());
  }
  
  /**
   * Execute webhook action
   */
  private async executeWebhook(task: Task): Promise<any> {
    // Webhooks are just HTTP POST requests
    return await this.executeHttp({
      ...task,
      action: {
        type: 'http',
        config: {
          method: 'POST',
          ...task.action.config,
        },
      },
    });
  }
  
  /**
   * Execute file action (placeholder for File Engine integration)
   */
  private async executeFile(task: Task): Promise<any> {
    logger.info('File action execution not yet implemented', { task: task.id });
    return { status: 'not_implemented' };
  }
  
  /**
   * Execute database action (placeholder for Database Engine integration)
   */
  private async executeDatabase(task: Task): Promise<any> {
    logger.info('Database action execution not yet implemented', { task: task.id });
    return { status: 'not_implemented' };
  }
  
  /**
   * Execute email action (placeholder for Email Engine integration)
   */
  private async executeEmail(task: Task): Promise<any> {
    logger.info('Email action execution not yet implemented', { task: task.id });
    return { status: 'not_implemented' };
  }
  
  /**
   * Create timeout promise
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('EXECUTION_TIMEOUT')), ms);
    });
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
