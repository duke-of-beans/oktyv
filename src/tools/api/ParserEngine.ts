/**
 * API Engine - Parser Engine
 * 
 * Response parsing with support for multiple formats:
 * - JSON (default, with optional Zod schema validation)
 * - XML (via xml2js)
 * - HTML (via cheerio for extraction)
 * - Text/Plain
 * - Binary (Buffer)
 * 
 * Auto-detects format from Content-Type header.
 */

import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('parser-engine');

/**
 * Supported response formats
 */
export enum ResponseFormat {
  JSON = 'json',
  XML = 'xml',
  HTML = 'html',
  TEXT = 'text',
  BINARY = 'binary',
}

/**
 * Parser configuration
 */
export interface ParserConfig {
  format?: ResponseFormat;        // Override auto-detection
  schema?: z.ZodSchema;           // Optional Zod schema for validation
  xmlOptions?: any;               // Options for xml2js
  htmlSelectors?: Record<string, string>;  // Cheerio selectors for HTML extraction
}

/**
 * Parse result
 */
export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  format: ResponseFormat;
}

/**
 * Detect response format from Content-Type header
 */
export function detectFormat(contentType: string | undefined): ResponseFormat {
  if (!contentType) {
    return ResponseFormat.JSON;  // Default to JSON
  }
  
  const ct = contentType.toLowerCase();
  
  if (ct.includes('application/json') || ct.includes('text/json')) {
    return ResponseFormat.JSON;
  }
  
  if (ct.includes('application/xml') || ct.includes('text/xml')) {
    return ResponseFormat.XML;
  }
  
  if (ct.includes('text/html')) {
    return ResponseFormat.HTML;
  }
  
  if (ct.includes('text/plain') || ct.includes('text/')) {
    return ResponseFormat.TEXT;
  }
  
  // Binary formats
  if (ct.includes('application/octet-stream') ||
      ct.includes('image/') ||
      ct.includes('audio/') ||
      ct.includes('video/') ||
      ct.includes('application/pdf')) {
    return ResponseFormat.BINARY;
  }
  
  return ResponseFormat.JSON;  // Default fallback
}

/**
 * Parser Engine
 * 
 * Parses API responses based on Content-Type or explicit format.
 */
export class ParserEngine {
  /**
   * Parse response data
   * 
   * @param data - Response data (string or Buffer)
   * @param contentType - Content-Type header
   * @param config - Parser configuration
   * @returns ParseResult with parsed data or error
   */
  async parse<T = any>(
    data: any,
    contentType: string | undefined,
    config: ParserConfig = {}
  ): Promise<ParseResult<T>> {
    // Determine format
    const format = config.format || detectFormat(contentType);
    
    logger.debug('Parsing response', { format, contentType });
    
    try {
      let parsed: any;
      
      switch (format) {
        case ResponseFormat.JSON:
          parsed = await this.parseJSON(data);
          break;
          
        case ResponseFormat.XML:
          parsed = await this.parseXML(data, config.xmlOptions);
          break;
          
        case ResponseFormat.HTML:
          parsed = await this.parseHTML(data, config.htmlSelectors);
          break;
          
        case ResponseFormat.TEXT:
          parsed = this.parseText(data);
          break;
          
        case ResponseFormat.BINARY:
          parsed = this.parseBinary(data);
          break;
          
        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_FORMAT',
              message: `Unsupported response format: ${format}`,
            },
            format,
          };
      }
      
      // Optional schema validation
      if (config.schema) {
        try {
          parsed = config.schema.parse(parsed);
        } catch (error: any) {
          return {
            success: false,
            error: {
              code: 'SCHEMA_VALIDATION_FAILED',
              message: `Schema validation failed: ${error.message}`,
            },
            format,
          };
        }
      }
      
      return {
        success: true,
        data: parsed,
        format,
      };
    } catch (error: any) {
      logger.error('Parse error', { format, error: error.message });
      
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: `Failed to parse ${format}: ${error.message}`,
        },
        format,
      };
    }
  }
  
  /**
   * Parse JSON
   */
  private async parseJSON(data: any): Promise<any> {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    
    if (Buffer.isBuffer(data)) {
      return JSON.parse(data.toString('utf8'));
    }
    
    // Already parsed (axios auto-parses JSON)
    return data;
  }
  
  /**
   * Parse XML
   */
  private async parseXML(data: any, options: any = {}): Promise<any> {
    const xmlString = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    
    const defaultOptions = {
      explicitArray: false,  // Don't wrap single elements in arrays
      trim: true,            // Trim whitespace
      mergeAttrs: true,      // Merge attributes into parent object
    };
    
    return await parseStringPromise(xmlString, { ...defaultOptions, ...options });
  }
  
  /**
   * Parse HTML and extract data using selectors
   */
  private async parseHTML(
    data: any,
    selectors: Record<string, string> = {}
  ): Promise<any> {
    const htmlString = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const $ = cheerio.load(htmlString);
    
    // If no selectors provided, return full HTML
    if (Object.keys(selectors).length === 0) {
      return {
        html: htmlString,
        text: $.text(),
        title: $('title').text(),
      };
    }
    
    // Extract data using provided selectors
    const extracted: Record<string, any> = {};
    
    for (const [key, selector] of Object.entries(selectors)) {
      const elements = $(selector);
      
      if (elements.length === 0) {
        extracted[key] = null;
      } else if (elements.length === 1) {
        // Single element: return text
        extracted[key] = elements.text().trim();
      } else {
        // Multiple elements: return array
        extracted[key] = elements.map((_, el) => $(el).text().trim()).get();
      }
    }
    
    return extracted;
  }
  
  /**
   * Parse plain text
   */
  private parseText(data: any): string {
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }
    
    return String(data);
  }
  
  /**
   * Parse binary data
   */
  private parseBinary(data: any): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }
    
    // Convert to Buffer
    return Buffer.from(data);
  }
}
