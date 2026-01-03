/**
 * Series Metadata Service Tests - Multi-Series Format (v2)
 *
 * Tests for series.json v2 format with multi-series support.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock fs operations
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
}));

// Mock comicinfo service
vi.mock('../comicinfo.service.js', () => ({
  writeComicInfoToFile: vi.fn().mockResolvedValue(undefined),
  readComicInfoFromFile: vi.fn().mockResolvedValue({ success: false }),
}));

import {
  readSeriesJson,
  writeSeriesJson,
  isMultiSeriesFormat,
  getSeriesDefinitions,
  SERIES_JSON_SCHEMA_VERSION,
  type SeriesMetadata,
  type SeriesDefinition,
} from '../series-metadata.service.js';

describe('SeriesMetadata Multi-Series Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SERIES_JSON_SCHEMA_VERSION', () => {
    it('should be version 2', () => {
      expect(SERIES_JSON_SCHEMA_VERSION).toBe(2);
    });
  });

  describe('isMultiSeriesFormat', () => {
    it('should return true for v2 format with series array', () => {
      const metadata: SeriesMetadata = {
        series: [{ name: 'Batman' }],
      };
      expect(isMultiSeriesFormat(metadata)).toBe(true);
    });

    it('should return false for v1 format with seriesName', () => {
      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
      };
      expect(isMultiSeriesFormat(metadata)).toBe(false);
    });

    it('should return false for empty series array', () => {
      const metadata: SeriesMetadata = {
        series: [],
      };
      expect(isMultiSeriesFormat(metadata)).toBe(false);
    });

    it('should return false for undefined series', () => {
      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
        series: undefined,
      };
      expect(isMultiSeriesFormat(metadata)).toBe(false);
    });
  });

  describe('getSeriesDefinitions', () => {
    it('should return series array for v2 format', () => {
      const metadata: SeriesMetadata = {
        series: [
          { name: 'Batman', publisher: 'DC' },
          { name: 'Superman', publisher: 'DC' },
        ],
      };

      const definitions = getSeriesDefinitions(metadata);

      expect(definitions).toHaveLength(2);
      expect(definitions[0]!.name).toBe('Batman');
      expect(definitions[1]!.name).toBe('Superman');
    });

    it('should convert v1 format to single SeriesDefinition', () => {
      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
        publisher: 'DC Comics',
        startYear: 2016,
        aliases: ['The Batman', 'Dark Knight'],
        genres: ['Superhero'],
      };

      const definitions = getSeriesDefinitions(metadata);

      expect(definitions).toHaveLength(1);
      expect(definitions[0]!.name).toBe('Batman');
      expect(definitions[0]!.publisher).toBe('DC Comics');
      expect(definitions[0]!.startYear).toBe(2016);
      expect(definitions[0]!.aliases).toEqual(['The Batman', 'Dark Knight']);
      expect(definitions[0]!.genres).toEqual(['Superhero']);
    });

    it('should return empty array for invalid metadata', () => {
      const metadata: SeriesMetadata = {} as SeriesMetadata;
      expect(getSeriesDefinitions(metadata)).toHaveLength(0);
    });

    it('should preserve all v1 fields when converting', () => {
      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
        publisher: 'DC Comics',
        publisherId: 123,
        startYear: 2016,
        endYear: 2020,
        issueCount: 50,
        deck: 'Short description',
        summary: 'Full description',
        coverUrl: 'http://example.com/cover.jpg',
        siteUrl: 'http://example.com',
        genres: ['Superhero'],
        tags: ['Dark', 'Crime'],
        characters: ['Bruce Wayne'],
        teams: ['Justice League'],
        storyArcs: ['Court of Owls'],
        locations: ['Gotham City'],
        creators: ['Scott Snyder'],
        userNotes: 'My notes',
        volume: 3,
        type: 'western',
        ageRating: 'Teen',
        languageISO: 'en',
        comicVineSeriesId: 'cv123',
        metronSeriesId: 'met456',
        anilistId: 'al789',
        malId: 'mal012',
        gcdId: 'gcd345',
        aliases: ['Dark Knight'],
      };

      const definitions = getSeriesDefinitions(metadata);
      expect(definitions).toHaveLength(1);
      const def = definitions[0]!;

      expect(def.name).toBe('Batman');
      expect(def.publisher).toBe('DC Comics');
      expect(def.publisherId).toBe(123);
      expect(def.startYear).toBe(2016);
      expect(def.endYear).toBe(2020);
      expect(def.issueCount).toBe(50);
      expect(def.deck).toBe('Short description');
      expect(def.summary).toBe('Full description');
      expect(def.coverUrl).toBe('http://example.com/cover.jpg');
      expect(def.siteUrl).toBe('http://example.com');
      expect(def.genres).toEqual(['Superhero']);
      expect(def.tags).toEqual(['Dark', 'Crime']);
      expect(def.volume).toBe(3);
      expect(def.type).toBe('western');
      expect(def.ageRating).toBe('Teen');
      expect(def.comicVineSeriesId).toBe('cv123');
      expect(def.aliases).toEqual(['Dark Knight']);
    });
  });

  describe('readSeriesJson', () => {
    it('should return error when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await readSeriesJson('/comics/batman');

      expect(result.success).toBe(false);
      expect(result.error).toBe('series.json not found');
    });

    it('should read and validate v2 format successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          schemaVersion: 2,
          series: [
            { name: 'Batman', publisher: 'DC' },
            { name: 'Superman', publisher: 'DC' },
          ],
        })
      );

      const result = await readSeriesJson('/comics/crossovers');

      expect(result.success).toBe(true);
      expect(result.metadata?.series).toHaveLength(2);
    });

    it('should read and validate v1 format successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          seriesName: 'Batman',
          publisher: 'DC Comics',
        })
      );

      const result = await readSeriesJson('/comics/batman');

      expect(result.success).toBe(true);
      expect(result.metadata?.seriesName).toBe('Batman');
    });

    it('should reject v2 format with non-array series field', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          series: 'not an array',
        })
      );

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('"series" field must be an array');
    });

    it('should reject v2 format with missing name in series definition', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          series: [
            { name: 'Batman' },
            { publisher: 'DC' }, // Missing name
          ],
        })
      );

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('series[1] missing required field: name');
    });

    it('should reject v2 format with empty series array', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          series: [],
        })
      );

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('series array is empty');
    });

    it('should reject v2 format with invalid aliases type', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          series: [{ name: 'Batman', aliases: 'not an array' }],
        })
      );

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('aliases must be an array');
    });

    it('should reject file with neither seriesName nor series array', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          publisher: 'DC',
        })
      );

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing required field: seriesName or series array');
    });

    it('should handle JSON parse errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('{ invalid json');

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle file read errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await readSeriesJson('/comics/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permission denied');
    });
  });

  describe('writeSeriesJson', () => {
    it('should write v2 format successfully', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const metadata: SeriesMetadata = {
        series: [
          { name: 'Batman', publisher: 'DC' },
          { name: 'Superman', publisher: 'DC' },
        ],
      };

      const result = await writeSeriesJson('/comics/crossovers', metadata);

      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalledWith(
        '/comics/crossovers/series.json',
        expect.stringContaining('"series"'),
        'utf-8'
      );
    });

    it('should write v1 format successfully', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
        publisher: 'DC',
      };

      const result = await writeSeriesJson('/comics/batman', metadata);

      expect(result.success).toBe(true);
    });

    it('should reject v2 format with non-array series', async () => {
      const metadata = {
        series: 'not an array',
      } as unknown as SeriesMetadata;

      const result = await writeSeriesJson('/comics/test', metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('series field must be an array');
    });

    it('should reject v2 format with missing name', async () => {
      const metadata: SeriesMetadata = {
        series: [{ publisher: 'DC' } as SeriesDefinition],
      };

      const result = await writeSeriesJson('/comics/test', metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('name is required');
    });

    it('should reject v2 format with empty array', async () => {
      const metadata: SeriesMetadata = {
        series: [],
      };

      const result = await writeSeriesJson('/comics/test', metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject v1 format without seriesName', async () => {
      const metadata = {
        publisher: 'DC',
      } as unknown as SeriesMetadata;

      const result = await writeSeriesJson('/comics/test', metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('seriesName is required');
    });

    it('should skip ComicInfo.xml sync for v2 format', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const metadata: SeriesMetadata = {
        series: [{ name: 'Batman' }, { name: 'Superman' }],
      };

      await writeSeriesJson('/comics/crossovers', metadata);

      // writeFile should only be called once (for series.json)
      // ComicInfo.xml sync is skipped for v2
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it('should handle write errors', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('ENOSPC: no space left'));

      const metadata: SeriesMetadata = {
        seriesName: 'Batman',
      };

      const result = await writeSeriesJson('/comics/test', metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no space left');
    });
  });
});

describe('SeriesDefinition Type', () => {
  it('should support all metadata fields', () => {
    const definition: SeriesDefinition = {
      name: 'Batman',
      aliases: ['The Batman', 'Dark Knight'],
      publisher: 'DC Comics',
      publisherId: 123,
      startYear: 2016,
      endYear: 2020,
      issueCount: 50,
      deck: 'Short description',
      summary: 'Full description',
      coverUrl: 'http://example.com/cover.jpg',
      siteUrl: 'http://example.com',
      genres: ['Superhero'],
      tags: ['Dark'],
      characters: ['Bruce Wayne'],
      teams: ['Justice League'],
      storyArcs: ['Court of Owls'],
      locations: ['Gotham City'],
      creators: ['Scott Snyder'],
      userNotes: 'Notes',
      volume: 3,
      type: 'western',
      ageRating: 'Teen',
      languageISO: 'en',
      comicVineSeriesId: 'cv123',
      metronSeriesId: 'met456',
      anilistId: 'al789',
      malId: 'mal012',
      gcdId: 'gcd345',
      creatorRoles: {
        writers: ['Scott Snyder'],
        pencillers: ['Greg Capullo'],
      },
      externalRatings: [
        { source: 'comicvine', ratingType: 'community', value: 4.5, scale: 5 },
      ],
      externalReviews: [
        {
          source: 'comicvine',
          authorName: 'User1',
          reviewText: 'Great series!',
          reviewType: 'user',
        },
      ],
    };

    expect(definition.name).toBe('Batman');
    expect(definition.aliases).toHaveLength(2);
    expect(definition.creatorRoles?.writers).toContain('Scott Snyder');
  });
});
