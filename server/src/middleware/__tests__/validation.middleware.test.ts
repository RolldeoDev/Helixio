/**
 * Validation Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, validateBody, validateQuery, validateParams } from '../validation.middleware.js';

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock })) as unknown as ReturnType<typeof vi.fn>;
    mockReq = {
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: statusMock as Response['status'],
      json: jsonMock as Response['json'],
    };
    mockNext = vi.fn();
  });

  describe('validate', () => {
    it('should pass valid body through', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      mockReq.body = { name: 'Test', age: 25 };

      const middleware = validate({ body: schema });
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid body', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      mockReq.body = { name: 123, age: 'invalid' };

      const middleware = validate({ body: schema });
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      // Just check that the response contains the expected structure
      expect(jsonMock).toHaveBeenCalled();
      const response = jsonMock.mock.calls[0]![0];
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate query parameters', async () => {
      const schema = z.object({
        page: z.string().transform(Number),
      });

      mockReq.query = { page: '5' };

      const middleware = validate({ query: schema });
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query).toEqual({ page: 5 });
    });

    it('should validate URL params', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validate({ params: schema });
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should include field path in error details', async () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      mockReq.body = { user: { email: 'invalid' } };

      const middleware = validate({ body: schema });
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalled();
      const response = jsonMock.mock.calls[0]![0];
      expect(response.error.details).toBeDefined();
      expect(response.error.details.length).toBeGreaterThan(0);
      // Check that the path contains 'user' and 'email'
      const detail = response.error.details[0];
      expect(detail.path).toContain('user');
      expect(detail.path).toContain('email');
    });
  });

  describe('validateBody', () => {
    it('should be a shorthand for body validation', async () => {
      const schema = z.object({ name: z.string() });
      mockReq.body = { name: 'Test' };

      const middleware = validateBody(schema);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    it('should be a shorthand for query validation', async () => {
      const schema = z.object({ limit: z.string() });
      mockReq.query = { limit: '10' };

      const middleware = validateQuery(schema);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    it('should be a shorthand for params validation', async () => {
      const schema = z.object({ id: z.string() });
      mockReq.params = { id: 'test-id' };

      const middleware = validateParams(schema);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
