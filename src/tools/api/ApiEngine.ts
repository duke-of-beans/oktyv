/**
 * API Engine - Main Orchestrator
 * 
 * High-level API for making HTTP requests with:
 * - Automatic retry and rate limiting
 * - Response parsing (JSON, XML, HTML, etc.)
 * - Pagination support
 * - OAuth 2.0 authentication
 * 
 * This is the main entry point for the API Engine.
 */

import { HttpClient, HttpResponse, HttpRequestConfig } from './HttpClient.js';
import { RateLimitManager } from './RateLimitManager.js';
import { PaginationHandler, PaginationConfig, PaginationResult } from './PaginationHandler.js';
import { OAuthManager } from './OAuthManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('api-engine');

/**
 * API request options
 */
export interface ApiRequestOptions extends HttpRequestConfig {
  // Rate limiting
  rateLimitKey?: string;        // Unique key for rate limiting
  rateLimitApi?: string;        // API identifier for global rate limiting
  
  // Pagination
  pagination?: PaginationConfig;
  
  // OAuth
  oauth?: {
    provider: string;
    userId: string;
    clientId: string;
    clientSecret: string;
  };
}

/**
 * API Engine
 * 
 * Main orchestrator for API requests with retry, rate limiting,
 * pagination, and OAuth support.
 */
export class ApiEngine {
  private httpClient: HttpClient;
  private rateLimitManager: RateLimitManager;
  private paginationHandler: PaginationHandler;
  private oauthManager: OAuthManager;
  
  constructor(
    getVault: (name: string, key: string) => Promise<string>,
    setVault: (name: string, key: string, value: string) => Promise<void>
  ) {
    this.httpClient = new HttpClient();
    this.rateLimitManager = new RateLimitManager();
    this.paginationHandler = new PaginationHandler(this.httpClient);
    this.oauthManager = new OAuthManager(getVault, setVault);
    
    logger.info('API Engine initialized');
  }
  
  /**
   * Make API request
   * 
   * @param url - Request URL
   * @param options - Request options
   * @returns HTTP response or paginated result
   */
  async request<T = any>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<HttpResponse<T> | PaginationResult<T>> {
    // Extract API Engine specific options
    const {
      rateLimitKey,
      rateLimitApi,
      pagination,
      oauth,
      ...httpOptions
    } = options;
    
    // Handle OAuth authentication
    if (oauth) {
      const accessToken = await this.oauthManager.getValidAccessToken(
        oauth.provider,
        oauth.userId,
        oauth.clientId,
        oauth.clientSecret
      );
      
      // Add authorization header
      httpOptions.headers = {
        ...httpOptions.headers,
        Authorization: `Bearer ${accessToken}`,
      };
    }
    
    // Handle rate limiting
    if (rateLimitKey) {
      await this.rateLimitManager.waitAndConsume(rateLimitKey, rateLimitApi);
    }
    
    // Handle pagination
    if (pagination?.autoPaginate) {
      return await this.paginationHandler.paginate<T>(url, httpOptions, pagination);
    }
    
    // Make single request
    const method = httpOptions.method || 'GET';
    
    switch (method.toUpperCase()) {
      case 'GET':
        return await this.httpClient.get<T>(url, httpOptions);
      case 'POST':
        return await this.httpClient.post<T>(url, httpOptions.data, httpOptions);
      case 'PUT':
        return await this.httpClient.put<T>(url, httpOptions.data, httpOptions);
      case 'PATCH':
        return await this.httpClient.patch<T>(url, httpOptions.data, httpOptions);
      case 'DELETE':
        return await this.httpClient.delete<T>(url, httpOptions);
      default:
        return await this.httpClient.request<T>({ ...httpOptions, url, method });
    }
  }
  
  /**
   * GET request
   */
  async get<T = any>(url: string, options: ApiRequestOptions = {}): Promise<HttpResponse<T> | PaginationResult<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }
  
  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    options: ApiRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'POST', data }) as Promise<HttpResponse<T>>;
  }
  
  /**
   * PUT request
   */
  async put<T = any>(
    url: string,
    data?: any,
    options: ApiRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PUT', data }) as Promise<HttpResponse<T>>;
  }
  
  /**
   * PATCH request
   */
  async patch<T = any>(
    url: string,
    data?: any,
    options: ApiRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'PATCH', data }) as Promise<HttpResponse<T>>;
  }
  
  /**
   * DELETE request
   */
  async delete<T = any>(url: string, options: ApiRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' }) as Promise<HttpResponse<T>>;
  }
  
  /**
   * Get OAuth manager (for OAuth operations)
   */
  getOAuthManager(): OAuthManager {
    return this.oauthManager;
  }
  
  /**
   * Get rate limit manager (for manual rate limit control)
   */
  getRateLimitManager(): RateLimitManager {
    return this.rateLimitManager;
  }
  
  /**
   * Get HTTP client (for low-level requests)
   */
  getHttpClient(): HttpClient {
    return this.httpClient;
  }
}
