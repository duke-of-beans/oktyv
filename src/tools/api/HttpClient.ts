/**
 * API Engine - HTTP Client
 * 
 * Low-level HTTP client with axios integration.
 * 
 * Features:
 * - Request/response interceptors
 * - Automatic retry with exponential backoff
 * - Response parsing (JSON, XML, HTML, Text, Binary)
 * - Timeout configuration
 * - Custom headers and authentication
 * - Stream support
 * - Error normalization
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { RetryManager, RetryResult } from './RetryManager.js';
import { ParserEngine, ParserConfig, ResponseFormat } from './ParserEngine.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('http-client');

/**
 * HTTP request configuration
 */
export interface HttpRequestConfig extends AxiosRequestConfig {
  retryConfig?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelay?: number;
  };
  parserConfig?: ParserConfig;
  timeout?: number;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T = any> {
  success: boolean;
  data?: T;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  error?: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
  };
  metadata?: {
    attempts: number;
    totalDelay: number;
    format?: ResponseFormat;
  };
}

/**
 * HTTP Client
 * 
 * Wrapper around axios with retry logic and response parsing.
 */
export class HttpClient {
  private axiosInstance: AxiosInstance;
  private retryManager: RetryManager;
  private parserEngine: ParserEngine;
  
  constructor(baseConfig: AxiosRequestConfig = {}) {
    // Create axios instance
    this.axiosInstance = axios.create({
      timeout: 30000,  // 30 seconds default
      headers: {
        'User-Agent': 'Oktyv/0.3.0-alpha.1',
      },
      ...baseConfig,
    });
    
    // Initialize managers
    this.retryManager = new RetryManager();
    this.parserEngine = new ParserEngine();
    
    // Setup interceptors
    this.setupInterceptors();
  }
  
  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor (logging)
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('HTTP request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
        });
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor (logging)
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('HTTP response', {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers['content-type'],
        });
        return response;
      },
      (error) => {
        if (error.response) {
          logger.warn('HTTP error response', {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.config?.url,
          });
        } else {
          logger.error('HTTP request failed', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
          });
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Make HTTP request
   * 
   * @param config - Request configuration
   * @returns HttpResponse with parsed data or error
   */
  async request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const retryEnabled = config.retryConfig?.enabled !== false;
    
    // Context for logging
    const context = `${config.method?.toUpperCase() || 'GET'} ${config.url}`;
    
    // Define request function
    const makeRequest = async (): Promise<AxiosResponse> => {
      return await this.axiosInstance.request(config);
    };
    
    // Execute with or without retry
    let retryResult: RetryResult<AxiosResponse>;
    
    if (retryEnabled) {
      // Use retry manager
      if (config.retryConfig) {
        const retryManager = new RetryManager({
          maxRetries: config.retryConfig.maxRetries,
          baseDelay: config.retryConfig.baseDelay,
        });
        retryResult = await retryManager.executeWithRetry(makeRequest, context);
      } else {
        retryResult = await this.retryManager.executeWithRetry(makeRequest, context);
      }
    } else {
      // No retry, single attempt
      try {
        const response = await makeRequest();
        retryResult = {
          success: true,
          data: response,
          attempts: 1,
          totalDelay: 0,
        };
      } catch (error: any) {
        retryResult = {
          success: false,
          error,
          attempts: 1,
          totalDelay: 0,
        };
      }
    }
    
    // Handle failure
    if (!retryResult.success || !retryResult.data) {
      return this.normalizeError(retryResult.error!, retryResult.attempts, retryResult.totalDelay);
    }
    
    const response = retryResult.data;
    
    // Parse response
    const parseResult = await this.parserEngine.parse(
      response.data,
      response.headers['content-type'],
      config.parserConfig
    );
    
    // Return success response
    if (parseResult.success) {
      return {
        success: true,
        data: parseResult.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        metadata: {
          attempts: retryResult.attempts,
          totalDelay: retryResult.totalDelay,
          format: parseResult.format,
        },
      };
    }
    
    // Parse error
    return {
      success: false,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      error: {
        code: parseResult.error?.code || 'PARSE_ERROR',
        message: parseResult.error?.message || 'Failed to parse response',
        status: response.status,
        retryable: false,
      },
      metadata: {
        attempts: retryResult.attempts,
        totalDelay: retryResult.totalDelay,
        format: parseResult.format,
      },
    };
  }
  
  /**
   * Normalize axios error to HttpResponse
   */
  private normalizeError(error: any, attempts: number, totalDelay: number): HttpResponse {
    // Axios error with response
    if (error.response) {
      return {
        success: false,
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        error: {
          code: `HTTP_${error.response.status}`,
          message: error.response.data?.message || error.message,
          status: error.response.status,
          retryable: [429, 500, 502, 503, 504].includes(error.response.status),
        },
        metadata: {
          attempts,
          totalDelay,
        },
      };
    }
    
    // Network error
    if (error.code) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'].includes(error.code),
        },
        metadata: {
          attempts,
          totalDelay,
        },
      };
    }
    
    // Generic error
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        retryable: false,
      },
      metadata: {
        attempts,
        totalDelay,
      },
    };
  }
  
  /**
   * Convenience method: GET request
   */
  async get<T = any>(url: string, config: Omit<HttpRequestConfig, 'method' | 'url'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, ...config });
  }
  
  /**
   * Convenience method: POST request
   */
  async post<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'method' | 'url' | 'data'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', url, data, ...config });
  }
  
  /**
   * Convenience method: PUT request
   */
  async put<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'method' | 'url' | 'data'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', url, data, ...config });
  }
  
  /**
   * Convenience method: PATCH request
   */
  async patch<T = any>(url: string, data?: any, config: Omit<HttpRequestConfig, 'method' | 'url' | 'data'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, data, ...config });
  }
  
  /**
   * Convenience method: DELETE request
   */
  async delete<T = any>(url: string, config: Omit<HttpRequestConfig, 'method' | 'url'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, ...config });
  }
  
  /**
   * Set default header for all requests
   */
  setDefaultHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
  }
  
  /**
   * Remove default header
   */
  removeDefaultHeader(key: string): void {
    delete this.axiosInstance.defaults.headers.common[key];
  }
  
  /**
   * Set authorization header (Bearer token)
   */
  setBearerToken(token: string): void {
    this.setDefaultHeader('Authorization', `Bearer ${token}`);
  }
  
  /**
   * Clear authorization header
   */
  clearAuth(): void {
    this.removeDefaultHeader('Authorization');
  }
}
