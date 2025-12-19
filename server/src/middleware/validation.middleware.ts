/**
 * Validation Middleware
 *
 * Provides request validation using Zod schemas.
 * Validates body, query, and params.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// =============================================================================
// Types
// =============================================================================

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Validate request against Zod schemas
 */
export function validate(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query) as typeof req.query;
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params) as typeof req.params;
      }
      next();
    } catch (error) {
      // Zod 4.x uses z.ZodError and has issues array
      if (error && typeof error === 'object' && 'issues' in error) {
        const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: zodError.issues.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * Validate body only (convenience wrapper)
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return validate({ body: schema });
}

/**
 * Validate query only (convenience wrapper)
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return validate({ query: schema });
}

/**
 * Validate params only (convenience wrapper)
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return validate({ params: schema });
}

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const PaginationQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 50)) : 50)),
});
