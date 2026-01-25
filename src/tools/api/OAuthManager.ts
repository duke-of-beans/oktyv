/**
 * API Engine - OAuth Manager
 * 
 * OAuth 2.0 flow management with provider templates.
 * 
 * Supported flows:
 * - Authorization Code (with PKCE)
 * - Client Credentials
 * 
 * Features:
 * - Multiple provider templates (Google, GitHub, Stripe, etc.)
 * - Token storage in Vault Engine
 * - Automatic token refresh
 * - PKCE support for security
 */

import { createLogger } from '../../utils/logger.js';
import { HttpClient } from './HttpClient.js';
import crypto from 'crypto';

const logger = createLogger('oauth-manager');

/**
 * OAuth provider configuration
 */
export interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: Record<string, string>;  // Scope name -> scope value
  pkce: boolean;                    // Whether to use PKCE
  refreshable: boolean;             // Whether tokens can be refreshed
}

/**
 * OAuth tokens
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;  // Unix timestamp
  token_type?: string;
  scope?: string;
}

/**
 * OAuth authorization parameters
 */
export interface OAuthAuthParams {
  client_id: string;
  redirect_uri: string;
  scope: string[];
  state?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}

/**
 * OAuth token exchange parameters
 */
export interface OAuthTokenParams {
  client_id: string;
  client_secret?: string;
  code: string;
  redirect_uri: string;
  code_verifier?: string;
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
}

/**
 * Built-in OAuth providers
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: {
      gmail_readonly: 'https://www.googleapis.com/auth/gmail.readonly',
      gmail_send: 'https://www.googleapis.com/auth/gmail.send',
      drive_readonly: 'https://www.googleapis.com/auth/drive.readonly',
      drive: 'https://www.googleapis.com/auth/drive',
      calendar_readonly: 'https://www.googleapis.com/auth/calendar.readonly',
      calendar: 'https://www.googleapis.com/auth/calendar',
    },
    pkce: true,
    refreshable: true,
  },
  
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: {
      repo: 'repo',
      user: 'user',
      read_user: 'read:user',
      user_email: 'user:email',
      workflow: 'workflow',
      gist: 'gist',
    },
    pkce: false,
    refreshable: true,
  },
  
  stripe: {
    name: 'Stripe',
    authUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    scopes: {
      read_write: 'read_write',
    },
    pkce: false,
    refreshable: true,
  },
  
  slack: {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: {
      chat_write: 'chat:write',
      channels_read: 'channels:read',
      users_read: 'users:read',
      files_write: 'files:write',
    },
    pkce: false,
    refreshable: true,
  },
};

/**
 * Generate PKCE code verifier and challenge
 * 
 * PKCE (Proof Key for Code Exchange) is a security extension for OAuth 2.0
 * that prevents authorization code interception attacks.
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  // Generate random verifier (43-128 chars)
  const verifier = crypto
    .randomBytes(32)
    .toString('base64url');
  
  // Generate challenge (SHA256 hash of verifier)
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return { verifier, challenge };
}

/**
 * Generate random state parameter
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * OAuth Manager
 * 
 * Manages OAuth 2.0 flows with token storage and refresh.
 */
export class OAuthManager {
  private httpClient: HttpClient;
  private vaultName: string;
  
  constructor(
    private getVault: (name: string, key: string) => Promise<string>,
    private setVault: (name: string, key: string, value: string) => Promise<void>,
    vaultName: string = 'oauth-tokens'
  ) {
    this.httpClient = new HttpClient();
    this.vaultName = vaultName;
  }
  
  /**
   * Get provider configuration
   */
  getProvider(providerName: string): OAuthProvider {
    const provider = OAUTH_PROVIDERS[providerName.toLowerCase()];
    
    if (!provider) {
      throw new Error(`Unknown OAuth provider: ${providerName}`);
    }
    
    return provider;
  }
  
  /**
   * Build authorization URL for user to visit
   * 
   * @param providerName - Provider name (google, github, etc.)
   * @param clientId - OAuth client ID
   * @param redirectUri - Redirect URI after authorization
   * @param scopes - Array of scope names
   * @returns Authorization URL and optional code verifier (for PKCE)
   */
  async buildAuthUrl(
    providerName: string,
    clientId: string,
    redirectUri: string,
    scopes: string[]
  ): Promise<{ authUrl: string; state: string; codeVerifier?: string }> {
    const provider = this.getProvider(providerName);
    
    // Generate state
    const state = generateState();
    
    // Build base params
    const params: Record<string, string> = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    };
    
    // Add scopes
    const scopeValues = scopes.map(s => provider.scopes[s] || s);
    params.scope = scopeValues.join(' ');
    
    // Add PKCE if supported
    let codeVerifier: string | undefined;
    if (provider.pkce) {
      const pkce = generatePKCE();
      codeVerifier = pkce.verifier;
      params.code_challenge = pkce.challenge;
      params.code_challenge_method = 'S256';
    }
    
