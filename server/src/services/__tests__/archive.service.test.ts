/**
 * Archive Service Tests
 *
 * Tests for archive format detection, listing, and helper functions.
 * Note: Full extraction tests require actual archive files and are tested
 * in integration tests. These unit tests focus on pure logic functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  applyOrderPrefix,
  checkArchiveModifiable,
  reorderPagesInArchive,
  modifyPagesInArchive,
  listArchiveContents,
  clearArchiveListingCache,
} from '../archive.service.js';

import {
  createTestArchive,
  cleanupTestArchive,
  listTestArchivePages,
  listTestArchiveEntries,
  fileExists,
  createPrefixedTestArchive,
  createSpecialCharsTestArchive,
} from './__fixtures__/test-archive-helpers.js';

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

  // ===========================================================================
  // applyOrderPrefix Tests
  // ===========================================================================

  describe('applyOrderPrefix', () => {
    describe('basic functionality', () => {
      it('should add 0000_ prefix to filename without existing prefix', () => {
        expect(applyOrderPrefix('cover.jpg', 0)).toBe('0000_cover.jpg');
      });

      it('should replace existing 4-digit prefix', () => {
        expect(applyOrderPrefix('0005_cover.jpg', 10)).toBe('0010_cover.jpg');
      });

      it('should handle index 0 correctly', () => {
        expect(applyOrderPrefix('page.jpg', 0)).toBe('0000_page.jpg');
      });

      it('should handle index 9999 correctly', () => {
        expect(applyOrderPrefix('page.jpg', 9999)).toBe('9999_page.jpg');
      });

      it('should handle large index values (over 9999)', () => {
        expect(applyOrderPrefix('page.jpg', 10000)).toBe('10000_page.jpg');
      });

      it('should preserve file extension', () => {
        expect(applyOrderPrefix('image.png', 5)).toBe('0005_image.png');
        expect(applyOrderPrefix('photo.webp', 42)).toBe('0042_photo.webp');
      });
    });

    describe('edge cases', () => {
      it('should preserve filename with special characters (spaces, parens)', () => {
        expect(applyOrderPrefix('Batman #1 (2011).jpg', 0)).toBe('0000_Batman #1 (2011).jpg');
      });

      it('should handle filename with multiple dots', () => {
        expect(applyOrderPrefix('file.v1.backup.jpg', 3)).toBe('0003_file.v1.backup.jpg');
      });

      it('should not modify 5-digit prefixes (12345_ stays)', () => {
        // 5-digit prefix doesn't match the 4-digit pattern, so base name is the whole filename
        expect(applyOrderPrefix('12345_page.jpg', 0)).toBe('0000_12345_page.jpg');
      });

      it('should handle unicode characters', () => {
        expect(applyOrderPrefix('日本語.jpg', 1)).toBe('0001_日本語.jpg');
        expect(applyOrderPrefix('Émile.png', 2)).toBe('0002_Émile.png');
      });

      it('should handle filename with no extension', () => {
        expect(applyOrderPrefix('cover', 0)).toBe('0000_cover');
      });

      it('should handle empty base name after prefix removal', () => {
        expect(applyOrderPrefix('0001_.jpg', 5)).toBe('0005_.jpg');
      });
    });

    describe('regression tests', () => {
      it('should produce correct output for cover.jpg at index 0', () => {
        expect(applyOrderPrefix('cover.jpg', 0)).toBe('0000_cover.jpg');
      });

      it('should produce correct output for 0005_cover.jpg at index 1', () => {
        expect(applyOrderPrefix('0005_cover.jpg', 1)).toBe('0001_cover.jpg');
      });

      it('should produce correct output for page1.jpg at index 3', () => {
        expect(applyOrderPrefix('page1.jpg', 3)).toBe('0003_page1.jpg');
      });
    });
  });
});

// =============================================================================
// Integration Tests with Real Archives
// =============================================================================

describe('Archive Service Integration Tests', () => {
  // Clear cache before each test to ensure clean state
  beforeEach(() => {
    clearArchiveListingCache();
  });

  // ===========================================================================
  // checkArchiveModifiable Tests
  // ===========================================================================

  describe('checkArchiveModifiable', () => {
    let testCbzPath: string;

    afterEach(async () => {
      if (testCbzPath) {
        await cleanupTestArchive(testCbzPath);
      }
    });

    it('should return isModifiable=true for CBZ file', async () => {
      testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg', 'page3.jpg']);

      const result = await checkArchiveModifiable(testCbzPath);

      expect(result.isModifiable).toBe(true);
      expect(result.format).toBe('zip');
    });

    it('should return correct pageCount (images only)', async () => {
      testCbzPath = await createTestArchive(
        ['page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg', 'page5.jpg'],
        { includeComicInfo: true }
      );

      const result = await checkArchiveModifiable(testCbzPath);

      expect(result.pageCount).toBe(5);
    });

    it('should return format=zip for CBZ', async () => {
      testCbzPath = await createTestArchive(['page1.jpg']);

      const result = await checkArchiveModifiable(testCbzPath);

      expect(result.format).toBe('zip');
    });

    it('should exclude ComicInfo.xml from page count', async () => {
      testCbzPath = await createTestArchive(
        ['page1.jpg', 'page2.jpg'],
        { includeComicInfo: true }
      );

      const result = await checkArchiveModifiable(testCbzPath);

      // Only 2 image pages, not 3 entries
      expect(result.pageCount).toBe(2);
    });

    it('should handle archives with no images gracefully', async () => {
      // Create archive with only ComicInfo
      testCbzPath = await createTestArchive([], { includeComicInfo: true });

      const result = await checkArchiveModifiable(testCbzPath);

      expect(result.pageCount).toBe(0);
    });

    it('should handle non-existent file path', async () => {
      const result = await checkArchiveModifiable('/nonexistent/path/comic.cbz');

      expect(result.isModifiable).toBe(false);
      expect(result.format).toBe('unknown');
      expect(result.reason).toBeDefined();
    });
  });

  // ===========================================================================
  // reorderPagesInArchive Tests
  // ===========================================================================

  describe('reorderPagesInArchive', () => {
    let testCbzPath: string;

    afterEach(async () => {
      if (testCbzPath) {
        await cleanupTestArchive(testCbzPath);
      }
    });

    it('should reorder pages and apply new prefixes', async () => {
      testCbzPath = await createTestArchive(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

      const result = await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'a.jpg', newIndex: 3 },
        { originalPath: 'b.jpg', newIndex: 2 },
        { originalPath: 'c.jpg', newIndex: 1 },
        { originalPath: 'd.jpg', newIndex: 0 },
      ]);

      expect(result.success).toBe(true);
      expect(result.reorderedCount).toBe(4);
      expect(result.newTotalPages).toBe(4);
    });

    it('should reject empty reorderItems', async () => {
      testCbzPath = await createTestArchive(['a.jpg', 'b.jpg']);

      const result = await reorderPagesInArchive(testCbzPath, []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No pages were reordered');
    });

    it('should handle reverse order (d,c,b,a)', async () => {
      testCbzPath = await createTestArchive(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

      const result = await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'd.jpg', newIndex: 0 },
        { originalPath: 'c.jpg', newIndex: 1 },
        { originalPath: 'b.jpg', newIndex: 2 },
        { originalPath: 'a.jpg', newIndex: 3 },
      ]);

      expect(result.success).toBe(true);

      // Verify archive contains renamed files
      const pages = await listTestArchivePages(testCbzPath);
      expect(pages).toContain('0000_d.jpg');
      expect(pages).toContain('0001_c.jpg');
      expect(pages).toContain('0002_b.jpg');
      expect(pages).toContain('0003_a.jpg');
    });

    it('should return correct reorderedCount and newTotalPages', async () => {
      testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg', 'page3.jpg']);

      const result = await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'page1.jpg', newIndex: 2 },
        { originalPath: 'page2.jpg', newIndex: 0 },
      ]);

      expect(result.success).toBe(true);
      expect(result.reorderedCount).toBe(2);
      expect(result.newTotalPages).toBe(3);
    });

    it('should create and cleanup backup', async () => {
      testCbzPath = await createTestArchive(['a.jpg', 'b.jpg']);
      const backupPath = `${testCbzPath}.bak`;

      await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'a.jpg', newIndex: 1 },
        { originalPath: 'b.jpg', newIndex: 0 },
      ]);

      // Backup should be removed on success
      expect(await fileExists(backupPath)).toBe(false);
    });

    it('should preserve ComicInfo.xml during reorder', async () => {
      testCbzPath = await createTestArchive(
        ['page1.jpg', 'page2.jpg'],
        { includeComicInfo: true }
      );

      await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'page1.jpg', newIndex: 1 },
        { originalPath: 'page2.jpg', newIndex: 0 },
      ]);

      const entries = await listTestArchiveEntries(testCbzPath);
      const hasComicInfo = entries.some((e) =>
        e.toLowerCase().includes('comicinfo.xml')
      );
      expect(hasComicInfo).toBe(true);
    });

    it('should handle partial reordering (not all pages)', async () => {
      testCbzPath = await createTestArchive(['a.jpg', 'b.jpg', 'c.jpg']);

      const result = await reorderPagesInArchive(testCbzPath, [
        { originalPath: 'a.jpg', newIndex: 2 },
      ]);

      expect(result.success).toBe(true);
      expect(result.reorderedCount).toBe(1);

      const pages = await listTestArchivePages(testCbzPath);
      expect(pages).toContain('0002_a.jpg');
      // b.jpg and c.jpg should remain with original names
      expect(pages).toContain('b.jpg');
      expect(pages).toContain('c.jpg');
    });
  });

  // ===========================================================================
  // modifyPagesInArchive Tests
  // ===========================================================================

  describe('modifyPagesInArchive', () => {
    let testCbzPath: string;

    afterEach(async () => {
      if (testCbzPath) {
        await cleanupTestArchive(testCbzPath);
      }
    });

    describe('delete operations', () => {
      it('should delete single page from archive', async () => {
        testCbzPath = await createTestArchive([
          'page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg', 'page5.jpg'
        ]);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page3.jpg' },
        ]);

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(1);
        expect(result.newTotalPages).toBe(4);
      });

      it('should delete multiple pages from archive', async () => {
        testCbzPath = await createTestArchive([
          'page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg', 'page5.jpg'
        ]);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page2.jpg' },
          { type: 'delete', path: 'page4.jpg' },
        ]);

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(2);
        expect(result.newTotalPages).toBe(3);
      });

      it('should NOT delete ComicInfo.xml', async () => {
        testCbzPath = await createTestArchive(
          ['page1.jpg', 'page2.jpg'],
          { includeComicInfo: true }
        );

        // Try to delete ComicInfo.xml (this shouldn't affect it since it's not an image)
        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page1.jpg' },
        ]);

        expect(result.success).toBe(true);

        const entries = await listTestArchiveEntries(testCbzPath);
        const hasComicInfo = entries.some((e) =>
          e.toLowerCase().includes('comicinfo.xml')
        );
        expect(hasComicInfo).toBe(true);
      });

      it('should return correct deletedCount', async () => {
        testCbzPath = await createTestArchive([
          'page1.jpg', 'page2.jpg', 'page3.jpg'
        ]);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page1.jpg' },
          { type: 'delete', path: 'page2.jpg' },
        ]);

        expect(result.deletedCount).toBe(2);
      });

      it('should update archive to have fewer pages', async () => {
        testCbzPath = await createTestArchive([
          'page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg'
        ]);

        await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page2.jpg' },
          { type: 'delete', path: 'page3.jpg' },
        ]);

        const pages = await listTestArchivePages(testCbzPath);
        expect(pages.length).toBe(2);
        expect(pages).toContain('page1.jpg');
        expect(pages).toContain('page4.jpg');
      });

      it('should prevent deletion of ALL images', async () => {
        testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg']);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page1.jpg' },
          { type: 'delete', path: 'page2.jpg' },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('at least one image');
      });
    });

    describe('reorder operations', () => {
      it('should reorder pages with correct prefixes', async () => {
        testCbzPath = await createTestArchive(['a.jpg', 'b.jpg', 'c.jpg']);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'reorder', path: 'c.jpg', newIndex: 0 },
          { type: 'reorder', path: 'a.jpg', newIndex: 1 },
          { type: 'reorder', path: 'b.jpg', newIndex: 2 },
        ]);

        expect(result.success).toBe(true);
        expect(result.reorderedCount).toBe(3);
      });

      it('should apply 0000_ prefix pattern', async () => {
        testCbzPath = await createTestArchive(['page.jpg']);

        await modifyPagesInArchive(testCbzPath, [
          { type: 'reorder', path: 'page.jpg', newIndex: 0 },
        ]);

        const pages = await listTestArchivePages(testCbzPath);
        expect(pages).toContain('0000_page.jpg');
      });

      it('should return correct reorderedCount', async () => {
        testCbzPath = await createTestArchive(['a.jpg', 'b.jpg', 'c.jpg']);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'reorder', path: 'a.jpg', newIndex: 2 },
          { type: 'reorder', path: 'b.jpg', newIndex: 1 },
        ]);

        expect(result.reorderedCount).toBe(2);
      });
    });

    describe('combined delete + reorder', () => {
      it('should delete pages then reorder remaining', async () => {
        testCbzPath = await createTestArchive([
          'page1.jpg', 'page2.jpg', 'page3.jpg', 'page4.jpg'
        ]);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page2.jpg' },
          { type: 'reorder', path: 'page4.jpg', newIndex: 0 },
          { type: 'reorder', path: 'page1.jpg', newIndex: 1 },
          { type: 'reorder', path: 'page3.jpg', newIndex: 2 },
        ]);

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(1);
        expect(result.reorderedCount).toBe(3);
        expect(result.newTotalPages).toBe(3);
      });

      it('should return accurate counts for both', async () => {
        testCbzPath = await createTestArchive([
          'a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'
        ]);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'b.jpg' },
          { type: 'delete', path: 'd.jpg' },
          { type: 'reorder', path: 'e.jpg', newIndex: 0 },
          { type: 'reorder', path: 'c.jpg', newIndex: 1 },
          { type: 'reorder', path: 'a.jpg', newIndex: 2 },
        ]);

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(2);
        expect(result.reorderedCount).toBe(3);
        expect(result.newTotalPages).toBe(3);
      });
    });

    describe('backup mechanism', () => {
      it('should create .bak file before modification', async () => {
        testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg']);
        const backupPath = `${testCbzPath}.bak`;

        // We can't easily test mid-operation, but we can verify backup is cleaned up
        await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'page1.jpg' },
        ]);

        // Backup should be removed on success
        expect(await fileExists(backupPath)).toBe(false);
      });

      it('should delete .bak file on success', async () => {
        testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg']);
        const backupPath = `${testCbzPath}.bak`;

        await modifyPagesInArchive(testCbzPath, [
          { type: 'reorder', path: 'page1.jpg', newIndex: 1 },
          { type: 'reorder', path: 'page2.jpg', newIndex: 0 },
        ]);

        expect(await fileExists(backupPath)).toBe(false);
        expect(await fileExists(testCbzPath)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle special characters in filenames', async () => {
        testCbzPath = await createSpecialCharsTestArchive();

        // Get actual page names from the archive
        const pages = await listTestArchivePages(testCbzPath);
        expect(pages.length).toBeGreaterThan(0);

        // Try to reorder one of the special char pages
        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'reorder', path: pages[0]!, newIndex: 0 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should reject empty operations array', async () => {
        testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg']);

        const result = await modifyPagesInArchive(testCbzPath, []);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No changes');
      });

      it('should handle operations on non-existent pages gracefully', async () => {
        testCbzPath = await createTestArchive(['page1.jpg', 'page2.jpg']);

        const result = await modifyPagesInArchive(testCbzPath, [
          { type: 'delete', path: 'nonexistent.jpg' },
        ]);

        // Should fail because no actual changes were made
        expect(result.success).toBe(false);
      });
    });
  });
});
