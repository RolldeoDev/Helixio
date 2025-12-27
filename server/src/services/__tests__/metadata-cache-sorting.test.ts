/**
 * Metadata Cache Sorting Tests
 *
 * Tests that verify issueNumberSort is correctly computed and stored
 * when metadata is cached from ComicInfo.xml or API sources.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeIssueNumberSort, withIssueNumberSort } from '../issue-number-utils.js';

// =============================================================================
// issueNumberSort Sync Tests
// =============================================================================

describe('issueNumberSort synchronization', () => {
  describe('withIssueNumberSort utility', () => {
    it('should return correct sort key for simple numbers', () => {
      expect(withIssueNumberSort('1')).toEqual({ number: '1', issueNumberSort: 1 });
      expect(withIssueNumberSort('10')).toEqual({ number: '10', issueNumberSort: 10 });
      expect(withIssueNumberSort('100')).toEqual({ number: '100', issueNumberSort: 100 });
    });

    it('should return correct sort key for decimal numbers', () => {
      expect(withIssueNumberSort('1.5')).toEqual({ number: '1.5', issueNumberSort: 1.5 });
      expect(withIssueNumberSort('2.1')).toEqual({ number: '2.1', issueNumberSort: 2.1 });
    });

    it('should extract number from text-prefixed issues', () => {
      expect(withIssueNumberSort('Annual 1')).toEqual({ number: 'Annual 1', issueNumberSort: 1 });
      expect(withIssueNumberSort('Issue #5')).toEqual({ number: 'Issue #5', issueNumberSort: 5 });
    });

    it('should return null sort key for non-numeric issues', () => {
      expect(withIssueNumberSort('Special')).toEqual({ number: 'Special', issueNumberSort: null });
      expect(withIssueNumberSort('Preview')).toEqual({ number: 'Preview', issueNumberSort: null });
    });

    it('should handle null input', () => {
      expect(withIssueNumberSort(null)).toEqual({ number: null, issueNumberSort: null });
      expect(withIssueNumberSort(undefined)).toEqual({ number: null, issueNumberSort: null });
    });

    it('should handle leading zeros', () => {
      expect(withIssueNumberSort('001')).toEqual({ number: '001', issueNumberSort: 1 });
      expect(withIssueNumberSort('015')).toEqual({ number: '015', issueNumberSort: 15 });
    });
  });

  describe('computeIssueNumberSort utility', () => {
    it('should compute correct numeric values', () => {
      expect(computeIssueNumberSort('1')).toBe(1);
      expect(computeIssueNumberSort('10')).toBe(10);
      expect(computeIssueNumberSort('100')).toBe(100);
      expect(computeIssueNumberSort('1.5')).toBe(1.5);
    });

    it('should return null for non-numeric values', () => {
      expect(computeIssueNumberSort('Special')).toBeNull();
      expect(computeIssueNumberSort(null)).toBeNull();
      expect(computeIssueNumberSort(undefined)).toBeNull();
    });
  });
});

// =============================================================================
// Metadata Write Simulation Tests
// =============================================================================

describe('metadata write point simulations', () => {
  /**
   * These tests simulate how the metadata services should include
   * issueNumberSort when writing to the database.
   */

  describe('cacheFileMetadata simulation', () => {
    interface MockComicInfo {
      Series?: string;
      Number?: string;
      Title?: string;
    }

    interface MockMetadataData {
      series: string | null;
      number: string | null;
      issueNumberSort: number | null;
      title: string | null;
    }

    const simulateCacheFileMetadata = (comicInfo: MockComicInfo): MockMetadataData => {
      const issueNumber = comicInfo.Number || null;
      return {
        series: comicInfo.Series || null,
        number: issueNumber,
        issueNumberSort: computeIssueNumberSort(issueNumber),
        title: comicInfo.Title || null,
      };
    };

    it('should include issueNumberSort when caching metadata', () => {
      const comicInfo = { Series: 'Batman', Number: '42', Title: 'The Dark Knight' };
      const metadataData = simulateCacheFileMetadata(comicInfo);

      expect(metadataData).toEqual({
        series: 'Batman',
        number: '42',
        issueNumberSort: 42,
        title: 'The Dark Knight',
      });
    });

    it('should handle missing number', () => {
      const comicInfo = { Series: 'Batman', Title: 'Special Issue' };
      const metadataData = simulateCacheFileMetadata(comicInfo);

      expect(metadataData).toEqual({
        series: 'Batman',
        number: null,
        issueNumberSort: null,
        title: 'Special Issue',
      });
    });

    it('should handle Annual issues with numbers', () => {
      const comicInfo = { Series: 'Batman', Number: 'Annual 2023', Title: 'Annual Issue' };
      const metadataData = simulateCacheFileMetadata(comicInfo);

      expect(metadataData).toEqual({
        series: 'Batman',
        number: 'Annual 2023',
        issueNumberSort: 2023,
        title: 'Annual Issue',
      });
    });

    it('should handle decimal issue numbers', () => {
      const comicInfo = { Series: 'Spider-Man', Number: '1.5', Title: 'Point Five Issue' };
      const metadataData = simulateCacheFileMetadata(comicInfo);

      expect(metadataData).toEqual({
        series: 'Spider-Man',
        number: '1.5',
        issueNumberSort: 1.5,
        title: 'Point Five Issue',
      });
    });
  });

  describe('issue-metadata-fetch simulation', () => {
    it('should update issueNumberSort when number field is updated', () => {
      const selectedFields = ['number', 'title'];
      const proposedMetadata = { number: '42', title: 'New Title' };
      const metadataUpdate: Record<string, unknown> = {};

      // Simulate the logic from issue-metadata-fetch.service.ts
      for (const fieldName of selectedFields) {
        const value = proposedMetadata[fieldName as keyof typeof proposedMetadata];
        if (value !== undefined && value !== null) {
          metadataUpdate[fieldName] = value;
          if (fieldName === 'number') {
            metadataUpdate.issueNumberSort = computeIssueNumberSort(value as string);
          }
        }
      }

      expect(metadataUpdate).toEqual({
        number: '42',
        issueNumberSort: 42,
        title: 'New Title',
      });
    });

    it('should not add issueNumberSort when number is not in selected fields', () => {
      const selectedFields = ['title', 'summary'];
      const proposedMetadata = { title: 'New Title', summary: 'A summary' };
      const metadataUpdate: Record<string, unknown> = {};

      for (const fieldName of selectedFields) {
        const value = proposedMetadata[fieldName as keyof typeof proposedMetadata];
        if (value !== undefined && value !== null) {
          metadataUpdate[fieldName] = value;
          if (fieldName === 'number') {
            metadataUpdate.issueNumberSort = computeIssueNumberSort(value as string);
          }
        }
      }

      expect(metadataUpdate).toEqual({
        title: 'New Title',
        summary: 'A summary',
      });
      expect(metadataUpdate.issueNumberSort).toBeUndefined();
    });
  });

  describe('rollback simulation', () => {
    interface MockOriginalMetadata {
      Series?: unknown;
      Number?: unknown;
      Title?: unknown;
    }

    it('should include issueNumberSort when rolling back metadata', () => {
      const originalMetadata: MockOriginalMetadata = {
        Series: 'Batman',
        Number: '42',
        Title: 'Original Title',
      };

      const issueNumber = originalMetadata.Number as string | undefined;
      const rollbackData = {
        series: originalMetadata.Series as string | undefined,
        number: issueNumber,
        issueNumberSort: computeIssueNumberSort(issueNumber),
        title: originalMetadata.Title as string | undefined,
      };

      expect(rollbackData).toEqual({
        series: 'Batman',
        number: '42',
        issueNumberSort: 42,
        title: 'Original Title',
      });
    });
  });
});

