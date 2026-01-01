import { describe, it, expect } from 'vitest';
import { parseApplyProgress } from '../useJobPolling';

describe('parseApplyProgress', () => {
  describe('idle phase', () => {
    it('returns idle phase when message is null', () => {
      const result = parseApplyProgress(null, null);
      expect(result).toEqual({ phase: 'idle', current: 0, total: 0 });
    });

    it('returns idle phase when message is undefined', () => {
      const result = parseApplyProgress(undefined, undefined);
      expect(result).toEqual({ phase: 'idle', current: 0, total: 0 });
    });

    it('returns idle phase when message is empty string', () => {
      const result = parseApplyProgress('', null);
      expect(result).toEqual({ phase: 'idle', current: 0, total: 0 });
    });
  });

  describe('converting phase', () => {
    it('detects converting phase from message prefix', () => {
      const result = parseApplyProgress('Converting: issue001.cbz', '1 of 10');
      expect(result.phase).toBe('converting');
    });

    it('extracts filename from converting message', () => {
      const result = parseApplyProgress('Converting: Batman #001.cbz', null);
      expect(result.currentFile).toBe('Batman #001.cbz');
    });
  });

  describe('applying phase', () => {
    it('detects applying phase from message prefix', () => {
      const result = parseApplyProgress('Applying: issue001.cbz', '5 of 10');
      expect(result.phase).toBe('applying');
    });

    it('extracts filename from applying message', () => {
      const result = parseApplyProgress('Applying: Spider-Man #100.cbz', null);
      expect(result.currentFile).toBe('Spider-Man #100.cbz');
    });

    it('defaults to applying phase for unrecognized messages', () => {
      const result = parseApplyProgress('Processing files...', null);
      expect(result.phase).toBe('applying');
    });
  });

  describe('creating_series_json phase', () => {
    it('detects creating_series_json from series metadata message', () => {
      const result = parseApplyProgress('Creating series metadata for Batman', null);
      expect(result.phase).toBe('creating_series_json');
    });

    it('detects creating_series_json from series.json message', () => {
      const result = parseApplyProgress('Writing series.json', null);
      expect(result.phase).toBe('creating_series_json');
    });

    it('detects creating_series_json from mixed series message', () => {
      const result = parseApplyProgress('Processing mixed series group', null);
      expect(result.phase).toBe('creating_series_json');
    });
  });

  describe('syncing_ratings phase', () => {
    it('detects syncing_ratings from rating message (lowercase)', () => {
      const result = parseApplyProgress('Syncing rating to AniList', null);
      expect(result.phase).toBe('syncing_ratings');
    });

    it('detects syncing_ratings from Rating message (capitalized)', () => {
      const result = parseApplyProgress('Rating sync in progress', null);
      expect(result.phase).toBe('syncing_ratings');
    });
  });

  describe('complete phase', () => {
    it('detects complete from complete message (lowercase)', () => {
      const result = parseApplyProgress('Apply complete', null);
      expect(result.phase).toBe('complete');
    });

    it('detects complete from Complete message (capitalized)', () => {
      const result = parseApplyProgress('Complete - all files processed', null);
      expect(result.phase).toBe('complete');
    });
  });

  describe('progress count parsing', () => {
    it('parses "X of Y" count from detail', () => {
      const result = parseApplyProgress('Applying files', '5 of 100');
      expect(result.current).toBe(5);
      expect(result.total).toBe(100);
    });

    it('returns 0 for current and total when detail is null', () => {
      const result = parseApplyProgress('Applying files', null);
      expect(result.current).toBe(0);
      expect(result.total).toBe(0);
    });

    it('returns 0 for current and total when detail has no count', () => {
      const result = parseApplyProgress('Applying files', 'some other text');
      expect(result.current).toBe(0);
      expect(result.total).toBe(0);
    });

    it('handles large numbers in count', () => {
      const result = parseApplyProgress('Processing', '999 of 1000');
      expect(result.current).toBe(999);
      expect(result.total).toBe(1000);
    });
  });

  describe('filename extraction', () => {
    it('extracts filename from Renaming prefix', () => {
      const result = parseApplyProgress('Renaming: old-name.cbz', null);
      expect(result.currentFile).toBe('old-name.cbz');
    });

    it('extracts filename from Moving prefix', () => {
      const result = parseApplyProgress('Moving: file.cbz', null);
      expect(result.currentFile).toBe('file.cbz');
    });

    it('returns undefined when no filename pattern matches', () => {
      const result = parseApplyProgress('Processing files...', null);
      expect(result.currentFile).toBeUndefined();
    });

    it('handles filenames with special characters', () => {
      const result = parseApplyProgress('Applying: Batman (2016) #001 - [DCP].cbz', null);
      expect(result.currentFile).toBe('Batman (2016) #001 - [DCP].cbz');
    });
  });

  describe('combined parsing', () => {
    it('parses complete progress info', () => {
      const result = parseApplyProgress('Converting: Batman #001.cbz', '3 of 25');
      expect(result).toEqual({
        phase: 'converting',
        current: 3,
        total: 25,
        currentFile: 'Batman #001.cbz',
      });
    });
  });
});
