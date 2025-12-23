/**
 * Metadata Merge Service Tests
 *
 * Comprehensive tests for the metadata merging system including:
 * - Series metadata merging with priority ordering
 * - Issue metadata merging
 * - All-values merge for per-field source selection
 * - Field overrides
 * - Edge cases and empty values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MetadataMergeService,
  mergeSeries,
  mergeIssue,
  mergeSeriesWithAllValues,
  mergeIssueWithAllValues,
  applyFieldOverrides,
  findBestMatch,
} from '../metadata-merge.service.js';
import type {
  SeriesMetadata,
  IssueMetadata,
  MetadataSource,
  MergedSeriesMetadata,
  MergedIssueMetadata,
} from '../metadata-providers/types.js';

// =============================================================================
// Mock config service
// =============================================================================

vi.mock('../config.service.js', () => ({
  getMetadataSettings: vi.fn(() => ({
    primarySource: 'comicvine',
    sourcePriority: ['comicvine', 'metron', 'gcd'],
  })),
}));

// =============================================================================
// Test Utilities
// =============================================================================

function createMockSeries(
  source: MetadataSource,
  overrides: Partial<SeriesMetadata> = {}
): SeriesMetadata {
  return {
    source,
    sourceId: `${source}-123`,
    name: 'Batman',
    publisher: 'DC Comics',
    startYear: 2011,
    issueCount: 52,
    description: 'The Dark Knight',
    url: `https://${source}.com/batman`,
    aliases: [],
    creators: [],
    ...overrides,
  };
}

function createMockIssue(
  source: MetadataSource,
  overrides: Partial<IssueMetadata> = {}
): IssueMetadata {
  return {
    source,
    sourceId: `${source}-issue-1`,
    seriesId: `${source}-123`,
    seriesName: 'Batman',
    number: '1',
    title: 'I Am Gotham, Part One',
    coverDate: '2016-08',
    description: 'First issue',
    writer: 'Tom King',
    penciller: 'David Finch',
    ...overrides,
  };
}

// =============================================================================
// Series Merge Tests
// =============================================================================

describe('Metadata Merge Service', () => {
  describe('mergeSeries', () => {
    it('should return null when no sources have data', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set('comicvine', null);
      results.set('metron', null);

      const merged = mergeSeries(results);
      expect(merged).toBeNull();
    });

    it('should use single source when only one has data', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set('comicvine', createMockSeries('comicvine', { name: 'Batman' }));
      results.set('metron', null);

      const merged = mergeSeries(results);
      expect(merged).not.toBeNull();
      expect(merged?.name).toBe('Batman');
      expect(merged?.source).toBe('comicvine');
      expect(merged?.fieldSources.name).toBe('comicvine');
    });

    it('should respect priority order for non-empty values', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          description: '', // Empty - should fall through
          publisher: 'DC Comics',
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          description: 'A dark tale of justice', // Non-empty
          publisher: 'DC',
        })
      );

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged).not.toBeNull();
      // Publisher comes from comicvine (higher priority, non-empty)
      expect(merged?.publisher).toBe('DC Comics');
      expect(merged?.fieldSources.publisher).toBe('comicvine');
      // Description falls through to metron since comicvine is empty
      expect(merged?.description).toBe('A dark tale of justice');
      expect(merged?.fieldSources.description).toBe('metron');
    });

    it('should handle sources not in priority order', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set('gcd', createMockSeries('gcd', { name: 'Batman from GCD' }));
      // gcd is not in the mock priority order, should still be included

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged).not.toBeNull();
      expect(merged?.name).toBe('Batman from GCD');
      expect(merged?.source).toBe('gcd');
    });

    it('should track contributing sources', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          name: 'Batman',
          description: '',
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          name: '',
          description: 'Dark Knight stories',
        })
      );

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.contributingSources).toContain('comicvine');
      expect(merged?.contributingSources).toContain('metron');
    });

    it('should handle array fields correctly', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          creators: [], // Empty array
          characters: [{ id: 1, name: 'Batman' }, { id: 2, name: 'Robin' }],
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          creators: [{ id: 1, name: 'Scott Snyder' }],
          characters: [{ id: 3, name: 'The Joker' }],
        })
      );

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      // Characters from comicvine (non-empty, higher priority)
      expect(merged?.characters).toEqual([{ id: 1, name: 'Batman' }, { id: 2, name: 'Robin' }]);
      expect(merged?.fieldSources.characters).toBe('comicvine');

      // Creators falls through to metron (comicvine was empty)
      expect(merged?.creators).toEqual([{ id: 1, name: 'Scott Snyder' }]);
      expect(merged?.fieldSources.creators).toBe('metron');
    });

    it('should handle undefined vs null vs empty string correctly', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          description: undefined,
          shortDescription: null as unknown as string,
          coverUrl: '',
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          description: 'Metron description',
          shortDescription: 'Short desc',
          coverUrl: 'https://metron.com/cover.jpg',
        })
      );

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      // All should fall through to metron
      expect(merged?.description).toBe('Metron description');
      expect(merged?.shortDescription).toBe('Short desc');
      expect(merged?.coverUrl).toBe('https://metron.com/cover.jpg');
    });
  });

  // =============================================================================
  // Issue Merge Tests
  // =============================================================================

  describe('mergeIssue', () => {
    it('should return null when no sources have data', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set('comicvine', null);

      const merged = mergeIssue(results);
      expect(merged).toBeNull();
    });

    it('should merge issue scalar fields with priority', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set(
        'comicvine',
        createMockIssue('comicvine', {
          writer: 'Tom King',
          penciller: '', // Empty
          colorist: '',
        })
      );
      results.set(
        'metron',
        createMockIssue('metron', {
          writer: 'Thomas King',
          penciller: 'David Finch',
          colorist: 'Jordie Bellaire',
        })
      );

      const merged = mergeIssue(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.writer).toBe('Tom King');
      expect(merged?.fieldSources.writer).toBe('comicvine');

      expect(merged?.penciller).toBe('David Finch');
      expect(merged?.fieldSources.penciller).toBe('metron');

      expect(merged?.colorist).toBe('Jordie Bellaire');
      expect(merged?.fieldSources.colorist).toBe('metron');
    });

    it('should preserve seriesId from primary source', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set(
        'comicvine',
        createMockIssue('comicvine', { seriesId: 'cv-series-123' })
      );
      results.set(
        'metron',
        createMockIssue('metron', { seriesId: 'mt-series-456' })
      );

      const merged = mergeIssue(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.seriesId).toBe('cv-series-123');
      expect(merged?.source).toBe('comicvine');
    });

    it('should handle issue array fields', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set(
        'comicvine',
        createMockIssue('comicvine', {
          characters: ['Batman', 'Robin'],
          teams: [],
        })
      );
      results.set(
        'metron',
        createMockIssue('metron', {
          characters: ['Bruce Wayne'],
          teams: ['Justice League'],
        })
      );

      const merged = mergeIssue(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.characters).toEqual(['Batman', 'Robin']);
      expect(merged?.teams).toEqual(['Justice League']);
    });
  });

  // =============================================================================
  // All-Values Merge Tests
  // =============================================================================

  describe('mergeSeriesWithAllValues', () => {
    it('should include allFieldValues for all sources', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          publisher: 'DC Comics',
          startYear: 2011,
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          publisher: 'DC',
          startYear: 2011,
        })
      );

      const merged = mergeSeriesWithAllValues(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.allFieldValues).toBeDefined();
      expect(merged?.allFieldValues.publisher).toEqual({
        comicvine: 'DC Comics',
        metron: 'DC',
      });
      expect(merged?.allFieldValues.startYear).toEqual({
        comicvine: 2011,
        metron: 2011,
      });
    });

    it('should handle null values in allFieldValues', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          publisher: 'DC Comics',
          endYear: undefined,
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          publisher: 'DC',
          endYear: 2016,
        })
      );

      const merged = mergeSeriesWithAllValues(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.allFieldValues.endYear?.comicvine).toBeNull();
      expect(merged?.allFieldValues.endYear?.metron).toBe(2016);
    });

    it('should apply field overrides', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          publisher: 'DC Comics',
          description: 'ComicVine description',
        })
      );
      results.set(
        'metron',
        createMockSeries('metron', {
          publisher: 'DC',
          description: 'Metron description',
        })
      );

      const merged = mergeSeriesWithAllValues(results, {
        priorityOrder: ['comicvine', 'metron'],
        fieldOverrides: {
          publisher: 'metron',
        },
      });

      // Publisher should come from metron due to override
      expect(merged?.publisher).toBe('DC');
      expect(merged?.fieldSources.publisher).toBe('metron');

      // Description still from comicvine (no override)
      expect(merged?.description).toBe('ComicVine description');
      expect(merged?.fieldSources.description).toBe('comicvine');
    });

    it('should store fieldSourceOverrides', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set('comicvine', createMockSeries('comicvine'));

      const overrides = { publisher: 'metron' as MetadataSource };
      const merged = mergeSeriesWithAllValues(results, {
        fieldOverrides: overrides,
      });

      expect(merged?.fieldSourceOverrides).toEqual(overrides);
    });
  });

  describe('mergeIssueWithAllValues', () => {
    it('should include allFieldValues for issue fields', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set(
        'comicvine',
        createMockIssue('comicvine', {
          writer: 'Tom King',
          colorist: 'Jordie Bellaire',
        })
      );
      results.set(
        'metron',
        createMockIssue('metron', {
          writer: 'Tom King',
          colorist: 'J. Bellaire',
        })
      );

      const merged = mergeIssueWithAllValues(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      expect(merged?.allFieldValues).toBeDefined();
      expect(merged?.allFieldValues.writer).toEqual({
        comicvine: 'Tom King',
        metron: 'Tom King',
      });
      expect(merged?.allFieldValues.colorist).toEqual({
        comicvine: 'Jordie Bellaire',
        metron: 'J. Bellaire',
      });
    });

    it('should apply field overrides for issues', () => {
      const results = new Map<MetadataSource, IssueMetadata | null>();
      results.set(
        'comicvine',
        createMockIssue('comicvine', { colorist: 'Jordie Bellaire' })
      );
      results.set(
        'metron',
        createMockIssue('metron', { colorist: 'J. Bellaire' })
      );

      const merged = mergeIssueWithAllValues(results, {
        priorityOrder: ['comicvine', 'metron'],
        fieldOverrides: { colorist: 'metron' },
      });

      expect(merged?.colorist).toBe('J. Bellaire');
      expect(merged?.fieldSources.colorist).toBe('metron');
    });
  });

  // =============================================================================
  // Apply Field Overrides Tests
  // =============================================================================

  describe('applyFieldOverrides', () => {
    it('should update merged result with new field sources', () => {
      const merged: MergedSeriesMetadata = {
        source: 'comicvine',
        sourceId: 'cv-123',
        name: 'Batman',
        publisher: 'DC Comics',
        startYear: 2011,
        issueCount: 52,
        url: 'https://example.com',
        aliases: [],
        creators: [],
        fieldSources: {
          publisher: 'comicvine',
          description: 'comicvine',
        },
        contributingSources: ['comicvine', 'metron'],
      };

      const allFieldValues: Record<string, Record<MetadataSource, unknown>> = {
        publisher: {
          comicvine: 'DC Comics',
          metron: 'DC',
          gcd: null,
          anilist: null,
          mal: null,
        },
        description: {
          comicvine: 'ComicVine desc',
          metron: 'Metron desc',
          gcd: null,
          anilist: null,
          mal: null,
        },
      };

      const updated = applyFieldOverrides(merged, allFieldValues, {
        publisher: 'metron',
      });

      expect(updated.publisher).toBe('DC');
      expect(updated.fieldSources.publisher).toBe('metron');
      // Original unchanged for non-overridden fields
      expect(updated.fieldSources.description).toBe('comicvine');
    });

    it('should not apply override if value is empty', () => {
      const merged: MergedSeriesMetadata = {
        source: 'comicvine',
        sourceId: 'cv-123',
        name: 'Batman',
        publisher: 'DC Comics',
        startYear: 2011,
        issueCount: 52,
        url: 'https://example.com',
        aliases: [],
        creators: [],
        fieldSources: { publisher: 'comicvine' },
        contributingSources: ['comicvine'],
      };

      const allFieldValues: Record<string, Record<MetadataSource, unknown>> = {
        publisher: {
          comicvine: 'DC Comics',
          metron: '', // Empty value
          gcd: null,
          anilist: null,
          mal: null,
        },
      };

      const updated = applyFieldOverrides(merged, allFieldValues, {
        publisher: 'metron',
      });

      // Should keep original since metron value is empty
      expect(updated.publisher).toBe('DC Comics');
      expect(updated.fieldSources.publisher).toBe('comicvine');
    });
  });

  // =============================================================================
  // Find Best Match Tests
  // =============================================================================

  describe('findBestMatch', () => {
    it('should return null for empty candidates', () => {
      const target = createMockSeries('comicvine', { name: 'Batman' });
      const result = findBestMatch(target, []);
      expect(result).toBeNull();
    });

    it('should find exact name match', () => {
      const target = createMockSeries('comicvine', { name: 'Batman' });
      const candidates = [
        createMockSeries('metron', { name: 'Superman', sourceId: 'm-1' }),
        createMockSeries('metron', { name: 'Batman', sourceId: 'm-2' }),
        createMockSeries('metron', { name: 'Wonder Woman', sourceId: 'm-3' }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result?.sourceId).toBe('m-2');
    });

    it('should prefer year match when names are similar', () => {
      const target = createMockSeries('comicvine', {
        name: 'Batman',
        startYear: 2016,
      });
      const candidates = [
        createMockSeries('metron', {
          name: 'Batman',
          startYear: 2011,
          sourceId: 'm-1',
        }),
        createMockSeries('metron', {
          name: 'Batman',
          startYear: 2016,
          sourceId: 'm-2',
        }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result?.sourceId).toBe('m-2');
    });

    it('should handle partial name matches', () => {
      const target = createMockSeries('comicvine', { name: 'Batman' });
      const candidates = [
        createMockSeries('metron', {
          name: 'Batman: The Dark Knight',
          sourceId: 'm-1',
        }),
        createMockSeries('metron', { name: 'Superman', sourceId: 'm-2' }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result?.sourceId).toBe('m-1');
    });

    it('should consider publisher in scoring', () => {
      const target = createMockSeries('comicvine', {
        name: 'The Flash',
        publisher: 'DC Comics',
      });
      const candidates = [
        createMockSeries('metron', {
          name: 'The Flash',
          publisher: 'Marvel',
          sourceId: 'm-1',
        }),
        createMockSeries('metron', {
          name: 'The Flash',
          publisher: 'DC',
          sourceId: 'm-2',
        }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result?.sourceId).toBe('m-2');
    });

    it('should return null for no good matches', () => {
      const target = createMockSeries('comicvine', {
        name: 'Batman',
        publisher: 'DC Comics',
      });
      const candidates = [
        createMockSeries('metron', {
          name: 'Spider-Man',
          publisher: 'Marvel',
          sourceId: 'm-1',
        }),
        createMockSeries('metron', {
          name: 'Captain America',
          publisher: 'Marvel',
          sourceId: 'm-2',
        }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result).toBeNull();
    });

    it('should normalize names for comparison', () => {
      const target = createMockSeries('comicvine', { name: 'The Amazing Spider-Man' });
      const candidates = [
        createMockSeries('metron', {
          name: 'amazing spiderman',
          sourceId: 'm-1',
        }),
      ];

      const result = findBestMatch(target, candidates);
      expect(result?.sourceId).toBe('m-1');
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle single source with all fields populated', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', {
          name: 'Batman',
          publisher: 'DC Comics',
          startYear: 2011,
          endYear: 2016,
          issueCount: 52,
          description: 'Dark Knight adventures',
          shortDescription: 'Batman comic',
          coverUrl: 'https://example.com/cover.jpg',
          creators: [{ id: 1, name: 'Scott Snyder' }],
          characters: [{ id: 1, name: 'Batman' }, { id: 2, name: 'Robin' }],
        })
      );

      const merged = mergeSeries(results);

      expect(merged?.name).toBe('Batman');
      expect(merged?.contributingSources).toEqual(['comicvine']);
      expect(Object.values(merged?.fieldSources || {}).every(s => s === 'comicvine')).toBe(true);
    });

    it('should handle all sources having empty values for a field', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set(
        'comicvine',
        createMockSeries('comicvine', { shortDescription: '' })
      );
      results.set(
        'metron',
        createMockSeries('metron', { shortDescription: undefined })
      );

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron'],
      });

      // shortDescription should not have a fieldSource entry since no source had a value
      expect(merged?.fieldSources.shortDescription).toBeUndefined();
    });

    it('should handle mixed null and populated sources', () => {
      const results = new Map<MetadataSource, SeriesMetadata | null>();
      results.set('comicvine', null);
      results.set(
        'metron',
        createMockSeries('metron', { name: 'Batman', publisher: 'DC' })
      );
      results.set('gcd', null);

      const merged = mergeSeries(results, {
        priorityOrder: ['comicvine', 'metron', 'gcd'],
      });

      expect(merged?.source).toBe('metron');
      expect(merged?.name).toBe('Batman');
      expect(merged?.contributingSources).toEqual(['metron']);
    });
  });
});
