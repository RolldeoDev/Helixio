/**
 * ComicInfo Service Tests
 *
 * Comprehensive tests for ComicInfo.xml parsing, building, and archive operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COMPLETE_COMICINFO_XML,
  MINIMAL_COMICINFO_XML,
  SPECIAL_CHARS_COMICINFO_XML,
  MANGA_COMICINFO_XML,
  COMICINFO_WITH_PAGES_XML,
  MALFORMED_COMICINFO_XML,
  EMPTY_COMICINFO_XML,
  NO_ROOT_COMICINFO_XML,
  MULTIPLE_CREATORS_COMICINFO_XML,
  DECIMAL_ISSUE_COMICINFO_XML,
  EXPECTED_COMPLETE_COMICINFO,
  EXPECTED_MINIMAL_COMICINFO,
} from './__fixtures__/comicinfo.fixtures.js';

// =============================================================================
// Import the service (pure functions, no mocking needed for parsing)
// =============================================================================

import {
  parseComicInfoXml,
  buildComicInfoXml,
  flattenComicInfo,
  parseCommaSeparated,
  joinCommaSeparated,
  formatComicDate,
  parseComicDate,
  getDisplayTitle,
} from '../comicinfo.service.js';

import type { ComicInfo } from '../comicinfo.service.js';

// =============================================================================
// Tests
// =============================================================================

describe('ComicInfo Service', () => {
  // ===========================================================================
  // XML Parsing Tests
  // ===========================================================================

  describe('parseComicInfoXml', () => {
    it('should parse complete ComicInfo.xml with all fields', async () => {
      const result = await parseComicInfoXml(COMPLETE_COMICINFO_XML);

      expect(result.Title).toBe(EXPECTED_COMPLETE_COMICINFO.Title);
      expect(result.Series).toBe(EXPECTED_COMPLETE_COMICINFO.Series);
      expect(result.Number).toBe(EXPECTED_COMPLETE_COMICINFO.Number);
      expect(result.Volume).toBe(EXPECTED_COMPLETE_COMICINFO.Volume);
      expect(result.Year).toBe(EXPECTED_COMPLETE_COMICINFO.Year);
      expect(result.Month).toBe(EXPECTED_COMPLETE_COMICINFO.Month);
      expect(result.Day).toBe(EXPECTED_COMPLETE_COMICINFO.Day);
      expect(result.Writer).toBe(EXPECTED_COMPLETE_COMICINFO.Writer);
      expect(result.Penciller).toBe(EXPECTED_COMPLETE_COMICINFO.Penciller);
      expect(result.Publisher).toBe(EXPECTED_COMPLETE_COMICINFO.Publisher);
    });

    it('should parse minimal ComicInfo.xml', async () => {
      const result = await parseComicInfoXml(MINIMAL_COMICINFO_XML);

      expect(result.Series).toBe(EXPECTED_MINIMAL_COMICINFO.Series);
      expect(result.Number).toBe(EXPECTED_MINIMAL_COMICINFO.Number);
      expect(result.Title).toBeUndefined();
      expect(result.Writer).toBeUndefined();
    });

    it('should handle special characters correctly', async () => {
      const result = await parseComicInfoXml(SPECIAL_CHARS_COMICINFO_XML);

      expect(result.Title).toBe('Spider-Man & Deadpool: "Best" Friends?');
      expect(result.Series).toBe('Spider-Man/Deadpool');
      expect(result.Summary).toContain('Spider-Man & Deadpool');
      expect(result.Summary).toContain('<Chaos>');
    });

    it('should parse manga-style settings', async () => {
      const result = await parseComicInfoXml(MANGA_COMICINFO_XML);

      expect(result.Manga).toBe('YesAndRightToLeft');
      expect(result.BlackAndWhite).toBe('Yes');
      expect(result.LanguageISO).toBe('ja');
    });

    it('should parse Pages section', async () => {
      const result = await parseComicInfoXml(COMICINFO_WITH_PAGES_XML);

      expect(result.Pages).toBeDefined();
      expect(result.PageCount).toBe(32);
    });

    it('should throw error for malformed XML', async () => {
      await expect(parseComicInfoXml(MALFORMED_COMICINFO_XML)).rejects.toThrow();
    });

    it('should throw error for XML without ComicInfo root', async () => {
      await expect(parseComicInfoXml(NO_ROOT_COMICINFO_XML)).rejects.toThrow(
        'Invalid ComicInfo.xml: missing ComicInfo root element'
      );
    });

    it('should handle empty ComicInfo.xml', async () => {
      const result = await parseComicInfoXml(EMPTY_COMICINFO_XML);

      expect(result.Series).toBeUndefined();
      expect(result.Number).toBeUndefined();
    });

    it('should convert numeric fields correctly', async () => {
      const result = await parseComicInfoXml(COMPLETE_COMICINFO_XML);

      expect(typeof result.Year).toBe('number');
      expect(typeof result.Month).toBe('number');
      expect(typeof result.Volume).toBe('number');
      expect(typeof result.PageCount).toBe('number');
      expect(typeof result.CommunityRating).toBe('number');
    });

    it('should handle decimal issue numbers', async () => {
      const result = await parseComicInfoXml(DECIMAL_ISSUE_COMICINFO_XML);

      expect(result.Number).toBe('0.5');
    });

    it('should handle multiple comma-separated creators', async () => {
      const result = await parseComicInfoXml(MULTIPLE_CREATORS_COMICINFO_XML);

      expect(result.Writer).toBe('Geoff Johns, Jim Lee');
      expect(result.Colorist).toBe('Alex Sinclair, Hi-Fi');
    });
  });

  // ===========================================================================
  // XML Building Tests
  // ===========================================================================

  describe('buildComicInfoXml', () => {
    it('should build valid XML from ComicInfo object', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
        Title: 'The Court of Owls',
        Publisher: 'DC Comics',
        Year: 2011,
      };

      const xml = buildComicInfoXml(comicInfo);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<ComicInfo>');
      expect(xml).toContain('<Series>Batman</Series>');
      expect(xml).toContain('<Number>1</Number>');
      expect(xml).toContain('<Title>The Court of Owls</Title>');
      expect(xml).toContain('<Publisher>DC Comics</Publisher>');
      expect(xml).toContain('<Year>2011</Year>');
    });

    it('should omit undefined/null fields', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
        Writer: undefined,
        Penciller: undefined,
      };

      const xml = buildComicInfoXml(comicInfo);

      expect(xml).not.toContain('<Writer>');
      expect(xml).not.toContain('<Penciller>');
    });

    it('should omit empty string fields', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
        Summary: '',
      };

      const xml = buildComicInfoXml(comicInfo);

      expect(xml).not.toContain('<Summary>');
    });

    it('should include boolean/enum fields correctly', () => {
      const comicInfo: ComicInfo = {
        Series: 'One Piece',
        Number: '1',
        Manga: 'YesAndRightToLeft',
        BlackAndWhite: 'Yes',
      };

      const xml = buildComicInfoXml(comicInfo);

      expect(xml).toContain('<Manga>YesAndRightToLeft</Manga>');
      expect(xml).toContain('<BlackAndWhite>Yes</BlackAndWhite>');
    });

    it('should roundtrip parse and build', async () => {
      const original = await parseComicInfoXml(COMPLETE_COMICINFO_XML);
      const rebuilt = buildComicInfoXml(original);
      const reparsed = await parseComicInfoXml(rebuilt);

      expect(reparsed.Series).toBe(original.Series);
      expect(reparsed.Number).toBe(original.Number);
      expect(reparsed.Title).toBe(original.Title);
      expect(reparsed.Writer).toBe(original.Writer);
      expect(reparsed.Year).toBe(original.Year);
    });
  });

  // ===========================================================================
  // Utility Function Tests
  // ===========================================================================

  describe('flattenComicInfo', () => {
    it('should flatten scalar fields', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
        Year: 2011,
        Writer: 'Scott Snyder',
      };

      const flat = flattenComicInfo(comicInfo);

      expect(flat.Series).toBe('Batman');
      expect(flat.Number).toBe('1');
      expect(flat.Year).toBe(2011);
      expect(flat.Writer).toBe('Scott Snyder');
    });

    it('should omit undefined/null/empty values', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
        Summary: '',
        Notes: undefined,
      };

      const flat = flattenComicInfo(comicInfo);

      expect(flat.Series).toBe('Batman');
      expect(flat).not.toHaveProperty('Summary');
      expect(flat).not.toHaveProperty('Notes');
    });

    it('should serialize Pages as JSON', async () => {
      const comicInfo = await parseComicInfoXml(COMICINFO_WITH_PAGES_XML);
      const flat = flattenComicInfo(comicInfo);

      expect(flat.pagesJson).toBeDefined();
      expect(typeof flat.pagesJson).toBe('string');
    });
  });

  describe('parseCommaSeparated', () => {
    it('should parse comma-separated values', () => {
      const result = parseCommaSeparated('Batman, Robin, Alfred');

      expect(result).toEqual(['Batman', 'Robin', 'Alfred']);
    });

    it('should trim whitespace', () => {
      const result = parseCommaSeparated('  Batman  ,  Robin  ,  Alfred  ');

      expect(result).toEqual(['Batman', 'Robin', 'Alfred']);
    });

    it('should filter empty values', () => {
      const result = parseCommaSeparated('Batman,,Robin,');

      expect(result).toEqual(['Batman', 'Robin']);
    });

    it('should return empty array for undefined', () => {
      const result = parseCommaSeparated(undefined);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const result = parseCommaSeparated('');

      expect(result).toEqual([]);
    });
  });

  describe('joinCommaSeparated', () => {
    it('should join array with comma and space', () => {
      const result = joinCommaSeparated(['Batman', 'Robin', 'Alfred']);

      expect(result).toBe('Batman, Robin, Alfred');
    });

    it('should handle single value', () => {
      const result = joinCommaSeparated(['Batman']);

      expect(result).toBe('Batman');
    });

    it('should handle empty array', () => {
      const result = joinCommaSeparated([]);

      expect(result).toBe('');
    });
  });

  describe('formatComicDate', () => {
    it('should format year only', () => {
      const result = formatComicDate(2011);

      expect(result).toBe('2011');
    });

    it('should format year and month', () => {
      const result = formatComicDate(2011, 9);

      expect(result).toBe('2011-09');
    });

    it('should format full date', () => {
      const result = formatComicDate(2011, 9, 7);

      expect(result).toBe('2011-09-07');
    });

    it('should pad single-digit month and day', () => {
      const result = formatComicDate(2011, 1, 5);

      expect(result).toBe('2011-01-05');
    });

    it('should return null for undefined year', () => {
      const result = formatComicDate(undefined);

      expect(result).toBeNull();
    });
  });

  describe('parseComicDate', () => {
    it('should parse year only', () => {
      const result = parseComicDate('2011');

      expect(result.year).toBe(2011);
      expect(result.month).toBeUndefined();
      expect(result.day).toBeUndefined();
    });

    it('should parse year and month', () => {
      const result = parseComicDate('2011-09');

      expect(result.year).toBe(2011);
      expect(result.month).toBe(9);
      expect(result.day).toBeUndefined();
    });

    it('should parse full date', () => {
      const result = parseComicDate('2011-09-07');

      expect(result.year).toBe(2011);
      expect(result.month).toBe(9);
      expect(result.day).toBe(7);
    });

    it('should handle invalid month', () => {
      const result = parseComicDate('2011-13');

      expect(result.year).toBe(2011);
      expect(result.month).toBeUndefined();
    });

    it('should handle invalid day', () => {
      const result = parseComicDate('2011-09-32');

      expect(result.year).toBe(2011);
      expect(result.month).toBe(9);
      expect(result.day).toBeUndefined();
    });
  });

  describe('getDisplayTitle', () => {
    it('should return Title if available', () => {
      const comicInfo: ComicInfo = {
        Title: 'The Court of Owls',
        Series: 'Batman',
        Number: '1',
      };

      const result = getDisplayTitle(comicInfo);

      expect(result).toBe('The Court of Owls');
    });

    it('should return Series #Number if no Title', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
        Number: '1',
      };

      const result = getDisplayTitle(comicInfo);

      expect(result).toBe('Batman #1');
    });

    it('should return Series if no Title or Number', () => {
      const comicInfo: ComicInfo = {
        Series: 'Batman',
      };

      const result = getDisplayTitle(comicInfo);

      expect(result).toBe('Batman');
    });

    it('should return Unknown if no identifying info', () => {
      const comicInfo: ComicInfo = {};

      const result = getDisplayTitle(comicInfo);

      expect(result).toBe('Unknown');
    });
  });
});
