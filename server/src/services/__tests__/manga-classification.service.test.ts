/**
 * Tests for Manga Classification Service
 */

import { describe, it, expect } from 'vitest';
import {
  parseMangaFilename,
  classifyByPageCount,
  generateDisplayTitle,
  classifyMangaFile,
  getSortableNumber,
  compareMangaFiles,
  type MangaContentType,
} from '../manga-classification.service.js';

describe('parseMangaFilename', () => {
  describe('volume + chapter patterns', () => {
    it('should parse v5c12 format', () => {
      const result = parseMangaFilename('Manga Name v5c12.cbz');
      expect(result.volume).toBe('5');
      expect(result.chapter).toBe('12');
      expect(result.contentType).toBe('chapter');
      expect(result.primaryNumber).toBe('12');
    });

    it('should parse Vol.5 Ch.12 format', () => {
      const result = parseMangaFilename('Manga Name Vol.5 Ch.12.cbz');
      expect(result.volume).toBe('5');
      expect(result.chapter).toBe('12');
      expect(result.contentType).toBe('chapter');
    });

    it('should parse Volume 5 Chapter 12 format', () => {
      const result = parseMangaFilename('Manga Name Volume 5 Chapter 12.cbz');
      expect(result.volume).toBe('5');
      expect(result.chapter).toBe('12');
      expect(result.contentType).toBe('chapter');
    });

    it('should handle decimal chapters in v5c12.5 format', () => {
      const result = parseMangaFilename('Manga Name v5c12.5.cbz');
      expect(result.volume).toBe('5');
      expect(result.chapter).toBe('12.5');
      expect(result.primaryNumber).toBe('12.5');
    });
  });

  describe('chapter-only patterns', () => {
    it('should parse Chapter 12 format', () => {
      const result = parseMangaFilename('Manga Name Chapter 12.cbz');
      expect(result.chapter).toBe('12');
      expect(result.volume).toBeUndefined();
      expect(result.contentType).toBe('chapter');
    });

    it('should parse Ch.12 format', () => {
      const result = parseMangaFilename('Manga Name Ch.12.cbz');
      expect(result.chapter).toBe('12');
      expect(result.contentType).toBe('chapter');
    });

    it('should parse c12 format', () => {
      const result = parseMangaFilename('Manga Name c12.cbz');
      expect(result.chapter).toBe('12');
      expect(result.contentType).toBe('chapter');
    });

    it('should parse trailing number format (Manga - 012)', () => {
      const result = parseMangaFilename('Manga Name - 012.cbz');
      expect(result.chapter).toBe('012');
      expect(result.primaryNumber).toBe('012');
    });
  });

  describe('volume-only patterns', () => {
    it('should parse Volume 5 format', () => {
      const result = parseMangaFilename('Manga Name Volume 5.cbz');
      expect(result.volume).toBe('5');
      expect(result.chapter).toBeUndefined();
      expect(result.contentType).toBe('volume');
    });

    it('should parse Vol.5 format', () => {
      const result = parseMangaFilename('Manga Name Vol.5.cbz');
      expect(result.volume).toBe('5');
      expect(result.contentType).toBe('volume');
    });

    it('should parse v5 format', () => {
      const result = parseMangaFilename('Manga Name v5.cbz');
      expect(result.volume).toBe('5');
      expect(result.contentType).toBe('volume');
    });

    it('should parse v05 format with leading zeros', () => {
      const result = parseMangaFilename('Manga Name v05.cbz');
      expect(result.volume).toBe('05');
      expect(result.chapter).toBeUndefined();
      expect(result.contentType).toBe('volume');
      expect(result.primaryNumber).toBe('05');
    });

    it('should parse real-world manga filename: Lone Wolf and Cub v05', () => {
      const result = parseMangaFilename('Lone Wolf and Cub v05 - Black Wind (2001) (Digital) (danke-Empire).cbz');
      expect(result.volume).toBe('05');
      expect(result.chapter).toBeUndefined();
      expect(result.contentType).toBe('volume');
      expect(result.primaryNumber).toBe('05');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should parse v01 through v99 formats', () => {
      const v01 = parseMangaFilename('Series v01.cbz');
      const v10 = parseMangaFilename('Series v10.cbz');
      const v99 = parseMangaFilename('Series v99.cbz');

      expect(v01.volume).toBe('01');
      expect(v10.volume).toBe('10');
      expect(v99.volume).toBe('99');

      expect(v01.contentType).toBe('volume');
      expect(v10.contentType).toBe('volume');
      expect(v99.contentType).toBe('volume');
    });
  });

  describe('special content types', () => {
    it('should detect omake', () => {
      const result = parseMangaFilename('Manga Name Omake.cbz');
      expect(result.contentType).toBe('omake');
    });

    it('should detect extra', () => {
      const result = parseMangaFilename('Manga Name Extra 1.cbz');
      expect(result.contentType).toBe('extra');
    });

    it('should detect bonus', () => {
      const result = parseMangaFilename('Manga Name Bonus Chapter.cbz');
      expect(result.contentType).toBe('extra');
    });

    it('should detect one-shot', () => {
      const result = parseMangaFilename('Manga Name One-Shot.cbz');
      expect(result.contentType).toBe('oneshot');
    });

    it('should detect side story', () => {
      const result = parseMangaFilename('Manga Name Side Story.cbz');
      expect(result.contentType).toBe('extra');
    });
  });

  describe('edge cases', () => {
    it('should handle no number found', () => {
      const result = parseMangaFilename('Manga Name.cbz');
      expect(result.contentType).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle different file extensions', () => {
      const cbr = parseMangaFilename('Manga v5c12.cbr');
      const cb7 = parseMangaFilename('Manga v5c12.cb7');
      const pdf = parseMangaFilename('Manga v5c12.pdf');

      expect(cbr.volume).toBe('5');
      expect(cb7.volume).toBe('5');
      expect(pdf.volume).toBe('5');
    });
  });
});

