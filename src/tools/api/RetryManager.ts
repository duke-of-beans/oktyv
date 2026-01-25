/**
 * API Engine - Retry Manager
 * 
 * Intelligent retry logic with exponential backoff and circuit breaker.
 * 
 * Features:
 * - Exponential backoff: delay = base * (2 ^ attempt) + jitter
 * - Retry only on retryable errors (5xx, network errors, rate limits)
 * - Circuit breaker pattern (fail fast after consecutive failures)
 * - Configurable max retries and backoff parameters
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('retry-manager');

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;         // Maximum number of retry attempts (default: 3)
  baseDelay: number;          // Base delay in ms (default: 1000)
  maxDelay: number;           // Maximum delay in ms (default: 30000)
  jitterFactor: number;       // Jitter factor 0-1 (default: 0.2)
  retryableStatusCodes: number[];  // HTTP status codes to retry
  retryableErrors: string[];  // Error codes/types to retry
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,        // 1 second
  maxDelay: 30000,        // 30 seconds
  jitterFactor: 0.2,      // 20% jitter
  retryableStatusCodes: [
    429,  // Too Many Requests
    500,  // Internal Server Error
    502,  // Bad Gateway
    503,  // Service Unavailable
    504,  // Gateway Timeout
  ],
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
  ],
};

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(
  error: any,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  // HTTP status code errors
  if (error.response?.status) {
    return config.retryableStatusCodes.includes(error.response.status);
  }
  
  // Network errors
  if (error.code) {
    return config.retryableErrors.includes(error.code);
  }
  
  // Axios errors
  if (error.isAxiosError) {
    // Network errors without response
    if (!error.response) {
      return true;
    }
    
    // Check status code
    return config.retryableStatusCodes.includes(error.response.status);
  }
  
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * 
 * Formula: delay = min(baseDelay * (2 ^ attempt), maxDelay) + jitter
 * Jitter: random value between 0 and (delay * jitterFactor)
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = Math.random() * jitterRange;
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry Manager
 * 
 * Manages retry logic with exponential backoff and circuit breaker.
 */
export class RetryManager {
  private config: RetryConfig;
  private circuitBreakerFailures: Map<string, number>;  // Track consecutive failures per endpoint
  private circuitBreakerThreshold: number;
  
  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.circuitBreakerFailures = new Map();
    this.circuitBreakerThreshold = 5;  // Open circuit after 5 consecutive failures
  }
  
  /**
   * Execute function with retry logic
   * 
   * @param fn - Async function to execute
   * @param context - Context string for logging (e.g., "GET /api/users")
   * @returns RetryResult with success/failure and data
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: string = 'operation'
  ): Promise<RetryResult<T>> {
    let attempts = 0;
    let totalDelay = 0;
    let lastError: Error | undefined;
    
    // Check circuit breaker
    const failures = this.circuitBreakerFailures.get(context) || 0;
    if (failures >= this.circuitBreakerThreshold) {
      logger.warn('Circuit breaker open, failing fast', { context, failures });
      return {
        success: false,
        error: new Error(`Circuit breaker open for ${context} after ${failures} failures`),
        attempts: 0,
        totalDelay: 0,
      };
    }
    
    while (attempts <= this.config.maxRetries) {
      try {
        const data = await fn();
        
        // Success! Reset circuit breaker
        this.circuitBreakerFailures.set(context, 0);
        
        if (attempts > 0) {
          logger.info('Operation succeeded after retries', {
            context,
            attempts,
            totalDelay,
          });
        }
        
        return {
          success: true,
          data,
          attempts: attempts + 1,
          totalDelay,
        };
      } catch (error: any) {
        lastError = error;
        attempts++;
        
        // Check if error is retryable
        if (!isRetryableError(error, this.config)) {
          logger.info('Non-retryable error, failing immediately', {
            context,
            error: error.message,
            code: error.code || error.response?.status,
          });
          
          // Increment circuit breaker failures
          this.circuitBreakerFailures.set(context, failures + 1);
          
          return {
            success: false,
            error: lastError,
            attempts,
            totalDelay,
          };
        }
        
        // Max retries reached
        if (attempts > this.config.maxRetries) {
          logger.error('Max retries exceeded', {
            context,
            attempts,
            totalDelay,
            error: error.message,
          });
          
          // Increment circuit breaker failures
          this.circuitBreakerFailures.set(context, failures + 1);
          
          return {
            success: false,
            error: lastError,
            attempts,
            totalDelay,
          };
        }
        
        // Calculate delay for next attempt
        const delay = calculateDelay(attempts - 1, this.config);
        totalDelay += delay;
        
        logger.warn('Retryable error, retrying', {
          context,
          attempt: attempts,
          maxRetries: this.config.maxRetries,
          delay,
          error: error.message,
          code: error.code || error.response?.status,
        });
        
        // Wait before retrying
        await sleep(delay);
      }
    }
    
    // This should never be reached, but TypeScript needs it
    return {
      success: false,
      error: lastError,
      attempts,
      totalDelay,
    };
  }
  
  /**
   * Reset circuit breaker for a context
   */
  resetCircuitBreaker(context: string): void {
    this.circuitBreakerFailures.set(context, 0);
    logger.info('Circuit breaker reset', { context });
  }
  
  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(context: string): { isOpen: boolean; failures: number } {
    const failures = this.circuitBreakerFailures.get(context) || 0;
    return {
      isOpen: failures >= this.circuitBreakerThreshold,
      failures,
    };
  }
}
