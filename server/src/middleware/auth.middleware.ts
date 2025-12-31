/**
 * Authentication Middleware
 *
 * Middleware for protecting routes and handling authentication.
 * Supports both session tokens and API keys.
 */

import { Request, Response, NextFunction } from 'express';
import { validateToken, UserInfo } from '../services/auth.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';
import {
  validateApiKey,
  updateApiKeyUsage,
  logApiKeyRequest,
  isIpAllowed,
  ApiKeyValidation,
} from '../services/api-key.service.js';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '../services/rate-limit.service.js';
import { ApiScope, scopeGrantsAccess } from '../services/api-key-scopes.js';

// API Key info attached to request
export interface ApiKeyInfo {
  id: string;
  userId: string;
  scopes: string[];
  libraryIds: string[] | null;
  tier: string;
}

// Extend Express Request type to include user and API key
declare global {
  namespace Express {
    interface Request {
      user?: UserInfo;
      token?: string;
      apiKey?: ApiKeyInfo;
      authMethod?: 'session' | 'api-key' | 'basic';
    }
  }
}

/**
 * Extract session token from Authorization header or cookie
 */
function extractToken(req: Request): string | null {
  // Check Authorization header (only non-API keys)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !authHeader.startsWith('Bearer hlx_')) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookie = req.cookies?.helixio_token;
  if (cookie) {
    return cookie;
  }

  // Check query param (for OPDS clients that can't set headers)
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && !queryToken.startsWith('hlx_')) {
    return queryToken;
  }

  return null;
}

/**
 * Extract API key from X-API-Key header or Authorization header
 */
