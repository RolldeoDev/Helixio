import { describe, it, expect } from 'vitest';
import {
  SeriesFilterState,
  DEFAULT_FILTERS,
  parseUrlToFilters,
  filtersToUrl,
  filtersToQueryKey,
} from '../filterUtils';

describe('filterUtils', () => {
  describe('DEFAULT_FILTERS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_FILTERS.search).toBe('');
      expect(DEFAULT_FILTERS.publisher).toBeNull();
      expect(DEFAULT_FILTERS.type).toBeNull();
      expect(DEFAULT_FILTERS.hasUnread).toBeNull();
      expect(DEFAULT_FILTERS.showHidden).toBe(false);
      expect(DEFAULT_FILTERS.libraryId).toBeNull();
      expect(DEFAULT_FILTERS.sortBy).toBe('name');
      expect(DEFAULT_FILTERS.sortOrder).toBe('asc');
      expect(DEFAULT_FILTERS.presetId).toBeNull();
      expect(DEFAULT_FILTERS.cardSize).toBe(5);
    });
  });

  describe('parseUrlToFilters', () => {
    it('should return defaults for empty params', () => {
      const params = new URLSearchParams('');
      const result = parseUrlToFilters(params);
      expect(result).toEqual(DEFAULT_FILTERS);
    });

    it('should parse search parameter', () => {
      const params = new URLSearchParams('?search=batman');
      const result = parseUrlToFilters(params);
      expect(result.search).toBe('batman');
    });

    it('should parse publisher parameter', () => {
      const params = new URLSearchParams('?publisher=DC+Comics');
      const result = parseUrlToFilters(params);
      expect(result.publisher).toBe('DC Comics');
    });

    it('should parse type parameter', () => {
      const params = new URLSearchParams('?type=manga');
      const result = parseUrlToFilters(params);
      expect(result.type).toBe('manga');
    });

    it('should parse hasUnread parameter', () => {
      const params = new URLSearchParams('?hasUnread=true');
      const result = parseUrlToFilters(params);
      expect(result.hasUnread).toBe(true);
    });

    it('should parse showHidden parameter', () => {
      const params = new URLSearchParams('?showHidden=true');
      const result = parseUrlToFilters(params);
      expect(result.showHidden).toBe(true);
    });

    it('should parse sorting parameters', () => {
      const params = new URLSearchParams('?sortBy=startYear&sortOrder=desc');
      const result = parseUrlToFilters(params);
      expect(result.sortBy).toBe('startYear');
      expect(result.sortOrder).toBe('desc');
    });

    it('should parse preset parameter', () => {
      const params = new URLSearchParams('?preset=abc123');
      const result = parseUrlToFilters(params);
      expect(result.presetId).toBe('abc123');
    });

    it('should parse cardSize parameter', () => {
      const params = new URLSearchParams('?cardSize=7');
      const result = parseUrlToFilters(params);
      expect(result.cardSize).toBe(7);
    });

    it('should clamp cardSize to valid range', () => {
      expect(parseUrlToFilters(new URLSearchParams('?cardSize=0')).cardSize).toBe(1);
      expect(parseUrlToFilters(new URLSearchParams('?cardSize=15')).cardSize).toBe(10);
    });
  });

  describe('filtersToUrl', () => {
    it('should return /series for default filters', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).toBe('/series');
    });

    it('should include search in URL', () => {
      const filters = { ...DEFAULT_FILTERS, search: 'batman' };
      const result = filtersToUrl(filters);
      expect(result).toContain('search=batman');
    });

    it('should encode publisher with spaces', () => {
      const filters = { ...DEFAULT_FILTERS, publisher: 'DC Comics' };
      const result = filtersToUrl(filters);
      expect(result).toContain('publisher=DC+Comics');
    });

    it('should include preset when set', () => {
      const filters = { ...DEFAULT_FILTERS, presetId: 'abc123' };
      const result = filtersToUrl(filters);
      expect(result).toContain('preset=abc123');
    });

    it('should not include default sortBy/sortOrder', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).not.toContain('sortBy');
      expect(result).not.toContain('sortOrder');
    });

    it('should include non-default sorting', () => {
      const filters = { ...DEFAULT_FILTERS, sortBy: 'startYear' as const, sortOrder: 'desc' as const };
      const result = filtersToUrl(filters);
      expect(result).toContain('sortBy=startYear');
      expect(result).toContain('sortOrder=desc');
    });

    it('should not include default cardSize', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).not.toContain('cardSize');
    });

    it('should include non-default cardSize', () => {
      const filters = { ...DEFAULT_FILTERS, cardSize: 7 };
      const result = filtersToUrl(filters);
      expect(result).toContain('cardSize=7');
    });
  });

  describe('filtersToQueryKey', () => {
    it('should create stable query key for same filters', () => {
      const filters1 = { ...DEFAULT_FILTERS, search: 'batman' };
      const filters2 = { ...DEFAULT_FILTERS, search: 'batman' };
      expect(filtersToQueryKey(filters1)).toEqual(filtersToQueryKey(filters2));
    });

    it('should create different keys for different filters', () => {
      const filters1 = { ...DEFAULT_FILTERS, search: 'batman' };
      const filters2 = { ...DEFAULT_FILTERS, search: 'superman' };
      expect(filtersToQueryKey(filters1)).not.toEqual(filtersToQueryKey(filters2));
    });

    it('should not include cardSize in query key (view-only)', () => {
      const filters1 = { ...DEFAULT_FILTERS, cardSize: 5 };
      const filters2 = { ...DEFAULT_FILTERS, cardSize: 10 };
      expect(filtersToQueryKey(filters1)).toEqual(filtersToQueryKey(filters2));
    });
  });
});
