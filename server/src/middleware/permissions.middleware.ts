/**
 * Permission Middleware
 *
 * Middleware for enforcing user permissions on routes.
 * Works in conjunction with the permission types defined in types/permissions.ts.
 */

import { Request, Response, NextFunction } from 'express';
import { PermissionKey, hasPermission } from '../types/permissions.js';

/**
 * Middleware factory that requires a specific permission.
 * Admins automatically bypass all permission checks.
 *
 * @param permission - The permission key to check
 * @returns Express middleware function
 *
 * @example
 * // Protect a route with the 'download' permission
 * router.get('/file/:id', requireAuth, requirePermission('download'), handler);
 */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Must be authenticated first
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admins bypass all permission checks
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if user has the required permission
    if (!hasPermission(req.user, permission)) {
      res.status(403).json({
        error: 'Permission denied',
        message: `You do not have the '${permission}' permission required for this action`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory that requires any one of the specified permissions.
 * Admins automatically bypass all permission checks.
 *
 * @param permissions - Array of permission keys (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPermission(...permissions: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Must be authenticated first
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admins bypass all permission checks
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if user has any of the required permissions
    const hasAny = permissions.some((perm) => hasPermission(req.user!, perm));

    if (!hasAny) {
      res.status(403).json({
        error: 'Permission denied',
        message: `You need one of these permissions: ${permissions.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory that requires all of the specified permissions.
 * Admins automatically bypass all permission checks.
 *
 * @param permissions - Array of permission keys (user needs all)
 * @returns Express middleware function
 */
export function requireAllPermissions(...permissions: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Must be authenticated first
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admins bypass all permission checks
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if user has all required permissions
    const missing = permissions.filter((perm) => !hasPermission(req.user!, perm));

    if (missing.length > 0) {
      res.status(403).json({
        error: 'Permission denied',
        message: `Missing required permissions: ${missing.join(', ')}`,
      });
      return;
    }

    next();
  };
}
