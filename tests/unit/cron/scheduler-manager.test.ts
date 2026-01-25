import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SchedulerManager } from '../../../src/tools/cron/SchedulerManager.js';
import type { Task } from '../../../src/tools/cron/TaskManager.js';

describe('SchedulerManager', () => {
  let scheduler: SchedulerManager;
  
  before(async () => {
    scheduler = new SchedulerManager();
  });
  
  after(async () => {
    scheduler.stopAll();
  });
  
  describe('validate()', () => {
    it('should validate correct cron expressions', async () => {
      assert.strictEqual(scheduler.validate('0 9 * * *'), true);
      assert.strictEqual(scheduler.validate('*/15 * * * *'), true);
      assert.strictEqual(scheduler.validate('0 0 * * 0'), true);
    });
    
    it('should reject invalid cron expressions', async () => {
      assert.strictEqual(scheduler.validate('invalid'), false);
      assert.strictEqual(scheduler.validate('60 * * * *'), false);
      assert.strictEqual(scheduler.validate('* * * * * * *'), false); // 7-field not valid
    });
  });
  
  describe('getNextRun()', () => {
    it('should calculate next run time', async () => {
      const nextRun = scheduler.getNextRun('0 9 * * *');
      assert.ok(nextRun);
      assert.ok(nextRun instanceof Date);
      assert.ok(nextRun.getTime() > Date.now());
    });
    
    it('should handle timezone', async () => {
      const nextRun = scheduler.getNextRun('0 9 * * *', 'America/New_York');
      assert.ok(nextRun);
    });
    
    it('should return null for invalid expression', async () => {
      const nextRun = scheduler.getNextRun('invalid');
      assert.strictEqual(nextRun, null);
    });
  });
  
  describe('schedule()', () => {
    it('should schedule cron task', async () => {
      let triggered = false;
      
      scheduler.setTriggerCallback(async (task) => {
        triggered = true;
      });
      
      const task: Task = {
        id: 'test-task-1',
        name: 'Test Task',
        schedule: {
          type: 'cron',
          expression: '*/1 * * * * *', // Every second (would need 6-field support, using */1 for test)
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      assert.strictEqual(scheduler.isScheduled('test-task-1'), true);
      
      scheduler.unschedule('test-task-1');
    });
    
    it('should schedule interval task', async () => {
      const task: Task = {
        id: 'test-interval-1',
        name: 'Interval Task',
        schedule: {
          type: 'interval',
          interval: 1000, // 1 second
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      assert.strictEqual(scheduler.isScheduled('test-interval-1'), true);
      
      scheduler.unschedule('test-interval-1');
    });
    
    it('should schedule one-time task', async () => {
      const executeAt = new Date(Date.now() + 1000); // 1 second from now
      
      const task: Task = {
        id: 'test-once-1',
        name: 'Once Task',
        schedule: {
          type: 'once',
          executeAt,
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      assert.strictEqual(scheduler.isScheduled('test-once-1'), true);
      
      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Task should be removed after execution
      assert.strictEqual(scheduler.isScheduled('test-once-1'), false);
    });
  });
  
  describe('unschedule()', () => {
    it('should unschedule task', async () => {
      const task: Task = {
        id: 'test-unschedule',
        name: 'Unschedule Test',
        schedule: {
          type: 'interval',
          interval: 1000,
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      assert.strictEqual(scheduler.isScheduled('test-unschedule'), true);
      
      scheduler.unschedule('test-unschedule');
      assert.strictEqual(scheduler.isScheduled('test-unschedule'), false);
    });
  });
  
  describe('pause() / resume()', () => {
    it('should pause and resume cron task', async () => {
      const task: Task = {
        id: 'test-pause',
        name: 'Pause Test',
        schedule: {
          type: 'cron',
          expression: '* * * * *',
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      scheduler.pause('test-pause');
      
      // Task should still be scheduled but paused
      assert.strictEqual(scheduler.isScheduled('test-pause'), true);
      
      scheduler.resume('test-pause');
      assert.strictEqual(scheduler.isScheduled('test-pause'), true);
      
      scheduler.unschedule('test-pause');
    });
  });
  
  describe('getScheduledCount()', () => {
    it('should return scheduled task count', async () => {
      const initialCount = scheduler.getScheduledCount();
      
      const task: Task = {
        id: 'test-count',
        name: 'Count Test',
        schedule: {
          type: 'interval',
          interval: 1000,
        },
        action: {
          type: 'http',
          config: {},
        },
        options: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      
      scheduler.schedule(task);
      assert.strictEqual(scheduler.getScheduledCount(), initialCount + 1);
      
      scheduler.unschedule('test-count');
      assert.strictEqual(scheduler.getScheduledCount(), initialCount);
    });
  });
  
  describe('stopAll()', () => {
    it('should stop all tasks', async () => {
      // Schedule multiple tasks
      for (let i = 0; i < 3; i++) {
        const task: Task = {
          id: `test-stop-all-${i}`,
          name: `Stop All Test ${i}`,
          schedule: {
            type: 'interval',
            interval: 1000,
          },
          action: {
            type: 'http',
            config: {},
          },
          options: {},
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };
        scheduler.schedule(task);
      }
      
      assert.ok(scheduler.getScheduledCount() >= 3);
      
      scheduler.stopAll();
      assert.strictEqual(scheduler.getScheduledCount(), 0);
    });
  });
});
