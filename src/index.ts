#!/usr/bin/env node
/**
 * Oktyv MCP Server Entry Point
 *
 * Two modes:
 *   OKTYV_MODE=asuriq → HTTP MCP server for ASURIQ Hands Engine (cloud)
 *   (default)         → stdio MCP server for local Claude Desktop
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('main');

async function startLocalMode(): Promise<void> {
  const t0 = Date.now();
  console.error('[Oktyv] Starting local stdio mode...');

  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js'
  );
  const { OktyvServer } = await import('./server.js');
  const server = new OktyvServer();
  console.error(`[Oktyv] Server created in ${Date.now() - t0}ms`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[Oktyv] Connected in ${Date.now() - t0}ms — ready`);

  logger.info('Oktyv MCP Server started (local stdio)');

  process.on('SIGINT', async () => {
    logger.info('SIGINT — shutting down');
    await server.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM — shutting down');
    await server.close();
    process.exit(0);
  });
}

async function startAsuriqMode(): Promise<void> {
  const t0 = Date.now();
  const PORT = parseInt(process.env.PORT || '8080', 10);

  console.log(`[Hands] Starting ASURIQ Hands Engine on port ${PORT}...`);

  const { randomUUID } = await import('node:crypto');
  const { createServer } = await import('node:http');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { OktyvServer } = await import('./server.js');
  const { verifyAsuriqAuth } = await import('./middleware/asuriq-auth.js');

  const server = new OktyvServer();

  // Map of session ID → transport for multi-session support
  type TransportType = InstanceType<typeof StreamableHTTPServerTransport>;
  const transports = new Map<string, TransportType>();

  const httpServer = createServer(async (req, res) => {
    const url = req.url || '/';

    // Health endpoint — no auth required
    if (url === '/health' && req.method === 'GET') {
      const uptime = Math.floor(process.uptime());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        mode: 'asuriq',
        version: '1.7.1',
        tools: 28,
        uptime,
        activeSessions: transports.size,
      }));
      return;
    }

    // MCP endpoint — auth required
    if (url === '/mcp') {
      // Auth check
      const authorized = await verifyAsuriqAuth(req, res);
      if (!authorized) return; // response already sent

      // Handle based on method
      if (req.method === 'POST') {
        // Check for existing session
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: TransportType;

        if (sessionId && transports.has(sessionId)) {
          // Existing session
          transport = transports.get(sessionId)!;
        } else if (!sessionId) {
          // New session — create transport and connect to server
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          // Connect the McpServer to this transport
          await server.connect(transport);

          // Track by session ID once assigned (after first handleRequest)
          transport.onclose = () => {
            if (transport.sessionId) {
              transports.delete(transport.sessionId);
              logger.info('Session closed', { sessionId: transport.sessionId });
            }
          };

          // We'll store it after handleRequest sets the sessionId
          await transport.handleRequest(req, res);

          if (transport.sessionId) {
            transports.set(transport.sessionId, transport);
          }
          return;
        } else {
          // Session ID provided but not found — expired or invalid
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === 'GET') {
        // SSE stream for server-initiated messages
        const sessionId2 = req.headers['mcp-session-id'] as string | undefined;
        if (sessionId2 && transports.has(sessionId2)) {
          const transport2 = transports.get(sessionId2)!;
          await transport2.handleRequest(req, res);
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session ID required for GET' }));
        return;
      }

      if (req.method === 'DELETE') {
        // Session termination
        const sessionId3 = req.headers['mcp-session-id'] as string | undefined;
        if (sessionId3 && transports.has(sessionId3)) {
          const transport3 = transports.get(sessionId3)!;
          await transport3.handleRequest(req, res);
          transports.delete(sessionId3);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      // Method not allowed
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Unknown route
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hands] ASURIQ Hands Engine ready on port ${PORT} (${Date.now() - t0}ms)`);
    console.log(`[Hands] MCP endpoint: /mcp`);
    console.log(`[Hands] Health: /health`);
    logger.info('ASURIQ Hands Engine started', { port: PORT });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT — shutting down Hands Engine');
    for (const [, t] of transports) await t.close().catch(() => {});
    await server.close();
    httpServer.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM — shutting down Hands Engine');
    for (const [, t] of transports) await t.close().catch(() => {});
    await server.close();
    httpServer.close();
    process.exit(0);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    if (process.env.OKTYV_MODE === 'asuriq') {
      await startAsuriqMode();
    } else {
      await startLocalMode();
    }
  } catch (error) {
    console.error('[Oktyv] FATAL:', error);
    logger.error('Failed to start', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Oktyv] FATAL:', error);
  logger.error('Fatal error', { error });
  process.exit(1);
});
