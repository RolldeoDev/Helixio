import { describe, it, expect } from 'vitest';
import {
  parseIssueNumber,
  computeIssueNumberSort,
  withIssueNumberSort,
} from '../issue-number-utils.js';

describe('parseIssueNumber', () => {
  describe('null/undefined handling', () => {
    it('returns null for null input', () => {
      expect(parseIssueNumber(null)).toEqual({ numericValue: null, hasNumber: false });
    });

    it('returns null for undefined input', () => {
      expect(parseIssueNumber(undefined)).toEqual({ numericValue: null, hasNumber: false });
    });

    it('returns null for empty string', () => {
      expect(parseIssueNumber('')).toEqual({ numericValue: null, hasNumber: false });
    });
  });

  describe('simple integers', () => {
    it('parses "1"', () => {
      expect(parseIssueNumber('1')).toEqual({ numericValue: 1, hasNumber: true });
    });

    it('parses "10"', () => {
      expect(parseIssueNumber('10')).toEqual({ numericValue: 10, hasNumber: true });
    });

    it('parses "100"', () => {
      expect(parseIssueNumber('100')).toEqual({ numericValue: 100, hasNumber: true });
    });

    it('parses "001" with leading zeros', () => {
      expect(parseIssueNumber('001')).toEqual({ numericValue: 1, hasNumber: true });
    });

    it('parses "015" with leading zeros', () => {
      expect(parseIssueNumber('015')).toEqual({ numericValue: 15, hasNumber: true });
    });
  });

  describe('decimal numbers', () => {
    it('parses "1.5"', () => {
      expect(parseIssueNumber('1.5')).toEqual({ numericValue: 1.5, hasNumber: true });
    });

    it('parses "2.1"', () => {
      expect(parseIssueNumber('2.1')).toEqual({ numericValue: 2.1, hasNumber: true });
    });

    it('parses "10.5"', () => {
      expect(parseIssueNumber('10.5')).toEqual({ numericValue: 10.5, hasNumber: true });
    });
  });

  describe('text with embedded numbers', () => {
    it('extracts number from "Annual 1"', () => {
      expect(parseIssueNumber('Annual 1')).toEqual({ numericValue: 1, hasNumber: true });
    });

    it('extracts number from "Issue #5"', () => {
      expect(parseIssueNumber('Issue #5')).toEqual({ numericValue: 5, hasNumber: true });
    });

    it('extracts first number from "Vol. 2 #10"', () => {
      expect(parseIssueNumber('Vol. 2 #10')).toEqual({ numericValue: 2, hasNumber: true });
    });

    it('extracts number from "Special 2023"', () => {
      expect(parseIssueNumber('Special 2023')).toEqual({ numericValue: 2023, hasNumber: true });
    });

    it('extracts number from "#42"', () => {
      expect(parseIssueNumber('#42')).toEqual({ numericValue: 42, hasNumber: true });
    });
  });

  describe('non-numeric strings', () => {
    it('returns null for "Annual"', () => {
      expect(parseIssueNumber('Annual')).toEqual({ numericValue: null, hasNumber: false });
    });

    it('returns null for "Special"', () => {
      expect(parseIssueNumber('Special')).toEqual({ numericValue: null, hasNumber: false });
    });

    it('returns null for "Preview"', () => {
      expect(parseIssueNumber('Preview')).toEqual({ numericValue: null, hasNumber: false });
    });

    it('returns null for "Prologue"', () => {
      expect(parseIssueNumber('Prologue')).toEqual({ numericValue: null, hasNumber: false });
    });
  });
});

describe('computeIssueNumberSort', () => {
  it('returns numeric value for simple numbers', () => {
    expect(computeIssueNumberSort('1')).toBe(1);
    expect(computeIssueNumberSort('10')).toBe(10);
    expect(computeIssueNumberSort('100')).toBe(100);
  });

  it('returns numeric value for decimals', () => {
    expect(computeIssueNumberSort('1.5')).toBe(1.5);
    expect(computeIssueNumberSort('2.1')).toBe(2.1);
  });

  it('returns null for null/undefined input', () => {
    expect(computeIssueNumberSort(null)).toBeNull();
    expect(computeIssueNumberSort(undefined)).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(computeIssueNumberSort('Special')).toBeNull();
    expect(computeIssueNumberSort('Annual')).toBeNull();
  });

  it('extracts number from text with numbers', () => {
    expect(computeIssueNumberSort('Annual 1')).toBe(1);
    expect(computeIssueNumberSort('Issue #5')).toBe(5);
  });
});

