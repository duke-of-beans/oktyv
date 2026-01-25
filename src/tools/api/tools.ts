/**
 * API Engine - MCP Tools
 * 
 * Tool definitions and Zod schemas for MCP server integration.
 */

import { z } from 'zod';

/**
 * api_request tool
 * 
 * Make HTTP request to any API with automatic retry, rate limiting, and pagination.
 */
export const apiRequestSchema = z.object({
  url: z.string().url().describe('The URL to request'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .optional()
    .default('GET')
    .describe('HTTP method'),
  headers: z.record(z.string())
    .optional()
    .describe('HTTP headers'),
  params: z.record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Query parameters'),
  data: z.any()
    .optional()
    .describe('Request body data'),
  
  // Pagination
  autoPaginate: z.boolean()
    .optional()
    .default(false)
    .describe('Automatically fetch all pages'),
  maxPages: z.number()
    .optional()
    .default(10)
    .describe('Maximum pages to fetch (when autoPaginate=true)'),
  
  // Rate limiting
  rateLimitKey: z.string()
    .optional()
    .describe('Unique key for rate limiting (e.g., "api.github.com:/repos")'),
  
  // OAuth
  oauthProvider: z.string()
    .optional()
    .describe('OAuth provider name (google, github, stripe, slack)'),
  oauthUserId: z.string()
    .optional()
    .describe('User ID for OAuth token lookup'),
  oauthClientId: z.string()
    .optional()
    .describe('OAuth client ID'),
  oauthClientSecret: z.string()
    .optional()
    .describe('OAuth client secret'),
});

export const apiRequestTool = {
  name: 'api_request',
  description: 'Make HTTP request to any API with automatic retry, rate limiting, and pagination support',
  inputSchema: apiRequestSchema,
};

/**
 * api_oauth_init tool
 * 
 * Initialize OAuth flow by generating authorization URL.
 */
export const apiOAuthInitSchema = z.object({
  provider: z.enum(['google', 'github', 'stripe', 'slack'])
    .describe('OAuth provider'),
  clientId: z.string()
    .describe('OAuth client ID'),
  redirectUri: z.string()
    .url()
    .describe('Redirect URI after authorization'),
  scopes: z.array(z.string())
    .describe('OAuth scopes to request'),
});

export const apiOAuthInitTool = {
  name: 'api_oauth_init',
  description: 'Initialize OAuth flow and get authorization URL for user to visit',
  inputSchema: apiOAuthInitSchema,
};

/**
 * api_oauth_callback tool
 * 
 * Complete OAuth flow by exchanging authorization code for tokens.
 */
export const apiOAuthCallbackSchema = z.object({
  provider: z.enum(['google', 'github', 'stripe', 'slack'])
    .describe('OAuth provider'),
  clientId: z.string()
    .describe('OAuth client ID'),
  clientSecret: z.string()
    .describe('OAuth client secret'),
  code: z.string()
    .describe('Authorization code from callback'),
  redirectUri: z.string()
    .url()
    .describe('Redirect URI (must match auth request)'),
  userId: z.string()
    .describe('User identifier to store tokens under'),
  codeVerifier: z.string()
    .optional()
    .describe('PKCE code verifier (if used during init)'),
});

export const apiOAuthCallbackTool = {
  name: 'api_oauth_callback',
  description: 'Complete OAuth flow by exchanging authorization code for access tokens',
  inputSchema: apiOAuthCallbackSchema,
};

/**
 * api_oauth_refresh tool
 * 
 * Manually refresh OAuth access token.
 */
export const apiOAuthRefreshSchema = z.object({
  provider: z.enum(['google', 'github', 'stripe', 'slack'])
    .describe('OAuth provider'),
  userId: z.string()
    .describe('User identifier'),
  clientId: z.string()
    .describe('OAuth client ID'),
  clientSecret: z.string()
    .describe('OAuth client secret'),
});

export const apiOAuthRefreshTool = {
  name: 'api_oauth_refresh',
  description: 'Manually refresh OAuth access token using refresh token',
  inputSchema: apiOAuthRefreshSchema,
};

/**
 * api_set_rate_limit tool
 * 
 * Configure rate limit for an API endpoint.
 */
export const apiSetRateLimitSchema = z.object({
  key: z.string()
    .describe('Rate limit key (e.g., "api.github.com:/search/code")'),
  requests: z.number()
    .positive()
    .describe('Number of requests allowed'),
  window: z.number()
    .positive()
    .describe('Time window in seconds'),
  isGlobal: z.boolean()
    .optional()
    .default(false)
    .describe('Whether this is a global API limit'),
});

export const apiSetRateLimitTool = {
  name: 'api_set_rate_limit',
  description: 'Configure rate limit for an API endpoint or entire API',
  inputSchema: apiSetRateLimitSchema,
};

/**
 * api_get_rate_limit_status tool
 * 
 * Get current rate limit status for an endpoint.
 */
export const apiGetRateLimitStatusSchema = z.object({
  key: z.string()
    .describe('Rate limit key'),
  api: z.string()
    .optional()
    .describe('API identifier for global limit check'),
});

export const apiGetRateLimitStatusTool = {
  name: 'api_get_rate_limit_status',
  description: 'Get current rate limit status showing available tokens',
  inputSchema: apiGetRateLimitStatusSchema,
};
