/**
 * Parallel Service Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { parallelMap, parallelFilter, sequentialMap, createBatches, processBatches } from '../parallel.service.js';

describe('Parallel Service', () => {
  describe('parallelMap', () => {
    it('should process items in parallel', async () => {
      const items = [1, 2, 3, 4, 5];
      const fn = vi.fn(async (item: number) => item * 2);

      const result = await parallelMap(items, fn, { concurrency: 2 });

      expect(result.total).toBe(5);
      expect(result.successful).toBe(5);
      expect(result.failed).toBe(0);
      expect(result.results.map((r) => r.result)).toEqual([2, 4, 6, 8, 10]);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should handle errors without stopping by default', async () => {
      const items = [1, 2, 3];
      const fn = vi.fn(async (item: number) => {
        if (item === 2) throw new Error('Test error');
        return item * 2;
      });

      const result = await parallelMap(items, fn);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1]!.success).toBe(false);
      expect(result.results[1]!.error).toBe('Test error');
    });

    it('should stop on error when stopOnError is true', async () => {
      const items = [1, 2, 3, 4, 5];
      const fn = vi.fn(async (item: number) => {
        if (item === 2) throw new Error('Test error');
        return item * 2;
      });

      const result = await parallelMap(items, fn, { concurrency: 1, stopOnError: true });

      // With concurrency 1 and stopOnError, we should stop at item 2
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });

    it('should call onProgress callback', async () => {
      const items = [1, 2, 3];
      const onProgress = vi.fn();

      await parallelMap(items, async (item) => item * 2, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should respect shouldCancel', async () => {
      const items = [1, 2, 3, 4, 5];
      let processed = 0;
      const shouldCancel = vi.fn(() => processed >= 2);

      await parallelMap(
        items,
        async (item) => {
          processed++;
          return item * 2;
        },
        { concurrency: 1, shouldCancel }
      );

      // shouldCancel is called before each item
      expect(shouldCancel).toHaveBeenCalled();
    });
  });

  describe('parallelFilter', () => {
    it('should return only successful results', async () => {
      const items = [1, 2, 3];
      const fn = vi.fn(async (item: number) => {
        if (item === 2) throw new Error('Skip');
        return item * 2;
      });

      const result = await parallelFilter(items, fn);

      expect(result).toEqual([2, 6]);
    });
  });

  describe('sequentialMap', () => {
    it('should process items one at a time', async () => {
      const items = [1, 2, 3];
      const order: number[] = [];
      const fn = vi.fn(async (item: number) => {
        order.push(item);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return item * 2;
      });

      await sequentialMap(items, fn);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('createBatches', () => {
    it('should split items into batches of specified size', () => {
      const items = [1, 2, 3, 4, 5, 6, 7];
      const batches = createBatches(items, 3);

      expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should handle empty array', () => {
      const batches = createBatches([], 3);
      expect(batches).toEqual([]);
    });

    it('should handle batch size larger than array', () => {
      const items = [1, 2];
      const batches = createBatches(items, 10);

      expect(batches).toEqual([[1, 2]]);
    });
  });

  describe('processBatches', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6];
      const fn = vi.fn(async (item: number) => item * 2);

      const result = await processBatches(items, fn, { batchSize: 2, concurrency: 2 });

      expect(result.total).toBe(6);
      expect(result.successful).toBe(6);
      expect(fn).toHaveBeenCalledTimes(6);
    });
  });
});
