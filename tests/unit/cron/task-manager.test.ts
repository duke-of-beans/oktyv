import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { TaskManager, Task } from '../../../src/tools/cron/TaskManager.js';

const TEST_DB = path.join(process.cwd(), 'test-tmp-task-manager.db');

describe('TaskManager', () => {
  let taskManager: TaskManager;
  
  before(async () => {
    // Remove test database if it exists
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    
    taskManager = new TaskManager(TEST_DB);
  });
  
  after(async () => {
    taskManager.close();
    
    // Clean up test database
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });
  
  describe('createTask()', () => {
    it('should create cron task', async () => {
      const task = taskManager.createTask({
        name: 'Test Cron Task',
        description: 'A test cron task',
        schedule: {
          type: 'cron',
          expression: '0 2 * * *',
        },
        action: {
          type: 'http',
          config: {
            url: 'https://example.com/api',
            method: 'POST',
          },
        },
        options: {
          timezone: 'America/New_York',
          retryCount: 3,
        },
      });
      
      assert.ok(task.id);
      assert.strictEqual(task.name, 'Test Cron Task');
      assert.strictEqual(task.schedule.type, 'cron');
      assert.strictEqual(task.schedule.expression, '0 2 * * *');
    });
    
    it('should create interval task', async () => {
      const task = taskManager.createTask({
        name: 'Test Interval Task',
        schedule: {
          type: 'interval',
          interval: 60000, // 1 minute
        },
        action: {
          type: 'webhook',
          config: {
            url: 'https://hooks.example.com/test',
          },
        },
        options: {},
      });
      
      assert.ok(task.id);
      assert.strictEqual(task.schedule.type, 'interval');
      assert.strictEqual(task.schedule.interval, 60000);
    });
    
    it('should create one-time task', async () => {
      const executeAt = new Date(Date.now() + 3600000); // 1 hour from now
      
      const task = taskManager.createTask({
        name: 'Test Once Task',
        schedule: {
          type: 'once',
          executeAt,
        },
        action: {
          type: 'email',
          config: {
            to: 'test@example.com',
            subject: 'Test',
          },
        },
        options: {},
      });
      
      assert.ok(task.id);
      assert.strictEqual(task.schedule.type, 'once');
      assert.ok(task.schedule.executeAt);
    });
  });
  
  describe('getTask()', () => {
    it('should get task by ID', async () => {
      const created = taskManager.createTask({
        name: 'Get Task Test',
        schedule: {
          type: 'cron',
          expression: '0 0 * * *',
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
      });
      
      const retrieved = taskManager.getTask(created.id);
      
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, created.id);
      assert.strictEqual(retrieved.name, 'Get Task Test');
    });
    
    it('should return null for non-existent task', async () => {
      const task = taskManager.getTask('non-existent-id');
      assert.strictEqual(task, null);
    });
  });
  
  describe('updateTask()', () => {
    it('should update task', async () => {
      const task = taskManager.createTask({
        name: 'Update Test',
        schedule: {
          type: 'cron',
          expression: '0 0 * * *',
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
      });
      
      const updated = taskManager.updateTask(task.id, {
        name: 'Updated Name',
        schedule: {
          type: 'cron',
          expression: '0 1 * * *',
        },
      });
      
      assert.strictEqual(updated.name, 'Updated Name');
      assert.strictEqual(updated.schedule.expression, '0 1 * * *');
    });
  });
  
  describe('deleteTask()', () => {
    it('should delete task', async () => {
      const task = taskManager.createTask({
        name: 'Delete Test',
        schedule: {
          type: 'cron',
          expression: '0 0 * * *',
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
      });
      
      taskManager.deleteTask(task.id);
      
      const retrieved = taskManager.getTask(task.id);
      assert.strictEqual(retrieved, null);
    });
    
    it('should throw for non-existent task', async () => {
      assert.throws(() => {
        taskManager.deleteTask('non-existent-id');
      }, /Task not found/);
    });
  });
  
  describe('listTasks()', () => {
    it('should list all tasks', async () => {
      const tasks = taskManager.listTasks();
      assert.ok(Array.isArray(tasks));
    });
    
    it('should filter by enabled', async () => {
      taskManager.createTask({
        name: 'Enabled Task',
        schedule: { type: 'cron', expression: '0 0 * * *' },
        action: { type: 'http', config: {} },
        options: { enabled: true },
      });
      
      taskManager.createTask({
        name: 'Disabled Task',
        schedule: { type: 'cron', expression: '0 0 * * *' },
        action: { type: 'http', config: {} },
        options: { enabled: false },
      });
      
      const enabled = taskManager.listTasks({ enabled: true });
      assert.ok(enabled.every(t => t.options.enabled === true));
    });
    
    it('should filter by schedule type', async () => {
      const cron = taskManager.listTasks({ scheduleType: 'cron' });
      assert.ok(cron.every(t => t.schedule.type === 'cron'));
    });
    
    it('should limit results', async () => {
      const tasks = taskManager.listTasks({ limit: 2 });
      assert.ok(tasks.length <= 2);
    });
  });
  
  describe('enableTask() / disableTask()', () => {
    it('should enable task', async () => {
      const task = taskManager.createTask({
        name: 'Enable Test',
        schedule: { type: 'cron', expression: '0 0 * * *' },
        action: { type: 'http', config: {} },
        options: { enabled: false },
      });
      
      taskManager.enableTask(task.id);
      
      const updated = taskManager.getTask(task.id);
      assert.strictEqual(updated?.options.enabled, true);
    });
    
    it('should disable task', async () => {
      const task = taskManager.createTask({
        name: 'Disable Test',
        schedule: { type: 'cron', expression: '0 0 * * *' },
        action: { type: 'http', config: {} },
        options: { enabled: true },
      });
      
      taskManager.disableTask(task.id);
      
      const updated = taskManager.getTask(task.id);
      assert.strictEqual(updated?.options.enabled, false);
    });
  });
  
  describe('getEnabledTasks()', () => {
    it('should get only enabled tasks', async () => {
      const tasks = taskManager.getEnabledTasks();
      assert.ok(tasks.every(t => t.options.enabled === true));
    });
  });
});
