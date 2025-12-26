/**
 * Tests for Comic Classification Service (Western Comics)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectFormatFromFilename,
  classifyByPageCount,
  getFormatLabel,
  classifyComicFormat,
  batchClassifyComicFiles,
  parseFormatField,
  type ComicFormat,
} from '../comic-classification.service.js';

// Mock the config service
vi.mock('../config.service.js', () => ({
  getComicClassificationSettings: vi.fn(() => ({
    enabled: true,
    issuePageThreshold: 50,
    omnibusPageThreshold: 200,
    filenameOverridesPageCount: true,
  })),
}));

describe('detectFormatFromFilename', () => {
  describe('omnibus patterns', () => {
    it('should detect omnibus keyword', () => {
      const result = detectFormatFromFilename('Batman Omnibus Vol 1.cbz');
      expect(result.format).toBe('omnibus');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect omnibus case-insensitively', () => {
      const result = detectFormatFromFilename('BATMAN OMNIBUS.cbz');
      expect(result.format).toBe('omnibus');
    });
  });

  describe('TPB patterns', () => {
    it('should detect TPB keyword', () => {
      const result = detectFormatFromFilename('Batman TPB Vol 1.cbz');
      expect(result.format).toBe('tpb');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect trade paperback', () => {
      const result = detectFormatFromFilename('Batman Trade Paperback Vol 1.cbz');
      expect(result.format).toBe('tpb');
    });

    it('should detect collected edition', () => {
      const result = detectFormatFromFilename('Batman Collected Edition.cbz');
      expect(result.format).toBe('tpb');
    });

    it('should detect collection keyword', () => {
      const result = detectFormatFromFilename('Batman Collection.cbz');
      expect(result.format).toBe('tpb');
    });

    it('should detect volume indicator as TPB (lower confidence)', () => {
      const result = detectFormatFromFilename('Batman Vol. 1.cbz');
      expect(result.format).toBe('tpb');
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe('no format detected', () => {
    it('should return null for regular issue filename', () => {
      const result = detectFormatFromFilename('Batman 001.cbz');
      expect(result.format).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should return null for issue with title', () => {
      const result = detectFormatFromFilename('Batman 001 - The Beginning.cbz');
      expect(result.format).toBeNull();
    });
  });

  describe('file extension handling', () => {
    it('should handle different file extensions', () => {
      expect(detectFormatFromFilename('Batman Omnibus.cbr').format).toBe('omnibus');
      expect(detectFormatFromFilename('Batman Omnibus.cb7').format).toBe('omnibus');
      expect(detectFormatFromFilename('Batman Omnibus.pdf').format).toBe('omnibus');
      expect(detectFormatFromFilename('Batman Omnibus.zip').format).toBe('omnibus');
    });
  });
});

describe('classifyByPageCount', () => {
  const defaultSettings = {
    enabled: true,
    issuePageThreshold: 50,
    omnibusPageThreshold: 200,
    filenameOverridesPageCount: true,
  };

  it('should classify < 50 pages as issue', () => {
    expect(classifyByPageCount(30, defaultSettings)).toBe('issue');
    expect(classifyByPageCount(49, defaultSettings)).toBe('issue');
  });

  it('should classify 50-200 pages as TPB', () => {
    expect(classifyByPageCount(50, defaultSettings)).toBe('tpb');
    expect(classifyByPageCount(100, defaultSettings)).toBe('tpb');
    expect(classifyByPageCount(200, defaultSettings)).toBe('tpb');
  });

  it('should classify > 200 pages as omnibus', () => {
    expect(classifyByPageCount(201, defaultSettings)).toBe('omnibus');
    expect(classifyByPageCount(500, defaultSettings)).toBe('omnibus');
  });

  it('should respect custom thresholds', () => {
    const customSettings = {
      ...defaultSettings,
      issuePageThreshold: 40,
      omnibusPageThreshold: 300,
    };

    expect(classifyByPageCount(35, customSettings)).toBe('issue');
    expect(classifyByPageCount(45, customSettings)).toBe('tpb');
    expect(classifyByPageCount(250, customSettings)).toBe('tpb');
    expect(classifyByPageCount(350, customSettings)).toBe('omnibus');
  });
});

describe('getFormatLabel', () => {
  it('should return correct labels', () => {
    expect(getFormatLabel('issue')).toBe('Single Issue');
    expect(getFormatLabel('tpb')).toBe('TPB');
    expect(getFormatLabel('omnibus')).toBe('Omnibus');
  });
});

describe('classifyComicFormat', () => {
  const defaultSettings = {
    enabled: true,
    issuePageThreshold: 50,
    omnibusPageThreshold: 200,
    filenameOverridesPageCount: true,
  };

  describe('with classification enabled', () => {
    it('should classify by filename when format indicator present', () => {
      const result = classifyComicFormat('Batman Omnibus.cbz', 100, defaultSettings);
      expect(result.format).toBe('omnibus');
      expect(result.source).toBe('filename');
      expect(result.formatLabel).toBe('Omnibus');
    });

    it('should classify by page count when no filename indicator', () => {
      const result = classifyComicFormat('Batman 001.cbz', 30, defaultSettings);
      expect(result.format).toBe('issue');
      expect(result.source).toBe('pagecount');
      expect(result.formatLabel).toBe('Single Issue');
    });

    it('should use filename confidence when filename format is detected', () => {
      // "Vol 1" pattern has lower confidence (0.7) since it's an indirect TPB indicator
      const result = classifyComicFormat('Batman Vol 1.cbz', 100, defaultSettings);
      expect(result.format).toBe('tpb');
      expect(result.source).toBe('filename');
      expect(result.confidence).toBe(0.7);
    });

    it('should boost confidence when page count matches filename suggestion', () => {
      // When filenameOverridesPageCount is false and both sources agree
      const settingsNoOverride = {
        ...defaultSettings,
        filenameOverridesPageCount: false,
      };
      const result = classifyComicFormat('Batman Vol 1.cbz', 100, settingsNoOverride);
      expect(result.format).toBe('tpb');
      expect(result.source).toBe('pagecount');
      expect(result.confidence).toBe(0.95); // Both sources agree
    });
  });

  describe('with filenameOverridesPageCount = false', () => {
    const settingsNoOverride = {
      ...defaultSettings,
      filenameOverridesPageCount: false,
    };

    it('should use page count even when filename suggests different format', () => {
      // Filename says TPB (via Vol), but page count says omnibus
      const result = classifyComicFormat('Batman Vol 1.cbz', 300, settingsNoOverride);
      expect(result.format).toBe('omnibus');
      expect(result.source).toBe('pagecount');
    });
  });

  describe('with classification disabled', () => {
    const settingsDisabled = {
      ...defaultSettings,
      enabled: false,
    };

    it('should default to issue when disabled', () => {
      const result = classifyComicFormat('Batman Omnibus.cbz', 500, settingsDisabled);
      expect(result.format).toBe('issue');
      expect(result.formatLabel).toBe('Single Issue');
      expect(result.confidence).toBe(0.5);
    });
  });
});

describe('batchClassifyComicFiles', () => {
  const defaultSettings = {
    enabled: true,
    issuePageThreshold: 50,
    omnibusPageThreshold: 200,
    filenameOverridesPageCount: true,
  };

  it('should classify multiple files', () => {
    const files = [
      { filename: 'Batman 001.cbz', pageCount: 30 },
      { filename: 'Batman TPB Vol 1.cbz', pageCount: 150 },
      { filename: 'Batman Omnibus.cbz', pageCount: 500 },
    ];

    const results = batchClassifyComicFiles(files, defaultSettings);

    expect(results.get('Batman 001.cbz')?.format).toBe('issue');
    expect(results.get('Batman TPB Vol 1.cbz')?.format).toBe('tpb');
    expect(results.get('Batman Omnibus.cbz')?.format).toBe('omnibus');
  });

  it('should return results for all files', () => {
    const files = [
      { filename: 'Comic 1.cbz', pageCount: 25 },
      { filename: 'Comic 2.cbz', pageCount: 100 },
    ];

    const results = batchClassifyComicFiles(files, defaultSettings);
    expect(results.size).toBe(2);
  });
});

describe('parseFormatField', () => {
  it('should parse omnibus format', () => {
    expect(parseFormatField('Omnibus')).toBe('omnibus');
    expect(parseFormatField('omnibus')).toBe('omnibus');
  });

  it('should parse TPB formats', () => {
    expect(parseFormatField('TPB')).toBe('tpb');
    expect(parseFormatField('tpb')).toBe('tpb');
    expect(parseFormatField('Trade Paperback')).toBe('tpb');
    expect(parseFormatField('Collected Edition')).toBe('tpb');
  });

  it('should parse issue formats', () => {
    expect(parseFormatField('Single Issue')).toBe('issue');
    expect(parseFormatField('Issue')).toBe('issue');
    expect(parseFormatField('Floppy')).toBe('issue');
  });

  it('should return null for undefined', () => {
    expect(parseFormatField(undefined)).toBeNull();
  });

  it('should return null for unknown formats', () => {
    expect(parseFormatField('Unknown Format')).toBeNull();
    expect(parseFormatField('Something Else')).toBeNull();
  });

  it('should handle whitespace', () => {
    expect(parseFormatField('  TPB  ')).toBe('tpb');
    expect(parseFormatField(' Omnibus ')).toBe('omnibus');
  });
});
