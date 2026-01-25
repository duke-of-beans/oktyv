/**
 * API Engine - Pagination Handler
 * 
 * Automatic pagination detection and aggregation.
 * 
 * Supported pagination patterns:
 * 1. Cursor-based: { cursor: "next_page_token" }
 * 2. Offset/Limit: { offset: 0, limit: 100 }
 * 3. Page Number: { page: 1, per_page: 100 }
 * 4. Link Headers: Link: <url>; rel="next"
 * 
 * Features:
 * - Auto-detect pagination pattern from first response
 * - Fetch all pages or limit to max pages
 * - Aggregate results into single array
 * - Progress reporting for long paginations
 */

import { HttpClient, HttpResponse, HttpRequestConfig } from './HttpClient.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('pagination-handler');

/**
 * Pagination pattern types
 */
export enum PaginationPattern {
  CURSOR = 'cursor',
  OFFSET_LIMIT = 'offset_limit',
  PAGE_NUMBER = 'page_number',
  LINK_HEADER = 'link_header',
  NONE = 'none',
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  autoPaginate?: boolean;      // Automatically fetch all pages (default: false)
  maxPages?: number;           // Maximum pages to fetch (default: 10)
  dataPath?: string;           // JSONPath to array of results (e.g., "data.items")
  cursorPath?: string;         // JSONPath to next cursor (e.g., "pagination.next_cursor")
  pattern?: PaginationPattern; // Force specific pagination pattern
}

/**
 * Pagination result
 */
export interface PaginationResult<T = any> {
  data: T[];
  pages: number;
  hasMore: boolean;
  pattern: PaginationPattern;
  totalItems?: number;
}

/**
 * Detect pagination pattern from response
 */
function detectPattern(response: HttpResponse): PaginationPattern {
  const { data, headers } = response;
  
  // Check Link header (GitHub, many RESTful APIs)
  const linkHeader = (headers?.['link'] || headers?.['Link']) as string | undefined;
  if (linkHeader && linkHeader.includes('rel="next"')) {
    return PaginationPattern.LINK_HEADER;
  }
  
  // Check for cursor-based pagination
  if (
    data?.pagination?.next_cursor ||
    data?.next_cursor ||
    data?.cursor ||
    data?.nextPageToken ||
    data?.next_page_token
  ) {
    return PaginationPattern.CURSOR;
  }
  
  // Check for page number pagination
  if (
    (data?.pagination?.page !== undefined && data?.pagination?.total_pages !== undefined) ||
    (data?.page !== undefined && data?.total_pages !== undefined) ||
    (data?.current_page !== undefined) ||
    (data?.pageNumber !== undefined)
  ) {
    return PaginationPattern.PAGE_NUMBER;
  }
  
  // Check for offset/limit pagination
  if (
    (data?.pagination?.offset !== undefined && data?.pagination?.limit !== undefined) ||
    (data?.offset !== undefined && data?.limit !== undefined) ||
    (data?.skip !== undefined && data?.take !== undefined)
  ) {
    return PaginationPattern.OFFSET_LIMIT;
  }
  
  return PaginationPattern.NONE;
}

/**
 * Extract data array from response
 */
function extractData(response: HttpResponse, dataPath?: string): any[] {
  const { data } = response;
  
  if (!data) {
    return [];
  }
  
  // If dataPath specified, use it
  if (dataPath) {
    const parts = dataPath.split('.');
    let current = data;
    
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = current[part];
      } else {
        return [];
      }
    }
    
    return Array.isArray(current) ? current : [];
  }
  
  // Common patterns
  if (Array.isArray(data)) {
    return data;
  }
  
  if (Array.isArray(data.data)) {
    return data.data;
  }
  
  if (Array.isArray(data.items)) {
    return data.items;
  }
  
  if (Array.isArray(data.results)) {
    return data.results;
  }
  
  // If data is object with array values, return first array found
  if (typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  
  return [];
}

/**
 * Get next cursor from response
 */
function getNextCursor(response: HttpResponse, cursorPath?: string): string | null {
  const { data } = response;
  
  if (!data) {
    return null;
  }
  
  // If cursorPath specified, use it
  if (cursorPath) {
    const parts = cursorPath.split('.');
    let current = data;
    
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = current[part];
      } else {
        return null;
      }
    }
    
    return typeof current === 'string' ? current : null;
  }
  
  // Common patterns
  return (
    data.pagination?.next_cursor ||
    data.next_cursor ||
    data.cursor ||
    data.nextPageToken ||
    data.next_page_token ||
    null
  );
}

