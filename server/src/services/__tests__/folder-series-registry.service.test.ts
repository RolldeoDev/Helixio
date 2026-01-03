/**
 * Folder Series Registry Service Tests
 *
 * Tests for multi-series series.json handling and folder-scoped matching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FolderSeriesRegistry,
  normalizeName,
  calculateSimilarity,
} from '../folder-series-registry.service.js';
import type { SeriesMetadata, SeriesDefinition } from '../series-metadata.service.js';

describe('FolderSeriesRegistry', () => {
  describe('normalizeName', () => {
    it('should lowercase and trim names', () => {
      expect(normalizeName('  Batman  ')).toBe('batman');
      expect(normalizeName('BATMAN')).toBe('batman');
    });

    it('should remove "The" prefix', () => {
      expect(normalizeName('The Batman')).toBe('batman');
      expect(normalizeName('the Amazing Spider-Man')).toBe('amazing spiderman');
    });

    it('should remove parenthetical suffixes (year, volume)', () => {
      expect(normalizeName('Batman (2016)')).toBe('batman');
      expect(normalizeName('Batman (New 52)')).toBe('batman');
      expect(normalizeName('Spider-Man (Vol. 3)')).toBe('spiderman');
    });

    it('should remove volume indicators', () => {
      expect(normalizeName('Batman Vol. 2')).toBe('batman');
      expect(normalizeName('Batman Volume 3')).toBe('batman');
      expect(normalizeName('Amazing Spider-Man vol 1')).toBe('amazing spiderman');
    });

    it('should remove special characters', () => {
      expect(normalizeName('Spider-Man')).toBe('spiderman');
      expect(normalizeName("Harley Quinn's")).toBe('harley quinns');
      expect(normalizeName('X-Men: Days of Future Past')).toBe('xmen days of future past');
    });

    it('should normalize multiple spaces', () => {
      expect(normalizeName('Batman    The Dark Knight')).toBe('batman the dark knight');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('batman', 'batman')).toBe(1);
    });

    it('should return high similarity for similar strings', () => {
      const similarity = calculateSimilarity('batman', 'batmans');
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should return low similarity for different strings', () => {
      const similarity = calculateSimilarity('batman', 'superman');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1);
    });

    it('should give credit for matching words', () => {
      const similarity = calculateSimilarity('amazing spiderman', 'spectacular spiderman');
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  describe('buildFromMap', () => {
    it('should build registry from v2 multi-series format', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/crossovers', {
        series: [
          { name: 'Batman', publisher: 'DC Comics' },
          { name: 'Superman', publisher: 'DC Comics' },
        ],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);

      expect(registry.getFolders()).toEqual(['/comics/crossovers']);
      expect(registry.getEntriesForFolder('/comics/crossovers')).toHaveLength(2);
    });

    it('should build registry from v1 single-series format', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/batman', {
        seriesName: 'Batman',
        publisher: 'DC Comics',
        startYear: 2016,
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);

      expect(registry.getFolders()).toEqual(['/comics/batman']);
      const entries = registry.getEntriesForFolder('/comics/batman');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.definition.name).toBe('Batman');
    });

    it('should normalize names and aliases', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/batman', {
        series: [
          {
            name: 'Batman (2016)',
            aliases: ['The Batman', 'Dark Knight'],
          },
        ],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const entries = registry.getEntriesForFolder('/comics/batman');

      expect(entries[0]!.normalizedName).toBe('batman');
      expect(entries[0]!.normalizedAliases).toContain('batman');
      expect(entries[0]!.normalizedAliases).toContain('dark knight');
    });

    it('should handle empty series.json map', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);

      expect(registry.getFolders()).toHaveLength(0);
      expect(registry.getTotalSeriesCount()).toBe(0);
    });

    it('should skip folders with no series definitions', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/empty', {} as SeriesMetadata);

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      expect(registry.getFolders()).toHaveLength(0);
    });
  });

  describe('findInFolder', () => {
    let registry: FolderSeriesRegistry;

    beforeEach(() => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/dc', {
        series: [
          {
            name: 'Batman',
            aliases: ['The Dark Knight', 'Caped Crusader'],
            publisher: 'DC Comics',
          },
          {
            name: 'Superman',
            aliases: ['Man of Steel', 'Kal-El'],
            publisher: 'DC Comics',
          },
          {
            name: 'Wonder Woman',
            publisher: 'DC Comics',
          },
        ],
      });

      registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
    });

    it('should return no match for non-existent folder', () => {
      const result = registry.findInFolder('/comics/marvel', 'Batman');
      expect(result.entry).toBeNull();
      expect(result.matchType).toBe('none');
    });

    it('should find exact name match', () => {
      const result = registry.findInFolder('/comics/dc', 'Batman');
      expect(result.entry).not.toBeNull();
      expect(result.entry!.definition.name).toBe('Batman');
      expect(result.matchType).toBe('exact-name');
      expect(result.confidence).toBe(1);
    });

    it('should find exact name match case-insensitively', () => {
      const result = registry.findInFolder('/comics/dc', 'BATMAN');
      expect(result.entry!.definition.name).toBe('Batman');
      expect(result.matchType).toBe('exact-name');
    });

    it('should find exact alias match', () => {
      const result = registry.findInFolder('/comics/dc', 'The Dark Knight');
      expect(result.entry!.definition.name).toBe('Batman');
      expect(result.matchType).toBe('exact-alias');
      expect(result.confidence).toBe(1);
    });

    it('should find exact alias match case-insensitively', () => {
      const result = registry.findInFolder('/comics/dc', 'MAN OF STEEL');
      expect(result.entry!.definition.name).toBe('Superman');
      expect(result.matchType).toBe('exact-alias');
    });

    it('should find fuzzy name match when exact fails', () => {
      const result = registry.findInFolder('/comics/dc', 'Batmans');
      expect(result.entry).not.toBeNull();
      expect(result.entry!.definition.name).toBe('Batman');
      expect(result.matchType).toBe('fuzzy-name');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should return no match when below threshold', () => {
      const result = registry.findInFolder('/comics/dc', 'Aquaman');
      expect(result.entry).toBeNull();
      expect(result.matchType).toBe('none');
    });

    it('should handle name with year suffix', () => {
      const result = registry.findInFolder('/comics/dc', 'Batman (2016)');
      expect(result.entry!.definition.name).toBe('Batman');
    });

    it('should prefer exact match over fuzzy', () => {
      const result = registry.findInFolder('/comics/dc', 'Superman');
      expect(result.matchType).toBe('exact-name');
      expect(result.confidence).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();

      // Multi-series folder
      seriesJsonMap.set('/comics/crossovers', {
        series: [
          { name: 'Batman' },
          { name: 'Superman' },
          { name: 'Wonder Woman' },
        ],
      });

      // Single-series folder
      seriesJsonMap.set('/comics/batman', {
        seriesName: 'Batman',
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const stats = registry.getStats();

      expect(stats.folders).toBe(2);
      expect(stats.series).toBe(4);
      expect(stats.multiSeriesFolders).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle series with empty aliases array', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/test', {
        series: [{ name: 'Batman', aliases: [] }],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const entries = registry.getEntriesForFolder('/comics/test');

      expect(entries[0]!.normalizedAliases).toHaveLength(0);
    });

    it('should handle series with undefined aliases', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/test', {
        series: [{ name: 'Batman' }],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const entries = registry.getEntriesForFolder('/comics/test');

      expect(entries[0]!.normalizedAliases).toHaveLength(0);
    });

    it('should filter out empty alias strings', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/test', {
        series: [{ name: 'Batman', aliases: ['', 'Dark Knight', '  '] }],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const entries = registry.getEntriesForFolder('/comics/test');

      expect(entries[0]!.normalizedAliases).toContain('dark knight');
      expect(entries[0]!.normalizedAliases).not.toContain('');
    });

    it('should handle hasFolder check', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/batman', { seriesName: 'Batman' });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);

      expect(registry.hasFolder('/comics/batman')).toBe(true);
      expect(registry.hasFolder('/comics/superman')).toBe(false);
    });

    it('should handle ambiguous matches correctly', () => {
      const seriesJsonMap = new Map<string, SeriesMetadata>();
      seriesJsonMap.set('/comics/spider', {
        series: [
          { name: 'Spider-Man' },
          { name: 'Spider-Woman' },
          { name: 'Spider-Gwen' },
        ],
      });

      const registry = FolderSeriesRegistry.buildFromMap(seriesJsonMap);
      const result = registry.findInFolder('/comics/spider', 'Spiderman');

      // Should find Spider-Man as best match
      expect(result.entry).not.toBeNull();
      expect(result.entry!.definition.name).toBe('Spider-Man');
    });
  });
});
