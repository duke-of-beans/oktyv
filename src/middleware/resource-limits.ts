/**
 * ASURIQ Hands Engine — Resource Limits
 *
 * Per-user browser session limits, global pool cap, idle timeout.
 * Only active in asuriq mode.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('resource-limits');

const MAX_BROWSERS_PER_USER = 3;
const MAX_BROWSERS_GLOBAL = 20;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
// Reserved for future temp file cleanup:
// const TEMP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// const TEMP_MAX_AGE_MS = 5 * 60 * 1000;

interface TrackedSession {
  userId: string;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
}

export class ResourceLimits {
  private sessions = new Map<string, TrackedSession>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private onCloseSession?: (sessionId: string) => Promise<void>;

  constructor() {
    // Start idle check every 60 seconds
    this.idleTimer = setInterval(() => this.checkIdleSessions(), 60_000);
  }

  /** Set callback for closing sessions that exceed limits or idle out. */
  setCloseCallback(fn: (sessionId: string) => Promise<void>): void {
    this.onCloseSession = fn;
  }

  /**
   * Check if a user can open a new browser session.
   * Returns { allowed, reason } — call before launching Puppeteer.
   */
  canOpenBrowser(userId: string): { allowed: boolean; reason?: string } {
    const userCount = this.getUserSessionCount(userId);
    if (userCount >= MAX_BROWSERS_PER_USER) {
      return {
        allowed: false,
        reason: `Browser limit reached (${MAX_BROWSERS_PER_USER} per user). Close an existing session first.`,
      };
    }
    if (this.sessions.size >= MAX_BROWSERS_GLOBAL) {
      return {
        allowed: false,
        reason: `Global browser pool full (${MAX_BROWSERS_GLOBAL}). Try again shortly.`,
      };
    }
    return { allowed: true };
  }

  /** Track a newly opened browser session. */
  trackSession(userId: string, sessionId: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, { userId, sessionId, createdAt: now, lastActivity: now });
    logger.info('Session tracked', { userId, sessionId, userTotal: this.getUserSessionCount(userId), globalTotal: this.sessions.size });
  }

  /** Update last activity timestamp on any browser interaction. */
  touchSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s) s.lastActivity = Date.now();
  }

  /** Remove tracking when session is closed. */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private getUserSessionCount(userId: string): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId) count++;
    }
    return count;
  }

  private async checkIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const [sessionId, s] of this.sessions) {
      if (now - s.lastActivity > IDLE_TIMEOUT_MS) {
        logger.info('Closing idle session', { sessionId, userId: s.userId, idleMs: now - s.lastActivity });
        this.sessions.delete(sessionId);
        if (this.onCloseSession) {
          try { await this.onCloseSession(sessionId); } catch (err) {
            logger.error('Failed to close idle session', { sessionId, error: err });
          }
        }
      }
    }
  }

  /** Get current resource usage stats. */
  getStats(): { activeSessions: number; maxGlobal: number; maxPerUser: number } {
    return {
      activeSessions: this.sessions.size,
      maxGlobal: MAX_BROWSERS_GLOBAL,
      maxPerUser: MAX_BROWSERS_PER_USER,
    };
  }

  /** Cleanup timers on shutdown. */
  close(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
