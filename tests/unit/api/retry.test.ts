/**
 * RetryManager Tests
 * 
 * Tests for exponential backoff retry logic and circuit breaker.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { RetryManager, isRetryableError, calculateDelay, DEFAULT_RETRY_CONFIG } from '../../../src/tools/api/RetryManager.js';

describe('RetryManager', () => {
  describe('isRetryableError()', () => {
    it('should identify retryable HTTP status codes', () => {
      const retryable = [429, 500, 502, 503, 504];
      
      for (const status of retryable) {
        const error = { response: { status } };
        assert.strictEqual(isRetryableError(error), true, `${status} should be retryable`);
      }
    });
    
    it('should identify non-retryable HTTP status codes', () => {
      const nonRetryable = [400, 401, 403, 404, 422];
      
      for (const status of nonRetryable) {
        const error = { response: { status } };
        assert.strictEqual(isRetryableError(error), false, `${status} should not be retryable`);
      }
    });
    
    it('should identify retryable network errors', () => {
      const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'];
      
      for (const code of retryableCodes) {
        const error = { code };
        assert.strictEqual(isRetryableError(error), true, `${code} should be retryable`);
      }
    });
    
    it('should identify axios network errors as retryable', () => {
      const error = { isAxiosError: true };  // No response = network error
      assert.strictEqual(isRetryableError(error), true);
    });
  });
  
  describe('calculateDelay()', () => {
    it('should calculate exponential backoff', () => {
      const delays = [
        calculateDelay(0),  // 2^0 = 1x base (1000ms)
        calculateDelay(1),  // 2^1 = 2x base (2000ms)
        calculateDelay(2),  // 2^2 = 4x base (4000ms)
      ];
      
      // Should be approximately: 1000, 2000, 4000 (with jitter)
      assert.ok(delays[0] >= 1000 && delays[0] <= 1200, `Delay 0: ${delays[0]}`);
      assert.ok(delays[1] >= 2000 && delays[1] <= 2400, `Delay 1: ${delays[1]}`);
      assert.ok(delays[2] >= 4000 && delays[2] <= 4800, `Delay 2: ${delays[2]}`);
    });
    
    it('should cap delay at maxDelay', () => {
      const delay = calculateDelay(10);  // 2^10 = 1024x base = way over max
      assert.ok(delay <= 36000, `Delay should be capped: ${delay}`);  // maxDelay + jitter
    });
    
    it('should add jitter to prevent thundering herd', () => {
      const delays = Array.from({ length: 10 }, () => calculateDelay(2));
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      assert.ok(uniqueDelays.size > 1, 'Delays should have jitter variation');
    });
  });
  
  describe('executeWithRetry()', () => {
    it('should succeed on first try', async () => {
      const manager = new RetryManager();
      
      const fn = async () => 'success';
      const result = await manager.executeWithRetry(fn, 'test');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data, 'success');
      assert.strictEqual(result.attempts, 1);
      assert.strictEqual(result.totalDelay, 0);
    });
    
    it('should retry on retryable errors', async () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelay: 10 });
      
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('Server error');
          error.response = { status: 500 };
          throw error;
        }
        return 'success';
      };
      
      const result = await manager.executeWithRetry(fn, 'test');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data, 'success');
      assert.strictEqual(result.attempts, 3);
      assert.ok(result.totalDelay > 0, 'Should have delay from retries');
    });
    
    it('should fail immediately on non-retryable errors', async () => {
      const manager = new RetryManager();
      
      const fn = async () => {
        const error: any = new Error('Not found');
        error.response = { status: 404 };
        throw error;
      };
      
      const result = await manager.executeWithRetry(fn, 'test');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.attempts, 1);
      assert.strictEqual(result.totalDelay, 0);
    });
    
    it('should fail after max retries exceeded', async () => {
      const manager = new RetryManager({ maxRetries: 2, baseDelay: 10 });
      
      const fn = async () => {
        const error: any = new Error('Server error');
        error.response = { status: 500 };
        throw error;
      };
      
      const result = await manager.executeWithRetry(fn, 'test');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.attempts, 3);  // Initial + 2 retries
      assert.ok(result.totalDelay > 0);
    });
    
    it('should implement circuit breaker', async () => {
      const manager = new RetryManager({ maxRetries: 1, baseDelay: 10 });
      
      // Fail 5 times to open circuit breaker
      for (let i = 0; i < 5; i++) {
        const fn = async () => {
          const error: any = new Error('Bad request');
          error.response = { status: 400 };
          throw error;
        };
        
        await manager.executeWithRetry(fn, 'test-endpoint');
      }
      
      // Circuit should now be open
      const status = manager.getCircuitBreakerStatus('test-endpoint');
      assert.strictEqual(status.isOpen, true);
      assert.strictEqual(status.failures, 5);
      
      // Next request should fail fast
      const fn = async () => 'should not execute';
      const result = await manager.executeWithRetry(fn, 'test-endpoint');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.attempts, 0);  // Didn't even try
    });
    
    it('should reset circuit breaker on success', async () => {
      const manager = new RetryManager();
      
      // First request succeeds
      await manager.executeWithRetry(async () => 'success', 'test-endpoint');
      
      const status = manager.getCircuitBreakerStatus('test-endpoint');
      assert.strictEqual(status.failures, 0);
      assert.strictEqual(status.isOpen, false);
    });
  });
});
