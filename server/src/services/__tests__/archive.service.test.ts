/**
 * Archive Service Tests
 *
 * Tests for archive format detection, listing, and helper functions.
 * Note: Full extraction tests require actual archive files and are tested
 * in integration tests. These unit tests focus on pure logic functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STANDARD_CBZ_ENTRIES,
  COVER_FILE_CBZ_ENTRIES,
  NESTED_DIRECTORY_CBZ_ENTRIES,
  NO_COMICINFO_CBZ_ENTRIES,
  MIXED_FORMAT_CBZ_ENTRIES,
  EMPTY_ARCHIVE_ENTRIES,
  TEXT_ONLY_ARCHIVE_ENTRIES,
  SPECIAL_CHARS_CBZ_ENTRIES,
  createLargeArchiveEntries,
  calculateArchiveInfo,
} from './__fixtures__/archive.fixtures.js';

// =============================================================================
// Import pure functions from archive service
// =============================================================================

import {
  getArchiveFormat,
  isComicArchive,
  createTempDir,
  cleanupTempDir,
} from '../archive.service.js';

// =============================================================================
// Tests
// =============================================================================

describe('Archive Service', () => {
  // ===========================================================================
  // Format Detection Tests
  // ===========================================================================

  describe('getArchiveFormat', () => {
    it('should detect CBZ as zip format', () => {
      expect(getArchiveFormat('/comics/Batman.cbz')).toBe('zip');
      expect(getArchiveFormat('/comics/Batman.CBZ')).toBe('zip');
    });

    it('should detect ZIP as zip format', () => {
      expect(getArchiveFormat('/archives/files.zip')).toBe('zip');
      expect(getArchiveFormat('/archives/files.ZIP')).toBe('zip');
    });

    it('should detect CBR as rar format', () => {
      expect(getArchiveFormat('/comics/Batman.cbr')).toBe('rar');
      expect(getArchiveFormat('/comics/Batman.CBR')).toBe('rar');
    });

    it('should detect RAR as rar format', () => {
      expect(getArchiveFormat('/archives/files.rar')).toBe('rar');
    });

    it('should detect CB7 as 7z format', () => {
      expect(getArchiveFormat('/comics/Batman.cb7')).toBe('7z');
    });

    it('should detect 7Z as 7z format', () => {
      expect(getArchiveFormat('/archives/files.7z')).toBe('7z');
    });

    it('should detect CBT as tar format', () => {
      expect(getArchiveFormat('/comics/Batman.cbt')).toBe('tar');
    });

    it('should return unknown for unsupported formats', () => {
      expect(getArchiveFormat('/files/document.pdf')).toBe('unknown');
      expect(getArchiveFormat('/files/image.jpg')).toBe('unknown');
      expect(getArchiveFormat('/files/noextension')).toBe('unknown');
    });
  });

  describe('isComicArchive', () => {
    it('should return true for CBZ files', () => {
      expect(isComicArchive('/comics/Batman.cbz')).toBe(true);
      expect(isComicArchive('/comics/Batman.CBZ')).toBe(true);
    });

    it('should return true for CBR files', () => {
      expect(isComicArchive('/comics/Batman.cbr')).toBe(true);
    });

    it('should return true for CB7 files', () => {
      expect(isComicArchive('/comics/Batman.cb7')).toBe(true);
    });

    it('should return true for CBT files', () => {
      expect(isComicArchive('/comics/Batman.cbt')).toBe(true);
    });

    it('should return false for regular archives', () => {
      expect(isComicArchive('/archives/files.zip')).toBe(false);
      expect(isComicArchive('/archives/files.rar')).toBe(false);
      expect(isComicArchive('/archives/files.7z')).toBe(false);
    });

    it('should return false for non-archive files', () => {
      expect(isComicArchive('/files/image.jpg')).toBe(false);
      expect(isComicArchive('/files/document.pdf')).toBe(false);
    });
  });

  // ===========================================================================
  // Temp Directory Tests
  // ===========================================================================

  describe('createTempDir', () => {
    it('should create a temporary directory', async () => {
      const tempDir = await createTempDir('test-');

      expect(tempDir).toContain('test-');
      expect(tempDir).toMatch(/^\/.*test-[a-f0-9-]+$/);

      // Cleanup
      await cleanupTempDir(tempDir);
    });

    it('should create unique directories', async () => {
      const dir1 = await createTempDir('test-');
      const dir2 = await createTempDir('test-');

      expect(dir1).not.toBe(dir2);

      // Cleanup
      await cleanupTempDir(dir1);
      await cleanupTempDir(dir2);
    });
  });

  describe('cleanupTempDir', () => {
    it('should not throw for non-existent directory', async () => {
      await expect(
        cleanupTempDir('/nonexistent/path/12345')
      ).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // Archive Entry Analysis Tests (using fixtures)
  // ===========================================================================

  describe('Archive Entry Analysis', () => {
    describe('calculateArchiveInfo', () => {
      it('should calculate standard archive info', () => {
        const info = calculateArchiveInfo(STANDARD_CBZ_ENTRIES);

        expect(info.fileCount).toBe(11); // ComicInfo + 10 pages
        expect(info.hasComicInfo).toBe(true);
        expect(info.coverPath).toBe('001.jpg');
      });

      it('should detect explicit cover file', () => {
        const info = calculateArchiveInfo(COVER_FILE_CBZ_ENTRIES);

        expect(info.hasComicInfo).toBe(true);
        expect(info.coverPath).toBe('cover.jpg');
      });

      it('should handle nested directory structure', () => {
        const info = calculateArchiveInfo(NESTED_DIRECTORY_CBZ_ENTRIES);

        expect(info.fileCount).toBe(4); // 3 non-directory entries
        expect(info.hasComicInfo).toBe(true);
      });

      it('should detect missing ComicInfo.xml', () => {
        const info = calculateArchiveInfo(NO_COMICINFO_CBZ_ENTRIES);

        expect(info.hasComicInfo).toBe(false);
        expect(info.coverPath).toBe('001.jpg');
      });

      it('should handle mixed image formats', () => {
        const info = calculateArchiveInfo(MIXED_FORMAT_CBZ_ENTRIES);

        expect(info.hasComicInfo).toBe(true);
        expect(info.coverPath).toBe('cover.png');
      });

      it('should handle empty archive', () => {
        const info = calculateArchiveInfo(EMPTY_ARCHIVE_ENTRIES);

        expect(info.fileCount).toBe(0);
        expect(info.hasComicInfo).toBe(false);
        expect(info.coverPath).toBeNull();
      });

      it('should handle text-only archive', () => {
        const info = calculateArchiveInfo(TEXT_ONLY_ARCHIVE_ENTRIES);

        expect(info.fileCount).toBe(2);
        expect(info.hasComicInfo).toBe(false);
        expect(info.coverPath).toBeNull();
      });

      it('should handle special characters in filenames', () => {
        const info = calculateArchiveInfo(SPECIAL_CHARS_CBZ_ENTRIES);

        expect(info.fileCount).toBe(5);
        expect(info.hasComicInfo).toBe(true);
      });

      it('should handle large page count archives', () => {
        const entries = createLargeArchiveEntries(500);
        const info = calculateArchiveInfo(entries);

        expect(info.fileCount).toBe(501); // ComicInfo + 500 pages
        expect(info.hasComicInfo).toBe(true);
      });

      it('should calculate total size correctly', () => {
        const info = calculateArchiveInfo(STANDARD_CBZ_ENTRIES);
        const expectedTotal = STANDARD_CBZ_ENTRIES.reduce(
          (sum, e) => sum + e.size,
          0
        );

        expect(info.totalSize).toBe(expectedTotal);
      });
    });
  });

  // ===========================================================================
  // File Path Handling Tests
  // ===========================================================================

  describe('File Path Handling', () => {
    it('should handle paths with spaces', () => {
      expect(getArchiveFormat('/comics/Batman Issue 1.cbz')).toBe('zip');
      expect(isComicArchive('/comics/Batman Issue 1.cbz')).toBe(true);
    });

    it('should handle paths with special characters', () => {
      expect(getArchiveFormat("/comics/Batman #1 (2011) [Collector's].cbz")).toBe('zip');
      expect(isComicArchive('/comics/X-Men & Spider-Man.cbz')).toBe(true);
    });

    it('should handle paths with unicode characters', () => {
      expect(getArchiveFormat('/comics/日本語.cbz')).toBe('zip');
      expect(isComicArchive('/comics/Émile.cbz')).toBe(true);
    });

    it('should handle paths with multiple dots', () => {
      expect(getArchiveFormat('/comics/Batman.v1.n1.cbz')).toBe('zip');
      expect(isComicArchive('/comics/file.backup.cbz')).toBe(true);
    });

    it('should handle relative paths', () => {
      expect(getArchiveFormat('Batman.cbz')).toBe('zip');
      expect(getArchiveFormat('./comics/Batman.cbz')).toBe('zip');
      expect(getArchiveFormat('../Batman.cbz')).toBe('zip');
    });
  });
});