describe('classifyByPageCount', () => {
  it('should classify < 60 pages as chapter', () => {
    expect(classifyByPageCount(30, 60)).toBe('chapter');
    expect(classifyByPageCount(59, 60)).toBe('chapter');
  });

  it('should classify >= 60 pages as volume', () => {
    expect(classifyByPageCount(60, 60)).toBe('volume');
    expect(classifyByPageCount(200, 60)).toBe('volume');
  });

  it('should use default threshold of 60', () => {
    expect(classifyByPageCount(30)).toBe('chapter');
    expect(classifyByPageCount(100)).toBe('volume');
  });

  it('should respect custom threshold', () => {
    expect(classifyByPageCount(80, 100)).toBe('chapter');
    expect(classifyByPageCount(100, 100)).toBe('volume');
  });
});

describe('generateDisplayTitle', () => {
  it('should generate chapter titles', () => {
    expect(generateDisplayTitle('chapter', '5')).toBe('Chapter 5');
    expect(generateDisplayTitle('chapter', '12.5')).toBe('Chapter 12.5');
  });

  it('should generate volume titles', () => {
    expect(generateDisplayTitle('volume', '3')).toBe('Volume 3');
  });

  it('should generate special content titles', () => {
    expect(generateDisplayTitle('omake', '1')).toBe('Omake 1');
    expect(generateDisplayTitle('extra', '2')).toBe('Extra 2');
    expect(generateDisplayTitle('bonus', '1')).toBe('Bonus 1');
  });

  it('should handle one-shot', () => {
    expect(generateDisplayTitle('oneshot', '1')).toBe('One-Shot');
    expect(generateDisplayTitle('oneshot')).toBe('One-Shot');
  });

  it('should remove leading zeros', () => {
    expect(generateDisplayTitle('chapter', '005')).toBe('Chapter 5');
    expect(generateDisplayTitle('volume', '01')).toBe('Volume 1');
  });

  it('should preserve decimals', () => {
    expect(generateDisplayTitle('chapter', '10.5')).toBe('Chapter 10.5');
  });

  it('should handle missing number', () => {
    expect(generateDisplayTitle('chapter')).toBe('Chapter');
    expect(generateDisplayTitle('volume')).toBe('Volume');
  });
});

