/**
 * Test Archive Helpers
 *
 * Utilities for creating real CBZ archives for integration testing.
 * Uses the same archive creation functions as the main service.
 */

import { mkdir, writeFile, rm, readdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  createCbzArchive,
  listArchiveContents,
  cleanupTempDir,
} from '../../archive.service.js';

// =============================================================================
// Types
// =============================================================================

export interface CreateTestArchiveOptions {
  /** Include a ComicInfo.xml file */
  includeComicInfo?: boolean;
  /** Put pages in a nested directory */
  nested?: boolean;
  /** Custom ComicInfo.xml content */
  comicInfoContent?: string;
}

// =============================================================================
// JPEG Magic Bytes
// =============================================================================

/**
 * Minimal valid JPEG data (a 1x1 white pixel).
 * This is a real JPEG that can be opened by image viewers.
 */
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd5, 0xdb, 0x20, 0xa8, 0xf1, 0x7e, 0xff,
  0xd9,
]);

/**
 * Default ComicInfo.xml content for test archives.
 */
const DEFAULT_COMICINFO = `<?xml version="1.0"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>Test Comic</Title>
  <Series>Test Series</Series>
  <Number>1</Number>
  <PageCount>5</PageCount>
</ComicInfo>`;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a temporary directory for test archives.
 */
async function createTestTempDir(prefix: string): Promise<string> {
  const tempPath = join(tmpdir(), `${prefix}${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });
  return tempPath;
}

/**
 * Create a test CBZ archive with specified pages.
 *
 * @param pages - Array of page filenames to include (e.g., ['page1.jpg', 'page2.jpg'])
 * @param options - Configuration options
 * @returns Path to the created CBZ archive
 */
export async function createTestArchive(
  pages: string[],
  options: CreateTestArchiveOptions = {}
): Promise<string> {
  const tempDir = await createTestTempDir('test-archive-');
  const { includeComicInfo = false, nested = false, comicInfoContent } = options;

  try {
    // Create the directory for pages (if nested)
    const pagesDir = nested ? join(tempDir, 'images') : tempDir;
    if (nested) {
      await mkdir(pagesDir, { recursive: true });
    }

    // Create dummy image files
    for (const page of pages) {
      const pagePath = join(pagesDir, page);
      // Ensure parent directory exists for paths with subdirectories
      await mkdir(dirname(pagePath), { recursive: true });
      // Write minimal JPEG data
      await writeFile(pagePath, MINIMAL_JPEG);
    }

    // Add ComicInfo.xml if requested
    if (includeComicInfo) {
      const comicInfoPath = nested
        ? join(tempDir, 'ComicInfo.xml')
        : join(tempDir, 'ComicInfo.xml');
      await writeFile(comicInfoPath, comicInfoContent || DEFAULT_COMICINFO);
    }

    // Create CBZ archive
    const cbzPath = `${tempDir}.cbz`;
    const result = await createCbzArchive(tempDir, cbzPath);

    if (!result.success) {
      throw new Error(`Failed to create test archive: ${result.error}`);
    }

    // Clean up temp directory (keep the CBZ)
    await cleanupTempDir(tempDir);

    return cbzPath;
  } catch (err) {
    // Clean up on error
    await cleanupTempDir(tempDir);
    throw err;
  }
}

/**
 * Cleanup test archive and any backup files.
 */
export async function cleanupTestArchive(archivePath: string): Promise<void> {
  try {
    await rm(archivePath, { force: true });
  } catch {
    // Ignore
  }
  try {
    await rm(`${archivePath}.bak`, { force: true });
  } catch {
    // Ignore
  }
  // Also cleanup the temp directory if it exists (same path without .cbz)
  const tempDir = archivePath.replace(/\.cbz$/, '');
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

/**
 * List pages (image files) in a test archive.
 */
export async function listTestArchivePages(archivePath: string): Promise<string[]> {
  const info = await listArchiveContents(archivePath);

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  return info.entries
    .filter((e) => {
      if (e.isDirectory) return false;
      const ext = e.path.toLowerCase().slice(e.path.lastIndexOf('.'));
      return imageExtensions.includes(ext);
    })
    .map((e) => e.path)
    .sort();
}

/**
 * Get all entries in a test archive (including ComicInfo.xml).
 */
export async function listTestArchiveEntries(archivePath: string): Promise<string[]> {
  const info = await listArchiveContents(archivePath);
  return info.entries
    .filter((e) => !e.isDirectory)
    .map((e) => e.path)
    .sort();
}

/**
 * Check if a file exists and has size > 0.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Create a test archive with prefixed pages (simulating already-reordered archive).
 */
export async function createPrefixedTestArchive(
  pageBasenames: string[],
  startIndex = 0
): Promise<string> {
  const prefixedPages = pageBasenames.map((name, i) => {
    const prefix = String(startIndex + i).padStart(4, '0');
    return `${prefix}_${name}`;
  });

  return createTestArchive(prefixedPages, { includeComicInfo: true });
}

/**
 * Create a test archive with pages having special characters in names.
 */
export async function createSpecialCharsTestArchive(): Promise<string> {
  const pages = [
    'page (1).jpg',
    'page [2].jpg',
    'page {3}.jpg',
    'Batman #1.jpg',
    "Cover's Image.jpg",
  ];

  return createTestArchive(pages, { includeComicInfo: true });
}

/**
 * Create a test archive simulating a nested directory structure.
 */
export async function createNestedTestArchive(): Promise<string> {
  const pages = ['cover.jpg', 'page1.jpg', 'page2.jpg', 'page3.jpg'];

  return createTestArchive(pages, { includeComicInfo: true, nested: true });
}