    // Build URL
    const url = new URL(provider.authUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    
    logger.info('Built authorization URL', {
      provider: providerName,
      scopes,
      pkce: provider.pkce,
    });
    
    return {
      authUrl: url.toString(),
      state,
      codeVerifier,
    };
  }
  
  /**
   * Exchange authorization code for tokens
   * 
   * @param providerName - Provider name
   * @param clientId - OAuth client ID
   * @param clientSecret - OAuth client secret
   * @param code - Authorization code from callback
   * @param redirectUri - Redirect URI (must match auth request)
   * @param codeVerifier - Code verifier for PKCE
   * @returns OAuth tokens
   */
  async exchangeCodeForTokens(
    providerName: string,
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens> {
    const provider = this.getProvider(providerName);
    
    // Build token request
    const params: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    
    // Add PKCE verifier if used
    if (codeVerifier) {
      params.code_verifier = codeVerifier;
    }
    
    // Make request
    const response = await this.httpClient.post<OAuthTokens>(
      provider.tokenUrl,
      new URLSearchParams(params).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    if (!response.data) {
      throw new Error('Token exchange failed: empty response');
    }
    
    const tokens = response.data;
    
    // Calculate expiration time
    if (tokens.expires_in) {
      tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    }
    
    logger.info('Exchanged code for tokens', {
      provider: providerName,
      hasRefreshToken: !!tokens.refresh_token,
      expiresAt: tokens.expires_at,
    });
    
    return tokens;
  }
  
  /**
   * Refresh access token using refresh token
   * 
   * @param providerName - Provider name
   * @param clientId - OAuth client ID
   * @param clientSecret - OAuth client secret
   * @param refreshToken - Refresh token
   * @returns New OAuth tokens
   */
  async refreshTokens(
    providerName: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const provider = this.getProvider(providerName);
    
    if (!provider.refreshable) {
      throw new Error(`Provider ${providerName} does not support token refresh`);
    }
    
    // Build refresh request
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    
    // Make request
    const response = await this.httpClient.post<OAuthTokens>(
      provider.tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    if (!response.data) {
      throw new Error('Token refresh failed: empty response');
    }
    
    const tokens = response.data;
    
    // Calculate expiration time
    if (tokens.expires_in) {
      tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    }
    
    // Preserve refresh token if not returned
    if (!tokens.refresh_token) {
      tokens.refresh_token = refreshToken;
    }
    
    logger.info('Refreshed tokens', {
      provider: providerName,
      expiresAt: tokens.expires_at,
    });
    
    return tokens;
  }
  
  /**
   * Store tokens in vault
   * 
   * @param providerName - Provider name
   * @param userId - User identifier (email, username, etc.)
   * @param tokens - OAuth tokens
   */
  async storeTokens(
    providerName: string,
    userId: string,
    tokens: OAuthTokens
  ): Promise<void> {
    const key = `${providerName}-${userId}`;
    await this.setVault(this.vaultName, key, JSON.stringify(tokens));
    
    logger.info('Stored tokens in vault', {
      provider: providerName,
      userId,
    });
  }
  
  /**
   * Get tokens from vault
   * 
   * @param providerName - Provider name
   * @param userId - User identifier
   * @returns OAuth tokens or null if not found
   */
  async getTokens(
    providerName: string,
    userId: string
  ): Promise<OAuthTokens | null> {
    const key = `${providerName}-${userId}`;
    
    try {
      const data = await this.getVault(this.vaultName, key);
      return JSON.parse(data) as OAuthTokens;
    } catch (error: any) {
      if (error.code === 'CREDENTIAL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Get valid access token (auto-refresh if expired)
   * 
   * @param providerName - Provider name
   * @param userId - User identifier
   * @param clientId - OAuth client ID
   * @param clientSecret - OAuth client secret
   * @returns Valid access token
   */
  async getValidAccessToken(
    providerName: string,
    userId: string,
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    const tokens = await this.getTokens(providerName, userId);
    
    if (!tokens) {
      throw new Error(`No tokens found for ${providerName}:${userId}`);
    }
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = tokens.expires_at || 0;
    
    // Refresh if expired or expiring soon (within 5 minutes)
    if (expiresAt > 0 && expiresAt < now + 300) {
      if (!tokens.refresh_token) {
        throw new Error(`Token expired and no refresh token available`);
      }
      
      logger.info('Token expired, refreshing', {
        provider: providerName,
        userId,
      });
      
      const newTokens = await this.refreshTokens(
        providerName,
        clientId,
        clientSecret,
        tokens.refresh_token
      );
      
      await this.storeTokens(providerName, userId, newTokens);
      
      return newTokens.access_token;
    }
    
    return tokens.access_token;
  }
}
