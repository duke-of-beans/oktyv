/**
 * ASURIQ Hands Engine — Auth Middleware
 *
 * Verifies ASURIQ Supabase JWT and checks Hands subscription.
 * Returns 401 if no/invalid token, 403 if no Hands add-on.
 * Attaches user_id to request for per-user resource tracking.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('asuriq-auth');

// Supabase JWT is a standard JWT — decode and verify via Supabase's
// GoTrue endpoint or by checking the JWT signature with the JWT secret.
// For simplicity and reliability, we verify via Supabase's auth.getUser().

interface AsuriqRequestContext {
  userId: string;
  email?: string;
}

// Attached to req for downstream use
const REQUEST_CONTEXT = new WeakMap<IncomingMessage, AsuriqRequestContext>();

export function getRequestContext(req: IncomingMessage): AsuriqRequestContext | undefined {
  return REQUEST_CONTEXT.get(req);
}

/**
 * Verify ASURIQ JWT and Hands subscription.
 * Returns true if authorized, false if response was already sent (401/403).
 */
export async function verifyAsuriqAuth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    sendJson(res, 500, { error: 'Server misconfigured' });
    return false;
  }

  // Extract Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Missing or invalid Authorization header' });
    return false;
  }
  const token = authHeader.slice(7);

  try {
    // Verify token via Supabase auth.getUser()
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceRoleKey,
      },
    });

    if (!userRes.ok) {
      logger.warn('JWT verification failed', { status: userRes.status });
      sendJson(res, 401, { error: 'Invalid or expired token' });
      return false;
    }

    const userData = await userRes.json() as { id: string; email?: string };
    const userId = userData.id;

    // Check Hands subscription via credit_balances or plan metadata
    // Hands access: has 'hands' add-on, 'developer_kit' bundle, or 'full_stack' bundle
    // Also allow admin tier (plan_tier = 'admin')
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/credit_balances?user_id=eq.${userId}&select=plan_tier,add_ons,bundle`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!subRes.ok) {
      logger.error('Failed to check subscription', { status: subRes.status });
      sendJson(res, 500, { error: 'Subscription check failed' });
      return false;
    }

    const rows = await subRes.json() as Array<{
      plan_tier?: string;
      add_ons?: string[];
      bundle?: string;
    }>;

    const balance = rows[0];
    if (!balance) {
      sendJson(res, 403, { error: 'No ASURIQ account found' });
      return false;
    }

    const hasAccess =
      balance.plan_tier === 'admin' ||
      (balance.add_ons && balance.add_ons.includes('hands')) ||
      balance.bundle === 'developer_kit' ||
      balance.bundle === 'full_stack';

    if (!hasAccess) {
      sendJson(res, 403, {
        error: 'Hands add-on required',
        upgrade_url: 'https://asuriq.dev/pricing',
      });
      return false;
    }

    // Attach context for downstream use
    REQUEST_CONTEXT.set(req, { userId, email: userData.email });
    logger.info('Auth verified', { userId, plan: balance.plan_tier });
    return true;

  } catch (err) {
    logger.error('Auth verification error', { error: err });
    sendJson(res, 500, { error: 'Auth verification failed' });
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
