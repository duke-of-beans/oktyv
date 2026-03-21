/**
 * Temp Session Manager
 *
 * Manages temporary screenshot session directories for visual inspection tools.
 * All screenshots are stored under SCREENSHOTS_BASE and deleted after synthesis.
 *
 * Design principles:
 * - Screenshots ALWAYS temporary — never committed, never on C:\
 * - cleanup: true is the DEFAULT on every capture tool
 * - SCREENSHOTS_BASE is the single source of truth — never hardcode elsewhere
 */

import { mkdir, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('temp-session-manager');

/**
 * Root directory for all temporary screenshot sessions.
 * NEVER write to C:\ — all paths must be under D:\
 */
export const SCREENSHOTS_BASE = 'D:/Dev/oktyv/screenshots/temp';

/**
 * Ensure the screenshots/temp root directory exists.
 * Called once at server startup.
 */
export async function ensureScreenshotsBaseExists(): Promise<void> {
  await mkdir(SCREENSHOTS_BASE, { recursive: true });
  logger.info('Screenshots base dir ensured', { path: SCREENSHOTS_BASE });
}

/**
 * Create a new unique temp session directory.
 * Returns the full path to the session directory.
 *
 * @param prefix  Optional human-readable prefix for the session directory name
 * @returns Full absolute path to the created session directory
 */
export async function createTempSession(prefix?: string): Promise<string> {
  const uuid = randomUUID();
  const dirName = prefix ? `${prefix}-${uuid}` : uuid;
  const sessionDir = join(SCREENSHOTS_BASE, dirName).replace(/\\/g, '/');

  await mkdir(sessionDir, { recursive: true });
  logger.info('Temp session created', { sessionDir });
  return sessionDir;
}

/**
 * Recursively delete a temp session directory.
 * Returns the number of files deleted.
 *
 * @param sessionDir  Full path to session directory (must be under SCREENSHOTS_BASE)
 * @returns           Object with deleted file count
 */
export async function cleanupSession(sessionDir: string): Promise<{ deleted: number }> {
  // Safety check: only delete if under SCREENSHOTS_BASE
  const normalizedBase = SCREENSHOTS_BASE.replace(/\\/g, '/');
  const normalizedDir = sessionDir.replace(/\\/g, '/');

  if (!normalizedDir.startsWith(normalizedBase)) {
    const msg = `Refusing to delete path outside SCREENSHOTS_BASE: ${sessionDir}`;
    logger.error(msg);
    throw new Error(msg);
  }

  if (!existsSync(sessionDir)) {
    logger.warn('Session dir does not exist, nothing to clean', { sessionDir });
    return { deleted: 0 };
  }

  // Count files before deletion
  let deleted = 0;
  try {
    const entries = await readdir(sessionDir, { recursive: true } as any);
    deleted = (entries as string[]).filter((e: string) => !e.includes('/')).length;
    // Fallback: if recursive isn't available in this Node version, just count top-level
    if (deleted === 0) deleted = (entries as string[]).length;
  } catch {
    // Count failed, not critical
  }

  await rm(sessionDir, { recursive: true, force: true });
  logger.info('Temp session cleaned up', { sessionDir, deleted });
  return { deleted };
}
