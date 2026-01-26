/**
 * Parallel Execution Engine Tests
 * 
 * Tests for the main orchestrator that coordinates DAG building,
 * task execution, and result collection.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ParallelExecutionEngine } from '../ParallelExecutionEngine.js';
import type { ExecutionRequest, Task } from '../types.js';

describe('ParallelExecutionEngine', () => {
  describe('Basic execution', () => {
    it('should execute single task', async () => {
      const mockTool = mock.fn(async (params: any) => ({ output: 'result' }));
      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          {
            id: 'task1',
            tool: 'tool1',
            params: { input: 'test' },
            dependencies: []
          }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.strictEqual(response.summary.total, 1);
      assert.strictEqual(response.summary.succeeded, 1);
      assert.strictEqual(response.summary.failed, 0);
      assert.strictEqual(response.tasks['task1'].status, 'success');
      assert.deepStrictEqual(response.tasks['task1'].result, { output: 'result' });
      assert.strictEqual(mockTool.mock.calls.length, 1);
    });

    it('should execute independent tasks in parallel', async () => {
      const delays: number[] = [];
      const mockTool = mock.fn(async (params: any) => {
        const delay = params.delay;
        delays.push(delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        return { output: params.id };
      });

      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: { id: 1, delay: 50 }, dependencies: [] },
          { id: 'task2', tool: 'tool1', params: { id: 2, delay: 50 }, dependencies: [] },
          { id: 'task3', tool: 'tool1', params: { id: 3, delay: 50 }, dependencies: [] }
        ],
        config: { maxConcurrent: 3 }
      };

      const startTime = Date.now();
      const response = await engine.execute(request);
      const duration = Date.now() - startTime;

      assert.strictEqual(response.status, 'success');
      assert.strictEqual(response.summary.succeeded, 3);
      // Should complete in ~50ms if parallel, ~150ms if sequential
      assert.ok(duration < 100, `Expected parallel execution <100ms, got ${duration}ms`);
    });

    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const mockTool = mock.fn(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent--;
        return { output: 'done' };
      });

      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'task2', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'task3', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'task4', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'task5', tool: 'tool1', params: {}, dependencies: [] }
        ],
        config: { maxConcurrent: 2 }
      };

      await engine.execute(request);

      assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}, expected ≤2`);
    });
  });

  describe('Dependency execution', () => {
    it('should execute tasks respecting dependencies', async () => {
      const executionOrder: string[] = [];
      const mockTool = mock.fn(async (params: any) => {
        executionOrder.push(params.id);
        return { output: params.id };
      });

      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: { id: 'task1' }, dependencies: [] },
          { id: 'task2', tool: 'tool1', params: { id: 'task2' }, dependencies: ['task1'] },
          { id: 'task3', tool: 'tool1', params: { id: 'task3' }, dependencies: ['task2'] }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.deepStrictEqual(executionOrder, ['task1', 'task2', 'task3']);
    });

    it('should execute diamond dependency pattern correctly', async () => {
      const executionOrder: string[] = [];
      const mockTool = mock.fn(async (params: any) => {
        executionOrder.push(params.id);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { output: params.id };
      });

      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      // Diamond: A -> B,C -> D
      const request: ExecutionRequest = {
        tasks: [
          { id: 'A', tool: 'tool1', params: { id: 'A' }, dependencies: [] },
          { id: 'B', tool: 'tool1', params: { id: 'B' }, dependencies: ['A'] },
          { id: 'C', tool: 'tool1', params: { id: 'C' }, dependencies: ['A'] },
          { id: 'D', tool: 'tool1', params: { id: 'D' }, dependencies: ['B', 'C'] }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.strictEqual(executionOrder[0], 'A'); // A must be first
      assert.strictEqual(executionOrder[3], 'D'); // D must be last
      // B and C can be in any order
      assert.ok(executionOrder.includes('B'));
      assert.ok(executionOrder.includes('C'));
    });
  });

  describe('Variable substitution', () => {
    it('should substitute variables from previous task results', async () => {
      const tools = new Map([
        ['producer', mock.fn(async () => ({ userId: 123, name: 'Alice' }))],
        ['consumer', mock.fn(async (params: any) => ({ receivedId: params.id, receivedName: params.name }))]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'producer', params: {}, dependencies: [] },
          {
            id: 'task2',
            tool: 'consumer',
            params: {
              id: '${task1.result.userId}',
              name: '${task1.result.name}'
            },
            dependencies: ['task1']
          }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.deepStrictEqual(response.tasks['task2'].result, {
        receivedId: 123,
        receivedName: 'Alice'
      });
    });

    it('should handle nested variable paths', async () => {
      const tools = new Map([
        ['producer', mock.fn(async () => ({ data: { nested: { value: 42 } } }))],
        ['consumer', mock.fn(async (params: any) => ({ received: params.val }))]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'producer', params: {}, dependencies: [] },
          {
            id: 'task2',
            tool: 'consumer',
            params: { val: '${task1.result.data.nested.value}' },
            dependencies: ['task1']
          }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.deepStrictEqual(response.tasks['task2'].result, { received: 42 });
    });
  });

  describe('Error handling', () => {
    it('should mark task as failed on error', async () => {
      const tools = new Map([
        ['failing', mock.fn(async () => {
          throw new Error('Task failed');
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'failing', params: {}, dependencies: [] }
        ],
        config: { continueOnError: true }
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'failure');
      assert.strictEqual(response.summary.failed, 1);
      assert.strictEqual(response.tasks['task1'].status, 'failed');
      assert.ok(response.tasks['task1'].error);
      assert.strictEqual(response.tasks['task1'].error?.message, 'Task failed');
    });

    it('should stop execution on failure when continueOnError is false', async () => {
      const executionOrder: string[] = [];
      const tools = new Map([
        ['normal', mock.fn(async (params: any) => {
          executionOrder.push(params.id);
          return { output: params.id };
        })],
        ['failing', mock.fn(async () => {
          executionOrder.push('failing');
          throw new Error('Task failed');
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'normal', params: { id: 'task1' }, dependencies: [] },
          { id: 'task2', tool: 'failing', params: {}, dependencies: ['task1'] },
          { id: 'task3', tool: 'normal', params: { id: 'task3' }, dependencies: ['task2'] }
        ],
        config: { continueOnError: false }
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'partial');
      assert.strictEqual(response.summary.succeeded, 1); // Only task1
      assert.strictEqual(response.summary.failed, 1); // task2
      assert.strictEqual(response.summary.skipped, 1); // task3
      assert.strictEqual(response.tasks['task3'].status, 'skipped');
      assert.deepStrictEqual(executionOrder, ['task1', 'failing']);
    });

    it('should continue execution on failure when continueOnError is true', async () => {
      const executionOrder: string[] = [];
      const tools = new Map([
        ['normal', mock.fn(async (params: any) => {
          executionOrder.push(params.id);
          return { output: params.id };
        })],
        ['failing', mock.fn(async () => {
          executionOrder.push('failing');
          throw new Error('Task failed');
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'normal', params: { id: 'task1' }, dependencies: [] },
          { id: 'task2', tool: 'failing', params: {}, dependencies: ['task1'] },
          { id: 'task3', tool: 'normal', params: { id: 'task3' }, dependencies: [] }
        ],
        config: { continueOnError: true }
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'partial');
      assert.strictEqual(response.summary.succeeded, 2); // task1 and task3
      assert.strictEqual(response.summary.failed, 1); // task2
      assert.ok(executionOrder.includes('task1'));
      assert.ok(executionOrder.includes('failing'));
      assert.ok(executionOrder.includes('task3'));
    });

    it('should handle tool not found error', async () => {
      const tools = new Map([['tool1', mock.fn(async () => ({ output: 'test' }))]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'nonexistent', params: {}, dependencies: [] }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'failure');
      assert.strictEqual(response.tasks['task1'].status, 'failed');
      assert.ok(response.tasks['task1'].error?.message.includes('Tool not found'));
    });
  });

  describe('Timeout handling', () => {
    it('should timeout long-running tasks', async () => {
      const tools = new Map([
        ['slow', mock.fn(async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { output: 'done' };
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'slow', params: {}, dependencies: [], timeout: 100 }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'failure');
      assert.strictEqual(response.tasks['task1'].status, 'failed');
      assert.ok(
        response.tasks['task1'].error?.message.includes('timeout') ||
        response.tasks['task1'].error?.message.includes('exceeded')
      );
    });

    it('should use config timeout as default', async () => {
      const tools = new Map([
        ['slow', mock.fn(async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          return { output: 'done' };
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'slow', params: {}, dependencies: [] }
        ],
        config: { timeout: 100 }
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'failure');
      assert.strictEqual(response.tasks['task1'].status, 'failed');
    });
  });

  describe('Retry handling', () => {
    it('should retry failed tasks', async () => {
      let attemptCount = 0;
      const tools = new Map([
        ['flaky', mock.fn(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { output: 'success' };
        })]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          {
            id: 'task1',
            tool: 'flaky',
            params: {},
            dependencies: [],
            retry: {
              maxAttempts: 3,
              backoff: 'exponential',
              initialDelay: 10
            }
          }
        ]
      };

      const response = await engine.execute(request);

      assert.strictEqual(response.status, 'success');
      assert.strictEqual(response.tasks['task1'].status, 'success');
      assert.strictEqual(attemptCount, 3);
    });
  });

  describe('DAG output', () => {
    it('should include DAG levels in response', async () => {
      const mockTool = mock.fn(async () => ({ output: 'test' }));
      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'task2', tool: 'tool1', params: {}, dependencies: ['task1'] },
          { id: 'task3', tool: 'tool1', params: {}, dependencies: ['task1'] },
          { id: 'task4', tool: 'tool1', params: {}, dependencies: ['task2', 'task3'] }
        ]
      };

      const response = await engine.execute(request);

      assert.ok(response.dag);
      assert.ok(Array.isArray(response.dag.levels));
      assert.strictEqual(response.dag.levels.length, 3);
      assert.deepStrictEqual(response.dag.levels[0], ['task1']);
      assert.deepStrictEqual(response.dag.levels[1].sort(), ['task2', 'task3']);
      assert.deepStrictEqual(response.dag.levels[2], ['task4']);
    });

    it('should include edges in response', async () => {
      const mockTool = mock.fn(async () => ({ output: 'test' }));
      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'A', tool: 'tool1', params: {}, dependencies: [] },
          { id: 'B', tool: 'tool1', params: {}, dependencies: ['A'] },
          { id: 'C', tool: 'tool1', params: {}, dependencies: ['A'] }
        ]
      };

      const response = await engine.execute(request);

      assert.ok(response.dag);
      assert.ok(Array.isArray(response.dag.edges));
      assert.strictEqual(response.dag.edges.length, 2);
      // Edges should be [from, to]
      const edgeSet = new Set(response.dag.edges.map(e => `${e[0]}->${e[1]}`));
      assert.ok(edgeSet.has('A->B'));
      assert.ok(edgeSet.has('A->C'));
    });
  });

  describe('Tool management', () => {
    it('should add tools dynamically', () => {
      const tools = new Map();
      const engine = new ParallelExecutionEngine(tools);

      const newTool = mock.fn(async () => ({ output: 'test' }));
      engine.addTool('newTool', newTool);

      assert.ok(engine.getAvailableTools().includes('newTool'));
    });

    it('should remove tools', () => {
      const mockTool = mock.fn(async () => ({ output: 'test' }));
      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      assert.ok(engine.getAvailableTools().includes('tool1'));

      const removed = engine.removeTool('tool1');
      assert.strictEqual(removed, true);
      assert.ok(!engine.getAvailableTools().includes('tool1'));
    });

    it('should return false when removing non-existent tool', () => {
      const tools = new Map();
      const engine = new ParallelExecutionEngine(tools);

      const removed = engine.removeTool('nonexistent');
      assert.strictEqual(removed, false);
    });

    it('should list available tools', () => {
      const tools = new Map([
        ['tool1', mock.fn(async () => ({}))],
        ['tool2', mock.fn(async () => ({}))],
        ['tool3', mock.fn(async () => ({}))]
      ]);

      const engine = new ParallelExecutionEngine(tools);

      const available = engine.getAvailableTools();
      assert.strictEqual(available.length, 3);
      assert.ok(available.includes('tool1'));
      assert.ok(available.includes('tool2'));
      assert.ok(available.includes('tool3'));
    });
  });

  describe('Execution metadata', () => {
    it('should include timing information', async () => {
      const mockTool = mock.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { output: 'test' };
      });

      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: {}, dependencies: [] }
        ]
      };

      const response = await engine.execute(request);

      assert.ok(response.executionId);
      assert.ok(response.startTime);
      assert.ok(response.endTime);
      assert.ok(response.duration > 0);
      assert.ok(response.tasks['task1'].startTime);
      assert.ok(response.tasks['task1'].endTime);
      assert.ok(response.tasks['task1'].duration >= 50);
    });

    it('should generate unique execution IDs', async () => {
      const mockTool = mock.fn(async () => ({ output: 'test' }));
      const tools = new Map([['tool1', mockTool]]);
      const engine = new ParallelExecutionEngine(tools);

      const request: ExecutionRequest = {
        tasks: [
          { id: 'task1', tool: 'tool1', params: {}, dependencies: [] }
        ]
      };

      const response1 = await engine.execute(request);
      const response2 = await engine.execute(request);

      assert.notStrictEqual(response1.executionId, response2.executionId);
    });
  });
});