function extractApiKey(req: Request): string | null {
  // Check X-API-Key header (preferred for API keys)
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  // Check Authorization header for API key format
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer hlx_')) {
    return authHeader.slice(7);
  }

  // Check query param for API key format
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.startsWith('hlx_')) {
    return queryToken;
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  // Check X-Forwarded-For header (for proxied requests)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0];
    return firstIp ? firstIp.trim() : 'unknown';
  }

  // Check X-Real-IP header
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }

  // Fallback to connection remote address
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Middleware that requires authentication
 * Supports both session tokens and API keys
 * Returns 401 if not authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Try session token first
  const sessionToken = extractToken(req);

  if (sessionToken) {
    try {
      const user = await validateToken(sessionToken);
      if (user) {
        req.user = user;
        req.token = sessionToken;
        req.authMethod = 'session';
        next();
        return;
      }
    } catch (error) {
      logError('auth-middleware', error, { action: 'validate-session' });
    }
  }

  // Try API key
  const apiKeyRaw = extractApiKey(req);

  if (apiKeyRaw) {
    try {
      const validation = await validateApiKey(apiKeyRaw);

      if (validation) {
        const clientIp = getClientIp(req);

        // Check IP whitelist
        if (validation.ipWhitelist && validation.ipWhitelist.length > 0) {
          if (!isIpAllowed(clientIp, validation.ipWhitelist)) {
            res.status(403).json({
              error: 'IP address not allowed',
              message: 'Your IP address is not in the whitelist for this API key',
            });
            return;
          }
        }

        // Check rate limit
        const rateLimitResult = checkRateLimit(validation.id, validation.tier);
        const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

        // Set rate limit headers
        for (const [key, value] of Object.entries(rateLimitHeaders)) {
          res.setHeader(key, value);
        }

        if (!rateLimitResult.allowed) {
          res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${rateLimitResult.retryAfter} seconds.`,
            retryAfter: rateLimitResult.retryAfter,
          });
          return;
        }

        // Set request context
        req.user = validation.user;
        req.apiKey = {
          id: validation.id,
          userId: validation.userId,
          scopes: validation.scopes,
          libraryIds: validation.libraryIds,
          tier: validation.tier,
        };
        req.authMethod = 'api-key';

        // Update usage tracking asynchronously (don't wait)
        updateApiKeyUsage(validation.id, clientIp).catch((err) =>
          logError('auth-middleware', err, { action: 'update-api-key-usage' })
        );

        next();
        return;
      }
    } catch (error) {
      logError('auth-middleware', error, { action: 'validate-api-key' });
    }
  }

  // No valid authentication found
  res.status(401).json({ error: 'Authentication required' });
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
 * Works with both session and API key auth (API keys need admin:* scopes)
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First ensure user is authenticated
  if (!req.user) {
    // Try to authenticate first
    const token = extractToken(req);
    if (token) {
      try {
        const user = await validateToken(token);
        if (user) {
          req.user = user;
          req.token = token;
          req.authMethod = 'session';
        }
      } catch (error) {
        logError('auth-middleware', error, { action: 'require-admin-validate' });
      }
    }

    // Try API key if no session
    if (!req.user) {
      const apiKeyRaw = extractApiKey(req);
      if (apiKeyRaw) {
        try {
          const validation = await validateApiKey(apiKeyRaw);
          if (validation) {
            req.user = validation.user;
            req.apiKey = {
              id: validation.id,
              userId: validation.userId,
              scopes: validation.scopes,
              libraryIds: validation.libraryIds,
              tier: validation.tier,
            };
            req.authMethod = 'api-key';
          }
        } catch (error) {
          logError('auth-middleware', error, { action: 'require-admin-api-key' });
        }
      }
    }
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check admin role
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Middleware that requires specific API scopes
 * Session auth has all scopes, API keys must have the required scope
 */
export function requireScope(...requiredScopes: ApiScope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Session auth has all scopes (full access)
    if (req.authMethod === 'session' || !req.apiKey) {
      next();
      return;
    }

    // API key must have at least one of the required scopes
    const hasScope = requiredScopes.some((scope) =>
      scopeGrantsAccess(req.apiKey!.scopes, scope)
    );

    if (!hasScope) {
      res.status(403).json({
        error: 'Insufficient scope',
        message: `This operation requires one of: ${requiredScopes.join(', ')}`,
        required: requiredScopes,
        granted: req.apiKey.scopes,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware that checks library access
 * Also checks API key library restrictions if using API key auth
 */
export function requireLibraryAccess(permission: 'read' | 'write' | 'admin' = 'read') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const libraryId = req.params.libraryId || req.body?.libraryId;

    if (!libraryId) {
      res.status(400).json({ error: 'Library ID required' });
      return;
    }

    // Check API key library restrictions first
    if (req.apiKey && req.apiKey.libraryIds !== null) {
      if (!req.apiKey.libraryIds.includes(libraryId)) {
        res.status(403).json({
          error: 'API key does not have access to this library',
          message: 'This API key is restricted to specific libraries',
        });
        return;
      }
    }

    // Admins have access to all libraries
    if (req.user.role === 'admin') {
      next();
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

// =============================================================================
// IP-Based Rate Limiting for Auth Endpoints
// =============================================================================

interface IPRateLimitEntry {
  count: number;
  windowStart: number;
}

const ipRateLimits = new Map<string, IPRateLimitEntry>();
const IP_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const IP_RATE_LIMIT_MAX = 10; // 10 attempts per window

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipRateLimits) {
    if (now - entry.windowStart > IP_RATE_LIMIT_WINDOW * 2) {
      ipRateLimits.delete(key);
    }
  }
}, 60000).unref(); // Cleanup every minute, don't prevent exit

/**
 * Rate limit middleware for auth endpoints
 * Limits attempts by IP address to prevent brute force attacks
 */
export function rateLimitByIP(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIp(req);
  const key = `auth:${clientIp}`;
  const now = Date.now();

  let entry = ipRateLimits.get(key);

  if (!entry || now - entry.windowStart >= IP_RATE_LIMIT_WINDOW) {
    // New window
    entry = { count: 1, windowStart: now };
    ipRateLimits.set(key, entry);
  } else {
    entry.count++;
  }

  // Set rate limit headers
  const remaining = Math.max(0, IP_RATE_LIMIT_MAX - entry.count);
  const resetAt = Math.ceil((entry.windowStart + IP_RATE_LIMIT_WINDOW) / 1000);

  res.setHeader('X-RateLimit-Limit', IP_RATE_LIMIT_MAX.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', resetAt.toString());

  if (entry.count > IP_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.windowStart + IP_RATE_LIMIT_WINDOW - now) / 1000);
    res.setHeader('Retry-After', retryAfter.toString());
    res.status(429).json({
      error: 'Too many attempts',
      message: `Too many authentication attempts. Try again in ${retryAfter} seconds.`,
      retryAfter,
    });
    return;
  }

  next();
}