/**
 * Parse Link header for next URL
 */
function parseLinkHeader(linkHeader: string): string | null {
  const links = linkHeader.split(',');
  
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Pagination Handler
 * 
 * Handles automatic pagination across different API patterns.
 */
export class PaginationHandler {
  constructor(private httpClient: HttpClient) {}
  
  /**
   * Execute request with automatic pagination
   * 
   * @param url - Request URL
   * @param options - Request options
   * @param config - Pagination configuration
   * @returns Aggregated pagination result
   */
  async paginate<T = any>(
    url: string,
    options: HttpRequestConfig = {},
    config: PaginationConfig = {}
  ): Promise<PaginationResult<T>> {
    const {
      autoPaginate = false,
      maxPages = 10,
      dataPath,
      cursorPath,
      pattern: forcedPattern,
    } = config;
    
    const allData: T[] = [];
    let currentPage = 1;
    let hasMore = true;
    let detectedPattern: PaginationPattern | null = forcedPattern || null;
    
    // First request
    let response = await this.httpClient.get<any>(url, options);
    
    // Detect pagination pattern if not forced
    if (!detectedPattern) {
      detectedPattern = detectPattern(response);
      logger.info('Detected pagination pattern', { pattern: detectedPattern });
    }
    
    // Extract data from first page
    const firstPageData = extractData(response, dataPath);
    allData.push(...firstPageData);
    
    // If not auto-paginating or no pagination detected, return first page
    if (!autoPaginate || detectedPattern === PaginationPattern.NONE) {
      return {
        data: allData,
        pages: 1,
        hasMore: false,
        pattern: detectedPattern,
      };
    }
    
    // Continue paginating based on pattern
    while (hasMore && currentPage < maxPages) {
      let nextUrl: string | null = null;
      let nextOptions = { ...options };
      
      switch (detectedPattern) {
        case PaginationPattern.CURSOR:
          const cursor = getNextCursor(response, cursorPath);
          if (!cursor) {
            hasMore = false;
            break;
          }
          
          // Add cursor to params
          nextOptions.params = {
            ...options.params,
            cursor,
          };
          nextUrl = url;
          break;
          
        case PaginationPattern.OFFSET_LIMIT:
          const currentOffset = response.data?.offset || response.data?.pagination?.offset || 0;
          const limit = response.data?.limit || response.data?.pagination?.limit || 100;
          
          // Add offset to params
          nextOptions.params = {
            ...options.params,
            offset: currentOffset + limit,
            limit,
          };
          nextUrl = url;
          break;
          
        case PaginationPattern.PAGE_NUMBER:
          const currentPageNum = response.data?.page || response.data?.pagination?.page || 1;
          const totalPages = response.data?.total_pages || response.data?.pagination?.total_pages;
          
          if (totalPages && currentPageNum >= totalPages) {
            hasMore = false;
            break;
          }
          
          // Add page to params
          nextOptions.params = {
            ...options.params,
            page: currentPageNum + 1,
          };
          nextUrl = url;
          break;
          
        case PaginationPattern.LINK_HEADER:
          const linkHeader = (response.headers?.['link'] || response.headers?.['Link']) as string | undefined;
          if (!linkHeader) {
            hasMore = false;
            break;
          }
          
          const nextLink = parseLinkHeader(linkHeader);
          if (!nextLink) {
            hasMore = false;
            break;
          }
          
          nextUrl = nextLink;
          break;
          
        default:
          hasMore = false;
      }
      
      if (!hasMore || !nextUrl) {
        break;
      }
      
      // Fetch next page
      logger.debug('Fetching next page', { page: currentPage + 1, pattern: detectedPattern });
      
      response = await this.httpClient.get<any>(nextUrl, nextOptions);
      const pageData = extractData(response, dataPath);
      
      if (pageData.length === 0) {
        hasMore = false;
        break;
      }
      
      allData.push(...pageData);
      currentPage++;
    }
    
    logger.info('Pagination complete', {
      pattern: detectedPattern,
      pages: currentPage,
      totalItems: allData.length,
      hasMore,
    });
    
    return {
      data: allData,
      pages: currentPage,
      hasMore,
      pattern: detectedPattern,
      totalItems: allData.length,
    };
  }
}