// =============================================================================
// Backfill Script Logic Tests
// =============================================================================

describe('backfill script logic', () => {
  interface MockFileMetadata {
    id: string;
    number: string | null;
    issueNumberSort: number | null;
  }

  it('should compute sort key for records with number but no issueNumberSort', () => {
    const recordsToBackfill: MockFileMetadata[] = [
      { id: 'f1', number: '1', issueNumberSort: null },
      { id: 'f2', number: '10', issueNumberSort: null },
      { id: 'f3', number: '100', issueNumberSort: null },
      { id: 'f4', number: 'Special', issueNumberSort: null },
    ];

    const processedRecords = recordsToBackfill.map((record) => ({
      ...record,
      issueNumberSort: computeIssueNumberSort(record.number),
    }));

    expect(processedRecords).toEqual([
      { id: 'f1', number: '1', issueNumberSort: 1 },
      { id: 'f2', number: '10', issueNumberSort: 10 },
      { id: 'f3', number: '100', issueNumberSort: 100 },
      { id: 'f4', number: 'Special', issueNumberSort: null },
    ]);
  });

  it('should skip records without a number field', () => {
    const records: MockFileMetadata[] = [
      { id: 'f1', number: null, issueNumberSort: null },
      { id: 'f2', number: '1', issueNumberSort: null },
    ];

    // Filter records that need processing (have number but no issueNumberSort)
    const recordsToProcess = records.filter(
      (r) => r.number !== null && r.issueNumberSort === null
    );

    expect(recordsToProcess).toHaveLength(1);
    expect(recordsToProcess[0]!.id).toBe('f2');
  });

  it('should correctly categorize updated vs skipped records', () => {
    const records: MockFileMetadata[] = [
      { id: 'f1', number: '1', issueNumberSort: null },
      { id: 'f2', number: 'Special', issueNumberSort: null },
      { id: 'f3', number: '10', issueNumberSort: null },
    ];

    let updated = 0;
    let skipped = 0;

    for (const record of records) {
      const sortKey = computeIssueNumberSort(record.number);
      if (sortKey !== null) {
        updated++;
      } else {
        skipped++;
      }
    }

    expect(updated).toBe(2); // '1' and '10'
    expect(skipped).toBe(1); // 'Special'
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('edge cases and error handling', () => {
  it('should handle empty string number', () => {
    expect(computeIssueNumberSort('')).toBeNull();
  });

  it('should handle whitespace-only number', () => {
    expect(computeIssueNumberSort('   ')).toBeNull();
  });

  it('should handle number with only special characters', () => {
    expect(computeIssueNumberSort('###')).toBeNull();
    expect(computeIssueNumberSort('!!!')).toBeNull();
  });

  it('should handle very large numbers', () => {
    expect(computeIssueNumberSort('9999')).toBe(9999);
    expect(computeIssueNumberSort('99999')).toBe(99999);
  });

  it('should handle negative numbers', () => {
    expect(computeIssueNumberSort('-1')).toBe(-1);
    expect(computeIssueNumberSort('-0.5')).toBe(-0.5);
  });

  it('should handle zero', () => {
    expect(computeIssueNumberSort('0')).toBe(0);
    expect(computeIssueNumberSort('0.0')).toBe(0);
  });

  it('should handle scientific notation', () => {
    // Note: parseFloat handles scientific notation
    expect(computeIssueNumberSort('1e2')).toBe(100);
  });

  it('should handle Unicode numbers', () => {
    // Arabic-Indic digits - parseFloat won't handle these
    expect(computeIssueNumberSort('٤٢')).toBeNull(); // Arabic for "42"
  });
});
