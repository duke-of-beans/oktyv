/**
 * MCP Tool Parameter Validation Tests
 * Tests parameter validation for all MCP tools
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock tool schemas from server.ts
const TOOL_SCHEMAS = {
  linkedin_search_jobs: {
    name: 'linkedin_search_jobs',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'string' },
        location: { type: 'string' },
        remote: { type: 'boolean' },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  linkedin_get_job: {
    name: 'linkedin_get_job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        includeCompany: { type: 'boolean' },
      },
      required: ['jobId'],
    },
  },
  linkedin_get_company: {
    name: 'linkedin_get_company',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string' },
      },
      required: ['companyId'],
    },
  },
  indeed_search_jobs: {
    name: 'indeed_search_jobs',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'string' },
        location: { type: 'string' },
        remote: { type: 'boolean' },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  indeed_get_job: {
    name: 'indeed_get_job',
    inputSchema: {
      type: 'object',
      properties: {
        jobKey: { type: 'string' },
        includeCompany: { type: 'boolean' },
      },
      required: ['jobKey'],
    },
  },
  indeed_get_company: {
    name: 'indeed_get_company',
    inputSchema: {
      type: 'object',
      properties: {
        companyName: { type: 'string' },
      },
      required: ['companyName'],
    },
  },
  wellfound_search_jobs: {
    name: 'wellfound_search_jobs',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'string' },
        location: { type: 'string' },
        remote: { type: 'boolean' },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: [],
    },
  },
  wellfound_get_job: {
    name: 'wellfound_get_job',
    inputSchema: {
      type: 'object',
      properties: {
        jobSlug: { type: 'string' },
        includeCompany: { type: 'boolean' },
      },
      required: ['jobSlug'],
    },
  },
  wellfound_get_company: {
    name: 'wellfound_get_company',
    inputSchema: {
      type: 'object',
      properties: {
        companySlug: { type: 'string' },
      },
      required: ['companySlug'],
    },
  },
  browser_navigate: {
    name: 'browser_navigate',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitForSelector: { type: 'string' },
        timeout: { type: 'number', minimum: 1000, maximum: 120000 },
      },
      required: ['url'],
    },
  },
  browser_click: {
    name: 'browser_click',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        waitForNavigation: { type: 'boolean' },
        timeout: { type: 'number' },
      },
      required: ['selector'],
    },
  },
  browser_type: {
    name: 'browser_type',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        delay: { type: 'number' },
        clear: { type: 'boolean' },
      },
      required: ['selector', 'text'],
    },
  },
};

// Simple validator function (mimics JSON Schema validation)
function validateParams(schema: any, params: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check types
  for (const [key, value] of Object.entries(params)) {
    const propSchema = schema.properties[key];
    if (!propSchema) {
      errors.push(`Unknown field: ${key}`);
      continue;
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (propSchema.type !== actualType) {
      errors.push(`Field ${key}: expected ${propSchema.type}, got ${actualType}`);
    }

    // Check numeric constraints
    if (propSchema.type === 'number' && typeof value === 'number') {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push(`Field ${key}: value ${value} below minimum ${propSchema.minimum}`);
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push(`Field ${key}: value ${value} above maximum ${propSchema.maximum}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

describe('MCP Tool Parameter Validation', () => {
  describe('LinkedIn Tools', () => {
    describe('linkedin_search_jobs', () => {
      const schema = TOOL_SCHEMAS.linkedin_search_jobs.inputSchema;

      it('should accept valid parameters', () => {
        const params = {
          keywords: 'software engineer',
          location: 'San Francisco',
          remote: true,
          limit: 20,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });

      it('should accept minimal parameters (all optional)', () => {
        const params = {};
        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });

      it('should reject invalid types', () => {
        const params = {
          keywords: 123, // should be string
          limit: 'ten', // should be number
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0);
      });

      it('should enforce limit constraints', () => {
        const params1 = { limit: 0 }; // below minimum
        const params2 = { limit: 100 }; // above maximum

        const result1 = validateParams(schema, params1);
        const result2 = validateParams(schema, params2);

        assert.equal(result1.valid, false);
        assert.equal(result2.valid, false);
      });
    });

    describe('linkedin_get_job', () => {
      const schema = TOOL_SCHEMAS.linkedin_get_job.inputSchema;

      it('should require jobId', () => {
        const params = { includeCompany: true };
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('jobId')));
      });

      it('should accept valid parameters', () => {
        const params = {
          jobId: '12345',
          includeCompany: false,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });

    describe('linkedin_get_company', () => {
      const schema = TOOL_SCHEMAS.linkedin_get_company.inputSchema;

      it('should require companyId', () => {
        const params = {};
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('companyId')));
      });

      it('should accept valid companyId', () => {
        const params = { companyId: 'anthropic' };
        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });
  });

  describe('Indeed Tools', () => {
    describe('indeed_search_jobs', () => {
      const schema = TOOL_SCHEMAS.indeed_search_jobs.inputSchema;

      it('should accept valid parameters', () => {
        const params = {
          keywords: 'data scientist',
          location: 'New York',
          remote: false,
          limit: 15,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });

      it('should accept empty parameters', () => {
        const params = {};
        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });

    describe('indeed_get_job', () => {
      const schema = TOOL_SCHEMAS.indeed_get_job.inputSchema;

      it('should require jobKey', () => {
        const params = {};
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('jobKey')));
      });

      it('should accept valid parameters', () => {
        const params = {
          jobKey: 'abc123xyz',
          includeCompany: true,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });

    describe('indeed_get_company', () => {
      const schema = TOOL_SCHEMAS.indeed_get_company.inputSchema;

      it('should require companyName', () => {
        const params = {};
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('companyName')));
      });
    });
  });

  describe('Wellfound Tools', () => {
    describe('wellfound_search_jobs', () => {
      const schema = TOOL_SCHEMAS.wellfound_search_jobs.inputSchema;

      it('should accept valid parameters', () => {
        const params = {
          keywords: 'frontend engineer',
          location: 'Remote',
          remote: true,
          limit: 25,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });

    describe('wellfound_get_job', () => {
      const schema = TOOL_SCHEMAS.wellfound_get_job.inputSchema;

      it('should require jobSlug', () => {
        const params = { includeCompany: false };
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('jobSlug')));
      });
    });

    describe('wellfound_get_company', () => {
      const schema = TOOL_SCHEMAS.wellfound_get_company.inputSchema;

      it('should require companySlug', () => {
        const params = {};
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('companySlug')));
      });
    });
  });

  describe('Generic Browser Tools', () => {
    describe('browser_navigate', () => {
      const schema = TOOL_SCHEMAS.browser_navigate.inputSchema;

      it('should require url', () => {
        const params = { timeout: 5000 };
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('url')));
      });

      it('should accept valid parameters', () => {
        const params = {
          url: 'https://example.com',
          waitForSelector: '.content',
          timeout: 30000,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });

      it('should enforce timeout constraints', () => {
        const params1 = { url: 'https://example.com', timeout: 500 }; // too low
        const params2 = { url: 'https://example.com', timeout: 200000 }; // too high

        const result1 = validateParams(schema, params1);
        const result2 = validateParams(schema, params2);

        assert.equal(result1.valid, false);
        assert.equal(result2.valid, false);
      });
    });

    describe('browser_click', () => {
      const schema = TOOL_SCHEMAS.browser_click.inputSchema;

      it('should require selector', () => {
        const params = { waitForNavigation: true };
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('selector')));
      });

      it('should accept valid parameters', () => {
        const params = {
          selector: 'button.submit',
          waitForNavigation: false,
          timeout: 10000,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });

    describe('browser_type', () => {
      const schema = TOOL_SCHEMAS.browser_type.inputSchema;

      it('should require selector and text', () => {
        const params = { delay: 100 };
        const result = validateParams(schema, params);
        
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e: string) => e.includes('selector')));
        assert.ok(result.errors.some((e: string) => e.includes('text')));
      });

      it('should accept valid parameters', () => {
        const params = {
          selector: 'input[name="email"]',
          text: 'user@example.com',
          delay: 50,
          clear: true,
        };

        const result = validateParams(schema, params);
        assert.equal(result.valid, true);
      });
    });
  });
});
