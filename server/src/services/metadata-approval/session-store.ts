/**
 * Metadata Approval Session Store
 *
 * Manages in-memory storage of approval sessions using an LRU cache.
 */

import { LRUCache } from '../lru-cache.service.js';
import { createServiceLogger } from '../logger.service.js';
import type { ApprovalSession } from './types.js';

const logger = createServiceLogger('metadata-approval-session');

// =============================================================================
// Configuration
// =============================================================================

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (aligned with job TTL)

// =============================================================================
// Session Storage (LRU Cache with bounded size)
// =============================================================================

// LRU cache automatically handles expiration and limits memory usage
const sessions = new LRUCache<ApprovalSession>({
  maxSize: 100, // Max 100 sessions in memory
  defaultTTL: SESSION_TTL_MS,
  onEvict: (sessionId: string, session: ApprovalSession) => {
    logger.info({ sessionId, status: session.status }, `Session evicted from memory cache`);
  },
});

// =============================================================================
// Session Management Functions
// =============================================================================

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): ApprovalSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check if expired
  if (session.expiresAt < new Date()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Store a session
 */
export function setSession(session: ApprovalSession): void {
  sessions.set(session.id, session);
}

/**
 * Delete a session
 */
export function deleteSessionFromStore(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Restore a session from stored data (for job persistence)
 * This re-hydrates a session into memory so it can be operated on.
 */
export function restoreSession(sessionData: ApprovalSession): void {
  // Ensure dates are Date objects (may be strings from JSON parsing)
  const session = {
    ...sessionData,
    createdAt: new Date(sessionData.createdAt),
    updatedAt: new Date(sessionData.updatedAt),
    expiresAt: new Date(sessionData.expiresAt),
  };

  // Extend expiration on restore
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  sessions.set(session.id, session);
}

/**
 * Delete/cancel a session
 */
export function deleteSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = 'cancelled';
    session.updatedAt = new Date();
    sessions.delete(sessionId);
    return true;
  }
  return false;
}
