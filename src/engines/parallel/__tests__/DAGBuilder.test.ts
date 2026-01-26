/**
 * DAG Builder Tests
 * 
 * Comprehensive test suite for graph construction, validation, and sorting
 * Using Node.js built-in test runner
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDAG,
  detectCircularDependencies,
  topologicalSort,
  validateAndBuildDAG,
  extractEdges,
  CircularDependencyError,
  MissingDependencyError,
} from '../DAGBuilder.js';
import { Task } from '../types.js';

describe('DAGBuilder', () => {
  describe('buildDAG', () => {
    it('should handle empty task list', () => {
      const tasks: Task[] = [];
      const graph = buildDAG(tasks);
      
      assert.strictEqual(graph.size, 0);
    });

    it('should handle single task with no dependencies', () => {
      const tasks: Task[] = [
        { id: 'task1', tool: 'test_tool', params: {} }
      ];
      
      const graph = buildDAG(tasks);
      
      assert.strictEqual(graph.size, 1);
      assert.ok(graph.has('task1'));
      
      const node = graph.get('task1')!;
      assert.strictEqual(node.task.id, 'task1');
      assert.strictEqual(node.dependencies.size, 0);
      assert.strictEqual(node.dependents.size, 0);
    });

    it('should handle multiple independent tasks', () => {
      const tasks: Task[] = [
        { id: 'task1', tool: 'tool1', params: {} },
        { id: 'task2', tool: 'tool2', params: {} },
        { id: 'task3', tool: 'tool3', params: {} }
      ];
      
      const graph = buildDAG(tasks);
      
      assert.strictEqual(graph.size, 3);
      
      for (const task of tasks) {
        const node = graph.get(task.id)!;
        assert.strictEqual(node.dependencies.size, 0);
        assert.strictEqual(node.dependents.size, 0);
      }
    });

    it('should build simple chain (A → B → C)', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['B'] }
      ];
      
      const graph = buildDAG(tasks);
      
      assert.strictEqual(graph.size, 3);
      
      const nodeA = graph.get('A')!;
      assert.strictEqual(nodeA.dependencies.size, 0);
      assert.ok(nodeA.dependents.has('B'));
      assert.strictEqual(nodeA.dependents.size, 1);
      
      const nodeB = graph.get('B')!;
      assert.ok(nodeB.dependencies.has('A'));
      assert.strictEqual(nodeB.dependencies.size, 1);
      assert.ok(nodeB.dependents.has('C'));
      assert.strictEqual(nodeB.dependents.size, 1);
      
      const nodeC = graph.get('C')!;
      assert.ok(nodeC.dependencies.has('B'));
      assert.strictEqual(nodeC.dependencies.size, 1);
      assert.strictEqual(nodeC.dependents.size, 0);
    });

    it('should build diamond pattern (A → B,C → D)', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'D', tool: 'tool', params: {}, dependsOn: ['B', 'C'] }
      ];
      
      const graph = buildDAG(tasks);
      
      assert.strictEqual(graph.size, 4);
      
      const nodeA = graph.get('A')!;
      assert.strictEqual(nodeA.dependencies.size, 0);
      assert.ok(nodeA.dependents.has('B'));
      assert.ok(nodeA.dependents.has('C'));
      assert.strictEqual(nodeA.dependents.size, 2);
      
      const nodeB = graph.get('B')!;
      assert.ok(nodeB.dependencies.has('A'));
      assert.ok(nodeB.dependents.has('D'));
      
      const nodeC = graph.get('C')!;
      assert.ok(nodeC.dependencies.has('A'));
      assert.ok(nodeC.dependents.has('D'));
      
      const nodeD = graph.get('D')!;
      assert.ok(nodeD.dependencies.has('B'));
      assert.ok(nodeD.dependencies.has('C'));
      assert.strictEqual(nodeD.dependencies.size, 2);
      assert.strictEqual(nodeD.dependents.size, 0);
    });

    it('should throw on missing dependency', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['NonExistent'] }
      ];
      
      assert.throws(() => buildDAG(tasks), MissingDependencyError);
      assert.throws(() => buildDAG(tasks), /Task A depends on non-existent task NonExistent/);
    });

    it('should throw on duplicate task IDs', () => {
      const tasks: Task[] = [
        { id: 'duplicate', tool: 'tool1', params: {} },
        { id: 'duplicate', tool: 'tool2', params: {} }
      ];
      
      assert.throws(() => buildDAG(tasks), /Duplicate task ID: duplicate/);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should return null for acyclic graph', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['B'] }
      ];
      
      const graph = buildDAG(tasks);
      const cycle = detectCircularDependencies(graph);
      
      assert.strictEqual(cycle, null);
    });

    it('should detect simple cycle (A → B → A)', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['B'] },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] }
      ];
      
      const graph = buildDAG(tasks);
      const cycle = detectCircularDependencies(graph);
      
      assert.notStrictEqual(cycle, null);
      assert.ok(cycle!.includes('A'));
      assert.ok(cycle!.includes('B'));
      // Cycle should start and end with same node
      assert.strictEqual(cycle![0], cycle![cycle!.length - 1]);
    });

    it('should detect longer cycle (A → B → C → A)', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['C'] },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['B'] }
      ];
      
      const graph = buildDAG(tasks);
      const cycle = detectCircularDependencies(graph);
      
      assert.notStrictEqual(cycle, null);
      assert.strictEqual(cycle!.length, 4); // A → B → C → A
      assert.strictEqual(cycle![0], cycle![3]); // Starts and ends with same node
    });

    it('should detect self-loop', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['A'] }
      ];
      
      const graph = buildDAG(tasks);
      const cycle = detectCircularDependencies(graph);
      
      assert.notStrictEqual(cycle, null);
      assert.deepStrictEqual(cycle, ['A', 'A']);
    });

    it('should handle disconnected components', () => {
      // Two separate acyclic graphs
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'X', tool: 'tool', params: {} },
        { id: 'Y', tool: 'tool', params: {}, dependsOn: ['X'] }
      ];
      
      const graph = buildDAG(tasks);
      const cycle = detectCircularDependencies(graph);
      
      assert.strictEqual(cycle, null);
    });
  });

  describe('topologicalSort', () => {
    it('should handle empty graph', () => {
      const graph = buildDAG([]);
      const levels = topologicalSort(graph);
      
      assert.deepStrictEqual(levels, []);
    });

    it('should handle single task', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} }
      ];
      
      const graph = buildDAG(tasks);
      const levels = topologicalSort(graph);
      
      assert.deepStrictEqual(levels, [['A']]);
    });

    it('should handle independent tasks (all in level 0)', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {} },
        { id: 'C', tool: 'tool', params: {} }
      ];
      
      const graph = buildDAG(tasks);
      const levels = topologicalSort(graph);
      
      assert.strictEqual(levels.length, 1);
      assert.strictEqual(levels[0].length, 3);
      assert.ok(levels[0].includes('A'));
      assert.ok(levels[0].includes('B'));
      assert.ok(levels[0].includes('C'));
    });

    it('should sort simple chain correctly', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['B'] }
      ];
      
      const graph = buildDAG(tasks);
      const levels = topologicalSort(graph);
      
      assert.deepStrictEqual(levels, [
        ['A'],
        ['B'],
        ['C']
      ]);
    });

    it('should sort diamond pattern correctly', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'D', tool: 'tool', params: {}, dependsOn: ['B', 'C'] }
      ];
      
      const graph = buildDAG(tasks);
      const levels = topologicalSort(graph);
      
      assert.strictEqual(levels.length, 3);
      assert.deepStrictEqual(levels[0], ['A']);
      assert.strictEqual(levels[1].length, 2);
      assert.ok(levels[1].includes('B'));
      assert.ok(levels[1].includes('C'));
      assert.deepStrictEqual(levels[2], ['D']);
    });

    it('should handle complex graph', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {} },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A', 'B'] },
        { id: 'D', tool: 'tool', params: {}, dependsOn: ['B'] },
        { id: 'E', tool: 'tool', params: {}, dependsOn: ['C', 'D'] }
      ];
      
      const graph = buildDAG(tasks);
      const levels = topologicalSort(graph);
      
      assert.strictEqual(levels.length, 3);
      assert.strictEqual(levels[0].length, 2);
      assert.ok(levels[0].includes('A'));
      assert.ok(levels[0].includes('B'));
      assert.strictEqual(levels[1].length, 2);
      assert.ok(levels[1].includes('C'));
      assert.ok(levels[1].includes('D'));
      assert.deepStrictEqual(levels[2], ['E']);
    });

    it('should set level property on nodes', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['B'] }
      ];
      
      const graph = buildDAG(tasks);
      topologicalSort(graph);
      
      assert.strictEqual(graph.get('A')!.level, 0);
      assert.strictEqual(graph.get('B')!.level, 1);
      assert.strictEqual(graph.get('C')!.level, 2);
    });
  });

  describe('validateAndBuildDAG', () => {
    it('should successfully validate and build acyclic graph', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'D', tool: 'tool', params: {}, dependsOn: ['B', 'C'] }
      ];
      
      const result = validateAndBuildDAG(tasks);
      
      assert.strictEqual(result.graph.size, 4);
      assert.strictEqual(result.levels.length, 3);
    });

    it('should throw CircularDependencyError on cycle', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['B'] },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['C'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A'] }
      ];
      
      assert.throws(() => validateAndBuildDAG(tasks), CircularDependencyError);
      assert.throws(() => validateAndBuildDAG(tasks), /Circular dependency detected/);
    });

    it('should throw MissingDependencyError on invalid reference', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {}, dependsOn: ['NonExistent'] }
      ];
      
      assert.throws(() => validateAndBuildDAG(tasks), MissingDependencyError);
    });
  });

  describe('extractEdges', () => {
    it('should return empty array for graph with no dependencies', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {} }
      ];
      
      const graph = buildDAG(tasks);
      const edges = extractEdges(graph);
      
      assert.deepStrictEqual(edges, []);
    });

    it('should extract edges correctly', () => {
      const tasks: Task[] = [
        { id: 'A', tool: 'tool', params: {} },
        { id: 'B', tool: 'tool', params: {}, dependsOn: ['A'] },
        { id: 'C', tool: 'tool', params: {}, dependsOn: ['A', 'B'] }
      ];
      
      const graph = buildDAG(tasks);
      const edges = extractEdges(graph);
      
      assert.strictEqual(edges.length, 3);
      
      // Check edges exist
      const hasEdge = (from: string, to: string) => 
        edges.some(e => e.from === from && e.to === to);
      
      assert.ok(hasEdge('A', 'B'));
      assert.ok(hasEdge('A', 'C'));
      assert.ok(hasEdge('B', 'C'));
    });
  });
});