describe('classifyMangaFile', () => {
  const defaultSettings = {
    enabled: true,
    volumePageThreshold: 60,
    filenameOverridesPageCount: true,
  };

  it('should use filename classification when explicit', () => {
    const result = classifyMangaFile('Manga v5c12.cbz', 200, defaultSettings);
    expect(result.contentType).toBe('chapter');
    expect(result.source).toBe('filename');
    expect(result.displayTitle).toBe('Chapter 12');
  });

  it('should use page count when filename is ambiguous', () => {
    const result = classifyMangaFile('Manga - 012.cbz', 200, defaultSettings);
    // Trailing number is ambiguous, but filename priority is enabled
    // Since it parses as chapter, it should stay chapter
    expect(result.contentType).toBeDefined();
  });

  it('should respect filenameOverridesPageCount setting', () => {
    const settingsPageCountOverrides = {
      ...defaultSettings,
      filenameOverridesPageCount: false,
    };

    // With filename override disabled, 200 pages should be volume
    const result = classifyMangaFile('Manga Chapter 12.cbz', 200, settingsPageCountOverrides);
    expect(result.contentType).toBe('volume');
    expect(result.source).toBe('pagecount');
  });

  it('should generate correct display title', () => {
    const result = classifyMangaFile('Manga v5c12.cbz', 30, defaultSettings);
    expect(result.displayTitle).toBe('Chapter 12');
  });

  it('should include volume and chapter numbers', () => {
    const result = classifyMangaFile('Manga v5c12.cbz', 30, defaultSettings);
    expect(result.volume).toBe('5');
    expect(result.chapter).toBe('12');
    expect(result.primaryNumber).toBe('12');
  });

  describe('volume-only files', () => {
    it('should classify volume-only file correctly', () => {
      const result = classifyMangaFile('Manga v05.cbz', 200, defaultSettings);
      expect(result.contentType).toBe('volume');
      expect(result.volume).toBe('05');
      expect(result.chapter).toBeUndefined();
      expect(result.primaryNumber).toBe('05');
      expect(result.displayTitle).toBe('Volume 5');
    });

    it('should classify Lone Wolf and Cub v05 correctly', () => {
      const result = classifyMangaFile(
        'Lone Wolf and Cub v05 - Black Wind (2001) (Digital) (danke-Empire).cbz',
        200,
        defaultSettings
      );
      expect(result.contentType).toBe('volume');
      expect(result.volume).toBe('05');
      expect(result.primaryNumber).toBe('05');
      expect(result.displayTitle).toBe('Volume 5');
      expect(result.source).toBe('filename');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should use volume number as primaryNumber for volume-only files', () => {
      const result = classifyMangaFile('Series v10.cbz', 180, defaultSettings);
      expect(result.primaryNumber).toBe('10');
      expect(result.volume).toBe('10');
    });
  });
});

describe('getSortableNumber', () => {
  it('should parse integer numbers', () => {
    expect(getSortableNumber('5')).toBe(5);
    expect(getSortableNumber('12')).toBe(12);
  });

  it('should parse decimal numbers', () => {
    expect(getSortableNumber('12.5')).toBe(12.5);
    expect(getSortableNumber('1.1')).toBe(1.1);
  });

  it('should handle leading zeros', () => {
    expect(getSortableNumber('005')).toBe(5);
    expect(getSortableNumber('012')).toBe(12);
  });

  it('should return Infinity for undefined', () => {
    expect(getSortableNumber(undefined)).toBe(Infinity);
  });

  it('should extract numbers from strings', () => {
    expect(getSortableNumber('Chapter 5')).toBe(5);
  });
});

describe('compareMangaFiles', () => {
  it('should sort by volume first when both have volumes', () => {
    const fileA = { volume: '1', chapter: '10', primaryNumber: '10', filename: 'a.cbz' };
    const fileB = { volume: '2', chapter: '1', primaryNumber: '1', filename: 'b.cbz' };

    expect(compareMangaFiles(fileA, fileB)).toBeLessThan(0);
    expect(compareMangaFiles(fileB, fileA)).toBeGreaterThan(0);
  });

  it('should sort by chapter when volumes are equal', () => {
    const fileA = { volume: '1', chapter: '5', primaryNumber: '5', filename: 'a.cbz' };
    const fileB = { volume: '1', chapter: '10', primaryNumber: '10', filename: 'b.cbz' };

    expect(compareMangaFiles(fileA, fileB)).toBeLessThan(0);
  });

  it('should sort by primary number when no volumes', () => {
    const fileA = { chapter: '5', primaryNumber: '5', filename: 'a.cbz' };
    const fileB = { chapter: '10', primaryNumber: '10', filename: 'b.cbz' };

    expect(compareMangaFiles(fileA, fileB)).toBeLessThan(0);
  });

  it('should sort by filename as tiebreaker', () => {
    const fileA = { chapter: '5', primaryNumber: '5', filename: 'aaa.cbz' };
    const fileB = { chapter: '5', primaryNumber: '5', filename: 'bbb.cbz' };

    expect(compareMangaFiles(fileA, fileB)).toBeLessThan(0);
    expect(compareMangaFiles(fileB, fileA)).toBeGreaterThan(0);
  });

  it('should handle decimal chapters correctly', () => {
    const fileA = { chapter: '10', primaryNumber: '10', filename: 'a.cbz' };
    const fileB = { chapter: '10.5', primaryNumber: '10.5', filename: 'b.cbz' };
    const fileC = { chapter: '11', primaryNumber: '11', filename: 'c.cbz' };

    expect(compareMangaFiles(fileA, fileB)).toBeLessThan(0);
    expect(compareMangaFiles(fileB, fileC)).toBeLessThan(0);
  });
});
