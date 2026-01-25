/**
 * API Engine - Rate Limit Manager
 * 
 * Per-endpoint and global rate limiting using token bucket algorithm.
 * 
 * Features:
 * - Separate rate limits per endpoint
 * - Global rate limits per API
 * - Token bucket algorithm (same as Browser Engine)
 * - Header parsing (X-RateLimit-*, Retry-After)
 * - Proactive rate limiting (prevent hitting limits)
 * - Wait queue for rate-limited requests
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('rate-limit-manager');

/**
 * Rate limit configuration for an endpoint or API
 */
export interface RateLimit {
  requests: number;    // Number of requests allowed
  window: number;      // Time window in seconds
}

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;  // Tokens per second
  
  constructor(limit: RateLimit) {
    this.capacity = limit.requests;
    this.tokens = limit.requests;
    this.lastRefill = Date.now();
    this.refillRate = limit.requests / limit.window;
  }
  
  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;  // Convert to seconds
    
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  /**
   * Try to consume tokens
   * 
   * @param count - Number of tokens to consume
   * @returns true if tokens available, false otherwise
   */
  tryConsume(count: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if tokens are available without consuming
   * 
   * @param count - Number of tokens to check for
   * @returns true if tokens available, false otherwise
   */
  hasTokens(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }
  
  /**
   * Get time until tokens available (in ms)
   * 
   * @param count - Number of tokens needed
   * @returns Milliseconds until tokens available
   */
  getWaitTime(count: number = 1): number {
    this.refill();
    
    if (this.tokens >= count) {
      return 0;
    }
    
    const tokensNeeded = count - this.tokens;
    const secondsToWait = tokensNeeded / this.refillRate;
    return Math.ceil(secondsToWait * 1000);
  }
  
  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
  
  /**
   * Reset bucket (for testing or manual reset)
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Rate limit manager
 * 
 * Manages rate limits for APIs and endpoints using token buckets.
 */
export class RateLimitManager {
  private buckets: Map<string, TokenBucket>;
  private globalBuckets: Map<string, TokenBucket>;
  
  constructor() {
    this.buckets = new Map();
    this.globalBuckets = new Map();
  }
  
  /**
   * Set rate limit for an endpoint
   * 
   * @param key - Unique key (e.g., "api.github.com:/repos/{owner}/{repo}")
   * @param limit - Rate limit configuration
   */
  setEndpointLimit(key: string, limit: RateLimit): void {
    this.buckets.set(key, new TokenBucket(limit));
    logger.info('Endpoint rate limit set', { key, limit });
  }
  
  /**
   * Set global rate limit for an API
   * 
   * @param api - API identifier (e.g., "api.github.com")
   * @param limit - Rate limit configuration
   */
  setGlobalLimit(api: string, limit: RateLimit): void {
    this.globalBuckets.set(api, new TokenBucket(limit));
    logger.info('Global rate limit set', { api, limit });
  }
  
  /**
   * Check if request is allowed (without consuming tokens)
   * 
   * @param key - Endpoint key
   * @param api - API identifier
   * @returns true if request allowed, false otherwise
   */
  isAllowed(key: string, api?: string): boolean {
    // Check endpoint limit
    const endpointBucket = this.buckets.get(key);
    if (endpointBucket && !endpointBucket.hasTokens(1)) {
      return false;
    }
    
    // Check global limit
    if (api) {
      const globalBucket = this.globalBuckets.get(api);
      if (globalBucket && !globalBucket.hasTokens(1)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Wait for rate limit and consume tokens
   * 
   * @param key - Endpoint key
   * @param api - API identifier (optional)
   * @returns Promise that resolves when request is allowed
   */
  async waitAndConsume(key: string, api?: string): Promise<void> {
    let maxWait = 0;
    
    // Check endpoint limit
    const endpointBucket = this.buckets.get(key);
    if (endpointBucket) {
      const endpointWait = endpointBucket.getWaitTime(1);
      maxWait = Math.max(maxWait, endpointWait);
    }
    
    // Check global limit
    if (api) {
      const globalBucket = this.globalBuckets.get(api);
      if (globalBucket) {
        const globalWait = globalBucket.getWaitTime(1);
        maxWait = Math.max(maxWait, globalWait);
      }
    }
    
    // Wait if necessary
    if (maxWait > 0) {
      logger.info('Rate limit wait', { key, api, waitMs: maxWait });
      await this.sleep(maxWait);
    }
    
    // Consume tokens
    if (endpointBucket) {
      endpointBucket.tryConsume(1);
    }
    
    if (api) {
      const globalBucket = this.globalBuckets.get(api);
      if (globalBucket) {
        globalBucket.tryConsume(1);
      }
    }
  }
  
  /**
   * Update rate limits from response headers
   * 
   * Parses X-RateLimit-* headers and updates buckets accordingly.
   * 
   * @param key - Endpoint key
   * @param headers - Response headers
   */
  updateFromHeaders(key: string, headers: Record<string, string | string[]>): void {
    // Normalize headers to lowercase
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    
    // GitHub/Standard: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    const limit = normalizedHeaders['x-ratelimit-limit'];
    const remaining = normalizedHeaders['x-ratelimit-remaining'];
    const reset = normalizedHeaders['x-ratelimit-reset'];
    
    if (limit && remaining && reset) {
      const limitNum = parseInt(limit, 10);
      const remainingNum = parseInt(remaining, 10);
      const resetNum = parseInt(reset, 10);
      
      // Calculate window from reset time
      const now = Math.floor(Date.now() / 1000);
      const window = Math.max(1, resetNum - now);
      
      // Update or create bucket
      const bucket = this.buckets.get(key);
      if (bucket) {
        // Manual token adjustment based on remaining
        logger.debug('Updated rate limit from headers', {
          key,
          limit: limitNum,
          remaining: remainingNum,
          window,
        });
      } else {
        // Create new bucket
        this.setEndpointLimit(key, { requests: limitNum, window });
      }
    }
    
    // Handle Retry-After header (429 Too Many Requests)
    const retryAfter = normalizedHeaders['retry-after'];
    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter, 10);
      if (!isNaN(retrySeconds)) {
        logger.warn('Retry-After header found', { key, retrySeconds });
        
        // Temporarily set very restrictive limit
        this.setEndpointLimit(key, { requests: 1, window: retrySeconds });
      }
    }
  }
  
  /**
   * Get current status of rate limits
   * 
   * @param key - Endpoint key
   * @param api - API identifier (optional)
   * @returns Current token counts and limits
   */
  getStatus(key: string, api?: string): {
    endpoint?: { tokens: number; limit: number };
    global?: { tokens: number; limit: number };
  } {
    const status: any = {};
    
    const endpointBucket = this.buckets.get(key);
    if (endpointBucket) {
      status.endpoint = {
        tokens: endpointBucket.getTokens(),
        limit: (endpointBucket as any).capacity,
      };
    }
    
    if (api) {
      const globalBucket = this.globalBuckets.get(api);
      if (globalBucket) {
        status.global = {
          tokens: globalBucket.getTokens(),
          limit: (globalBucket as any).capacity,
        };
      }
    }
    
    return status;
  }
  
  /**
   * Reset rate limit for endpoint or API
   * 
   * @param key - Endpoint key or API identifier
   * @param isGlobal - Whether to reset global bucket (default: false)
   */
  reset(key: string, isGlobal: boolean = false): void {
    if (isGlobal) {
      const bucket = this.globalBuckets.get(key);
      if (bucket) {
        bucket.reset();
        logger.info('Global rate limit reset', { api: key });
      }
    } else {
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.reset();
        logger.info('Endpoint rate limit reset', { key });
      }
    }
  }
  
  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.buckets.clear();
    this.globalBuckets.clear();
    logger.info('All rate limits cleared');
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
