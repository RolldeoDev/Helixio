import { describe, it, expect } from 'vitest';
import {
  calculateGridLayout,
  calculateVisibleRange,
  GridLayout,
} from '../gridCalculations';

describe('gridCalculations', () => {
  describe('calculateGridLayout', () => {
    it('should calculate correct column count for container width', () => {
      // 1200px container, cardSize 5 (medium)
      const layout = calculateGridLayout(1200, 5);
      expect(layout.columns).toBeGreaterThan(0);
      expect(layout.columns).toBeLessThanOrEqual(14);
    });

    it('should calculate item dimensions', () => {
      const layout = calculateGridLayout(1200, 5);
      expect(layout.itemWidth).toBeGreaterThan(0);
      expect(layout.itemHeight).toBeGreaterThan(0);
      // Aspect ratio should be approximately 1.5
      const aspectRatio = (layout.itemHeight - 60) / layout.itemWidth;
      expect(aspectRatio).toBeCloseTo(1.5, 1);
    });

    it('should increase columns with smaller card size', () => {
      const smallCards = calculateGridLayout(1200, 3);
      const largeCards = calculateGridLayout(1200, 7);
      expect(smallCards.columns).toBeGreaterThan(largeCards.columns);
    });

    it('should respect minimum gap', () => {
      const layout = calculateGridLayout(1200, 5);
      expect(layout.gap).toBeGreaterThanOrEqual(12);
    });

    it('should calculate total height for given item count', () => {
      const layout = calculateGridLayout(1200, 5);
      const totalHeight = layout.getTotalHeight(100);
      expect(totalHeight).toBeGreaterThan(0);
    });

    it('should handle edge case of 0 items', () => {
      const layout = calculateGridLayout(1200, 5);
      const totalHeight = layout.getTotalHeight(0);
      expect(totalHeight).toBe(0);
    });
  });

  describe('calculateVisibleRange', () => {
    const mockLayout: GridLayout = {
      columns: 5,
      itemWidth: 200,
      itemHeight: 360,
      gap: 16,
      containerWidth: 1200,
      getTotalHeight: (count: number) => Math.ceil(count / 5) * 376,
      getItemPosition: (index: number) => ({
        x: (index % 5) * 216,
        y: Math.floor(index / 5) * 376,
      }),
    };

    it('should calculate visible range based on scroll position', () => {
      const range = calculateVisibleRange(0, 800, mockLayout, 100);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeGreaterThan(0);
    });

    it('should include overscan rows', () => {
      const rangeWithOverscan = calculateVisibleRange(0, 800, mockLayout, 100, 2);
      const rangeWithoutOverscan = calculateVisibleRange(0, 800, mockLayout, 100, 0);
      expect(rangeWithOverscan.endIndex).toBeGreaterThan(rangeWithoutOverscan.endIndex);
    });

    it('should clamp to valid range', () => {
      const range = calculateVisibleRange(10000, 800, mockLayout, 10);
      expect(range.startIndex).toBeGreaterThanOrEqual(0);
      expect(range.endIndex).toBeLessThanOrEqual(10);
    });

    it('should handle empty list', () => {
      const range = calculateVisibleRange(0, 800, mockLayout, 0);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(0);
    });
  });
});
