/**
 * Authentication Middleware
 *
 * Middleware for protecting routes and handling authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { validateToken, UserInfo } from '../services/auth.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserInfo;
      token?: string;
    }
  }
}

/**
 * Extract token from Authorization header or cookie
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookie = req.cookies?.helixio_token;
  if (cookie) {
    return cookie;
  }

  // Check query param (for OPDS clients that can't set headers)
  const queryToken = req.query.token;
  if (typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}

/**
 * Middleware that requires authentication
 * Returns 401 if not authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await validateToken(token);

    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    logError('auth-middleware', error, { action: 'require-auth' });
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware that optionally authenticates
 * Continues even if not authenticated, but sets req.user if valid token
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (token) {
    try {
      const user = await validateToken(token);
      if (user) {
        req.user = user;
        req.token = token;
      }
    } catch (error) {
      logError('auth-middleware', error, { action: 'optional-auth' });
    }
  }

  next();
}

/**
 * Middleware that requires admin role
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await validateToken(token);

    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    logError('auth-middleware', error, { action: 'require-admin' });
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware that checks library access
 */
export function requireLibraryAccess(permission: 'read' | 'write' | 'admin' = 'read') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admins have access to all libraries
    if (req.user.role === 'admin') {
      next();
      return;
    }

    const libraryId = req.params.libraryId || req.body?.libraryId;

    if (!libraryId) {
      res.status(400).json({ error: 'Library ID required' });
      return;
    }

    // Check UserLibraryAccess table for permission
    const prisma = getDatabase();
    const access = await prisma.userLibraryAccess.findUnique({
      where: {
        userId_libraryId: {
          userId: req.user.id,
          libraryId: libraryId,
        },
      },
    });

    // No access record means no permission
    if (!access) {
      res.status(403).json({ error: 'No access to this library' });
      return;
    }

    // Check if permission level is sufficient
    const permissionLevels: Record<string, number> = {
      read: 1,
      write: 2,
      admin: 3,
    };

    const requiredLevel = permissionLevels[permission] || 1;
    const userLevel = permissionLevels[access.permission] || 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Insufficient permissions for this operation' });
      return;
    }

    next();
  };
}

/**
 * OPDS Basic Auth middleware
 * Supports HTTP Basic authentication for OPDS clients
 */
export async function opdsAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First try token auth
  const token = extractToken(req);

  if (token) {
    try {
      const user = await validateToken(token);
      if (user) {
        req.user = user;
        req.token = token;
        next();
        return;
      }
    } catch {
      // Fall through to Basic auth
    }
  }

  // Try Basic auth
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    try {
      const base64Credentials = authHeader.slice(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
      const [username, password] = credentials.split(':');

      if (username && password) {
        // Import login function dynamically to avoid circular deps
        const { login } = await import('../services/auth.service.js');
        const result = await login(username, password);

        if (result.success && result.user) {
          req.user = result.user;
          req.token = result.token;
          next();
          return;
        }
      }
    } catch {
      // Fall through to unauthorized
    }
  }

  // Request authentication
  res.setHeader('WWW-Authenticate', 'Basic realm="Helixio OPDS"');
  res.status(401).json({ error: 'Authentication required' });
}
