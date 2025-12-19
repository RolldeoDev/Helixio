/**
 * Response Middleware
 *
 * Standardized API response formatting and error handling.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logError } from '../services/logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Send a successful response
 */
export function sendSuccess<T>(res: Response, data: T, meta?: ApiSuccessResponse<T>['meta'], status = 200): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };
  if (meta) {
    response.meta = meta;
  }
  res.status(status).json(response);
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  status = 500,
  details?: unknown
): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  if (details !== undefined) {
    response.error.details = details;
  }
  res.status(status).json(response);
}

/**
 * Send a 400 Bad Request error
 */
export function sendBadRequest(res: Response, message: string, details?: unknown): void {
  sendError(res, 'BAD_REQUEST', message, 400, details);
}

/**
 * Send a 404 Not Found error
 */
export function sendNotFound(res: Response, message: string): void {
  sendError(res, 'NOT_FOUND', message, 404);
}

/**
 * Send a 409 Conflict error
 */
export function sendConflict(res: Response, message: string, details?: unknown): void {
  sendError(res, 'CONFLICT', message, 409, details);
}

/**
 * Send a 500 Internal Server Error
 */
export function sendInternalError(res: Response, message: string): void {
  sendError(res, 'INTERNAL_ERROR', message, 500);
}

// =============================================================================
// Error Handling Middleware
// =============================================================================

/**
 * Async handler wrapper - catches errors and passes to error middleware
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logError(`${req.method} ${req.path}`, err, {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  // Don't expose stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const message = isDevelopment ? err.message : 'An unexpected error occurred';

  sendError(res, 'INTERNAL_ERROR', message, 500);
}

// =============================================================================
// Not Found Handler
// =============================================================================

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendNotFound(res, `Route not found: ${req.method} ${req.path}`);
}