describe('withIssueNumberSort', () => {
  it('returns both number and sort key for numeric input', () => {
    expect(withIssueNumberSort('5')).toEqual({
      number: '5',
      issueNumberSort: 5,
    });
  });

  it('returns both number and sort key for decimal input', () => {
    expect(withIssueNumberSort('1.5')).toEqual({
      number: '1.5',
      issueNumberSort: 1.5,
    });
  });

  it('returns null for both fields when input is null', () => {
    expect(withIssueNumberSort(null)).toEqual({
      number: null,
      issueNumberSort: null,
    });
  });

  it('returns null for both fields when input is undefined', () => {
    expect(withIssueNumberSort(undefined)).toEqual({
      number: null,
      issueNumberSort: null,
    });
  });

  it('preserves original string and extracts sort key for text with number', () => {
    expect(withIssueNumberSort('Annual 1')).toEqual({
      number: 'Annual 1',
      issueNumberSort: 1,
    });
  });

  it('preserves original string and returns null sort key for non-numeric', () => {
    expect(withIssueNumberSort('Special')).toEqual({
      number: 'Special',
      issueNumberSort: null,
    });
  });
});

describe('sorting behavior', () => {
  // Helper function that simulates database sorting behavior
  const sortByIssueNumber = (issues: string[]) => {
    return [...issues].sort((a, b) => {
      const aSort = computeIssueNumberSort(a) ?? Infinity;
      const bSort = computeIssueNumberSort(b) ?? Infinity;
      if (aSort !== bSort) return aSort - bSort;
      // Secondary sort by string for ties and non-numeric
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  describe('basic numeric sorting', () => {
    it('sorts issues correctly when using numeric values', () => {
      const issues = ['1', '2', '10', '100', '1.5', '9'];
      expect(sortByIssueNumber(issues)).toEqual(['1', '1.5', '2', '9', '10', '100']);
    });

    it('handles leading zeros correctly', () => {
      const issues = ['015', '02', '100', '1', '9'];
      expect(sortByIssueNumber(issues)).toEqual(['1', '02', '9', '015', '100']);
    });

    it('sorts decimal issues in correct order', () => {
      const issues = ['1', '1.1', '1.2', '1.5', '2'];
      expect(sortByIssueNumber(issues)).toEqual(['1', '1.1', '1.2', '1.5', '2']);
    });

    it('sorts three-digit issues correctly', () => {
      const issues = ['100', '101', '99', '200', '50'];
      expect(sortByIssueNumber(issues)).toEqual(['50', '99', '100', '101', '200']);
    });
  });

  describe('mixed numeric and non-numeric', () => {
    it('sorts mixed numeric and non-numeric issues', () => {
      const issues = ['1', 'Special', '2', 'Annual', '10'];
      // Numeric issues first, then non-numeric (sorted alphabetically)
      expect(sortByIssueNumber(issues)).toEqual(['1', '2', '10', 'Annual', 'Special']);
    });

    it('handles Annual issues with numbers', () => {
      const issues = ['1', 'Annual 1', '2', 'Annual 2', '3'];
      // All have numeric values, so sorted by extracted number
      expect(sortByIssueNumber(issues)).toEqual(['1', 'Annual 1', '2', 'Annual 2', '3']);
    });

    it('handles issues with only text (no numbers)', () => {
      const issues = ['Prologue', 'Epilogue', 'Preview', 'Bonus'];
      // All non-numeric, sorted alphabetically
      expect(sortByIssueNumber(issues)).toEqual(['Bonus', 'Epilogue', 'Preview', 'Prologue']);
    });
  });

  describe('real-world comic series scenarios', () => {
    it('sorts a typical long-running series correctly', () => {
      // The original bug: string sorting puts "100" before "9"
      const issues = ['1', '5', '9', '10', '50', '99', '100', '101'];
      expect(sortByIssueNumber(issues)).toEqual(['1', '5', '9', '10', '50', '99', '100', '101']);
    });

    it('handles variant/decimal issues in a series', () => {
      const issues = ['1', '1.1', '1.MU', '2', '2.1', '3'];
      // 1.MU will be parsed as 1, same as issue 1
      const sorted = sortByIssueNumber(issues);
      expect(sorted[0]).toBe('1');
      // 1.MU is parsed as 1, so it ties with '1' and sort order depends on localeCompare
      // Both 1.1 and 1.MU come after '1', the order between them depends on numeric parsing
      expect(sorted.includes('1.MU')).toBe(true);
      expect(sorted.includes('1.1')).toBe(true);
      // '2' should come after all the 1.x variants
      expect(sorted.indexOf('2')).toBeGreaterThan(sorted.indexOf('1'));
    });

    it('handles issues with # prefix', () => {
      const issues = ['#1', '#10', '#2', '#100'];
      expect(sortByIssueNumber(issues)).toEqual(['#1', '#2', '#10', '#100']);
    });

    it('handles issues with "Issue" prefix', () => {
      const issues = ['Issue 1', 'Issue 10', 'Issue 2', 'Issue 100'];
      expect(sortByIssueNumber(issues)).toEqual(['Issue 1', 'Issue 2', 'Issue 10', 'Issue 100']);
    });

    it('handles a complete series with specials', () => {
      const issues = [
        '1', '2', '3', '4', '5',
        'Annual 1',
        '6', '7', '8', '9', '10',
        'Annual 2',
        '11', '12',
        'Special'
      ];
      const sorted = sortByIssueNumber(issues);

      // First 5 regular issues
      expect(sorted.slice(0, 5)).toEqual(['1', 'Annual 1', '2', 'Annual 2', '3']);
      // Non-numeric "Special" should be at the end
      expect(sorted[sorted.length - 1]).toBe('Special');
    });
  });

  describe('edge cases', () => {
    it('handles null values in the array', () => {
      const issues = ['1', null, '2', '10'] as (string | null)[];
      const sorted = issues.sort((a, b) => {
        const aSort = computeIssueNumberSort(a) ?? Infinity;
        const bSort = computeIssueNumberSort(b) ?? Infinity;
        return aSort - bSort;
      });
      // null values get Infinity sort key, so they go to the end
      expect(sorted).toEqual(['1', '2', '10', null]);
    });

    it('handles negative numbers', () => {
      // Edge case: negative numbers (unlikely but possible)
      expect(computeIssueNumberSort('-1')).toBe(-1);
      expect(computeIssueNumberSort('-0.5')).toBe(-0.5);
    });

    it('handles very large numbers', () => {
      expect(computeIssueNumberSort('9999')).toBe(9999);
      expect(computeIssueNumberSort('10000')).toBe(10000);
    });

    it('handles zero', () => {
      expect(computeIssueNumberSort('0')).toBe(0);
      expect(computeIssueNumberSort('00')).toBe(0);
    });

    it('handles whitespace-only strings', () => {
      expect(parseIssueNumber('   ')).toEqual({ numericValue: null, hasNumber: false });
    });

    it('handles strings with only special characters', () => {
      expect(parseIssueNumber('###')).toEqual({ numericValue: null, hasNumber: false });
      expect(parseIssueNumber('...')).toEqual({ numericValue: null, hasNumber: false });
    });
  });

  describe('descending sort order', () => {
    const sortDescending = (issues: string[]) => {
      return [...issues].sort((a, b) => {
        const aSort = computeIssueNumberSort(a) ?? -Infinity;
        const bSort = computeIssueNumberSort(b) ?? -Infinity;
        return bSort - aSort; // Reversed for descending
      });
    };

    it('sorts in descending order correctly', () => {
      const issues = ['1', '2', '10', '100'];
      expect(sortDescending(issues)).toEqual(['100', '10', '2', '1']);
    });

    it('handles descending with non-numeric at the end', () => {
      const issues = ['1', 'Special', '2', '10'];
      // Non-numeric gets -Infinity in descending, so goes to end
      expect(sortDescending(issues)).toEqual(['10', '2', '1', 'Special']);
    });
  });
});

// =============================================================================
// Database Integration Simulation Tests
// =============================================================================

describe('database sorting simulation', () => {
  // These tests simulate how issueNumberSort would work with database queries

  interface MockFileMetadata {
    id: string;
    number: string | null;
    issueNumberSort: number | null;
    filename: string;
  }

  const createMockMetadata = (
    id: string,
    number: string | null,
    filename: string
  ): MockFileMetadata => ({
    id,
    number,
    issueNumberSort: computeIssueNumberSort(number),
    filename,
  });

  it('simulates Prisma orderBy with issueNumberSort ascending', () => {
    const files: MockFileMetadata[] = [
      createMockMetadata('f1', '100', 'comic-100.cbz'),
      createMockMetadata('f2', '1', 'comic-001.cbz'),
      createMockMetadata('f3', '10', 'comic-010.cbz'),
      createMockMetadata('f4', '2', 'comic-002.cbz'),
      createMockMetadata('f5', 'Special', 'comic-special.cbz'),
    ];

    // Simulate: orderBy: [{ metadata: { issueNumberSort: 'asc' } }, { filename: 'asc' }]
    const sorted = [...files].sort((a, b) => {
      // Primary: issueNumberSort (nulls last)
      if (a.issueNumberSort === null && b.issueNumberSort === null) {
        return a.filename.localeCompare(b.filename);
      }
      if (a.issueNumberSort === null) return 1;
      if (b.issueNumberSort === null) return -1;
      if (a.issueNumberSort !== b.issueNumberSort) {
        return a.issueNumberSort - b.issueNumberSort;
      }
      // Secondary: filename
      return a.filename.localeCompare(b.filename);
    });

    expect(sorted.map(f => f.number)).toEqual(['1', '2', '10', '100', 'Special']);
  });

  it('simulates correct sorting for a complete series', () => {
    const files: MockFileMetadata[] = [
      createMockMetadata('f1', '1', 'Issue 001.cbz'),
      createMockMetadata('f2', '1.5', 'Issue 001.5.cbz'),
      createMockMetadata('f3', '2', 'Issue 002.cbz'),
      createMockMetadata('f4', '10', 'Issue 010.cbz'),
      createMockMetadata('f5', '11', 'Issue 011.cbz'),
      createMockMetadata('f6', 'Annual 1', 'Annual 001.cbz'),
      createMockMetadata('f7', null, 'Preview.cbz'),
    ];

    const sorted = [...files].sort((a, b) => {
      if (a.issueNumberSort === null && b.issueNumberSort === null) {
        return a.filename.localeCompare(b.filename);
      }
      if (a.issueNumberSort === null) return 1;
      if (b.issueNumberSort === null) return -1;
      if (a.issueNumberSort !== b.issueNumberSort) {
        return a.issueNumberSort - b.issueNumberSort;
      }
      return a.filename.localeCompare(b.filename);
    });

    expect(sorted.map(f => f.id)).toEqual(['f6', 'f1', 'f2', 'f3', 'f4', 'f5', 'f7']);
    // Order: Annual 1 (1 + 'Annual...'), 1 (1 + 'Issue...'), 1.5 (1.5), 2 (2), 10 (10), 11 (11), null (Preview)
    // Note: f6 comes before f1 because both have issueNumberSort=1, and 'Annual' < 'Issue' alphabetically
  });

  it('handles the original bug case: "100" before "9"', () => {
    // This was the original bug: string sorting put "100" before "9"
    const files: MockFileMetadata[] = [
      createMockMetadata('f1', '100', 'Issue 100.cbz'),
      createMockMetadata('f2', '9', 'Issue 009.cbz'),
      createMockMetadata('f3', '015', 'Issue 015.cbz'),
      createMockMetadata('f4', '02', 'Issue 002.cbz'),
    ];

    // Old string sort would give: ['015', '02', '100', '9']
    // New numeric sort should give: ['02', '9', '015', '100']

    const sorted = [...files].sort((a, b) => {
      if (a.issueNumberSort === null && b.issueNumberSort === null) return 0;
      if (a.issueNumberSort === null) return 1;
      if (b.issueNumberSort === null) return -1;
      return a.issueNumberSort - b.issueNumberSort;
    });

    expect(sorted.map(f => f.number)).toEqual(['02', '9', '015', '100']);
    expect(sorted.map(f => f.issueNumberSort)).toEqual([2, 9, 15, 100]);
  });
});

// =============================================================================
// withIssueNumberSort Comprehensive Tests
// =============================================================================

describe('withIssueNumberSort comprehensive', () => {
  it('can be spread into a Prisma data object', () => {
    const data = {
      series: 'Batman',
      ...withIssueNumberSort('42'),
      title: 'The Dark Knight',
    };

    expect(data).toEqual({
      series: 'Batman',
      number: '42',
      issueNumberSort: 42,
      title: 'The Dark Knight',
    });
  });

  it('handles all edge cases for database writes', () => {
    // Regular number
    expect(withIssueNumberSort('5')).toEqual({ number: '5', issueNumberSort: 5 });

    // Decimal
    expect(withIssueNumberSort('1.5')).toEqual({ number: '1.5', issueNumberSort: 1.5 });

    // Leading zeros
    expect(withIssueNumberSort('001')).toEqual({ number: '001', issueNumberSort: 1 });

    // Text with number
    expect(withIssueNumberSort('Annual 3')).toEqual({ number: 'Annual 3', issueNumberSort: 3 });

    // Pure text (no number)
    expect(withIssueNumberSort('Special')).toEqual({ number: 'Special', issueNumberSort: null });

    // Null input
    expect(withIssueNumberSort(null)).toEqual({ number: null, issueNumberSort: null });

    // Empty string (preserves the empty string as-is)
    expect(withIssueNumberSort('')).toEqual({ number: '', issueNumberSort: null });
  });
});
