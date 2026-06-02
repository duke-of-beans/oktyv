#!/usr/bin/env node
/**
 * Oktyv MCP Server Entry Point
 * 
 * Launches the MCP server and handles stdio communication with Claude Desktop.
 * Fast startup: creates transport immediately, loads heavy deps in background.
 * 
 * Usage:
 *   node dist/index.js
 * 
 * Configuration in Claude Desktop:
 *   "oktyv": {
 *     "command": "node",
 *     "args": ["/absolute/path/to/oktyv/dist/index.js"]
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from './utils/logger.js';
// OktyvServer imported dynamically in main() to avoid eagerly loading heavy deps.

const logger = createLogger('main');

async function main() {
  try {
    const t0 = Date.now();
    console.error('[Oktyv] Starting...');
    
    // Phase 1: Import server module (now lightweight — heavy deps are lazy)
    const { OktyvServer } = await import('./server.js');
    const server = new OktyvServer();
    console.error(`[Oktyv] Server created in ${Date.now() - t0}ms`);
    
    // Phase 2: Connect to transport — responds to MCP 'initialize' immediately
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[Oktyv] Connected in ${Date.now() - t0}ms — ready for requests`);
    
    logger.info('Oktyv MCP Server started successfully');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('[Oktyv] FATAL:', error);
    logger.error('Failed to start Oktyv MCP Server', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Oktyv] FATAL:', error);
  logger.error('Fatal error', { error });
  process.exit(1);
});
