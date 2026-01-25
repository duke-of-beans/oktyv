/**
 * RateLimitManager Tests
 * 
 * Tests for token bucket rate limiting.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { RateLimitManager } from '../../../src/tools/api/RateLimitManager.js';

describe('RateLimitManager', () => {
  describe('Endpoint rate limiting', () => {
    it('should allow requests within limit', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 10, window: 60 });
      
      // Should allow first request
      const allowed = manager.isAllowed('test-endpoint');
      assert.strictEqual(allowed, true);
    });
    
    it('should consume tokens', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 2, window: 60 });
      
      // Consume 2 tokens
      await manager.waitAndConsume('test-endpoint');
      await manager.waitAndConsume('test-endpoint');
      
      // Should be at limit now
      const allowed = manager.isAllowed('test-endpoint');
      assert.strictEqual(allowed, false);
    });
    
    it('should refill tokens over time', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 10, window: 1 });  // 10 req/second
      
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await manager.waitAndConsume('test-endpoint');
      }
      
      // Should be at limit
      assert.strictEqual(manager.isAllowed('test-endpoint'), false);
      
      // Wait 200ms (should refill ~2 tokens at 10/second rate)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should have some tokens available now
      assert.strictEqual(manager.isAllowed('test-endpoint'), true);
    });
    
    it('should wait when rate limited', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 1, window: 1 });
      
      // Consume first token immediately
      const start = Date.now();
      await manager.waitAndConsume('test-endpoint');
      
      // Second request should wait ~1 second
      await manager.waitAndConsume('test-endpoint');
      const elapsed = Date.now() - start;
      
      assert.ok(elapsed >= 900, `Should wait ~1s, but waited ${elapsed}ms`);
    });
  });
  
  describe('Global rate limiting', () => {
    it('should enforce global limits', async () => {
      const manager = new RateLimitManager();
      manager.setGlobalLimit('test-api', { requests: 5, window: 60 });
      
      // Multiple endpoints share global limit
      await manager.waitAndConsume('endpoint-1', 'test-api');
      await manager.waitAndConsume('endpoint-2', 'test-api');
      await manager.waitAndConsume('endpoint-3', 'test-api');
      await manager.waitAndConsume('endpoint-4', 'test-api');
      await manager.waitAndConsume('endpoint-5', 'test-api');
      
      // Global limit reached
      const allowed = manager.isAllowed('endpoint-6', 'test-api');
      assert.strictEqual(allowed, false);
    });
    
    it('should respect both endpoint and global limits', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('endpoint-1', { requests: 10, window: 60 });
      manager.setGlobalLimit('test-api', { requests: 3, window: 60 });
      
      // Can make 3 requests (global limit)
      await manager.waitAndConsume('endpoint-1', 'test-api');
      await manager.waitAndConsume('endpoint-1', 'test-api');
      await manager.waitAndConsume('endpoint-1', 'test-api');
      
      // 4th request blocked by global limit
      const allowed = manager.isAllowed('endpoint-1', 'test-api');
      assert.strictEqual(allowed, false);
    });
  });
  
  describe('Header parsing', () => {
    it('should update limits from X-RateLimit headers', () => {
      const manager = new RateLimitManager();
      
      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      };
      
      manager.updateFromHeaders('github-api', headers);
      
      // Should have created rate limit
      const allowed = manager.isAllowed('github-api');
      assert.strictEqual(allowed, true);
    });
    
    it('should handle Retry-After header', () => {
      const manager = new RateLimitManager();
      
      const headers = {
        'retry-after': '60',
      };
      
      manager.updateFromHeaders('rate-limited-endpoint', headers);
      
      // Should have created restrictive limit
      const status = manager.getStatus('rate-limited-endpoint');
      assert.ok(status.endpoint);
    });
  });
  
  describe('Status and reset', () => {
    it('should report current status', () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 10, window: 60 });
      manager.setGlobalLimit('test-api', { requests: 100, window: 60 });
      
      const status = manager.getStatus('test-endpoint', 'test-api');
      
      assert.ok(status.endpoint);
      assert.strictEqual(status.endpoint.limit, 10);
      assert.ok(status.global);
      assert.strictEqual(status.global.limit, 100);
    });
    
    it('should reset endpoint limit', async () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('test-endpoint', { requests: 1, window: 60 });
      
      // Consume token
      await manager.waitAndConsume('test-endpoint');
      assert.strictEqual(manager.isAllowed('test-endpoint'), false);
      
      // Reset
      manager.reset('test-endpoint');
      
      // Should be available again
      assert.strictEqual(manager.isAllowed('test-endpoint'), true);
    });
    
    it('should clear all limits', () => {
      const manager = new RateLimitManager();
      manager.setEndpointLimit('endpoint-1', { requests: 10, window: 60 });
      manager.setEndpointLimit('endpoint-2', { requests: 20, window: 60 });
      manager.setGlobalLimit('api-1', { requests: 100, window: 60 });
      
      manager.clearAll();
      
      // All limits should be gone
      const status1 = manager.getStatus('endpoint-1');
      const status2 = manager.getStatus('endpoint-2');
      
      assert.strictEqual(status1.endpoint, undefined);
      assert.strictEqual(status2.endpoint, undefined);
    });
  });
});
