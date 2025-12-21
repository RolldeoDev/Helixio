/**
 * Archive Mock Utilities
 *
 * Provides mock archive operations for isolated unit testing.
 * Simulates 7zip/unrar extraction and CBZ creation.
 */

import { vi } from 'vitest';
import type { ArchiveEntry, ArchiveInfo, ExtractionResult, ArchiveCreationResult } from '../../archive.service.js';

/**
 * Virtual archive entry for testing.
 */
export interface VirtualArchiveEntry {
  path: string;
  content: Buffer | string;
  size?: number;
  isDirectory?: boolean;
}

/**
 * Virtual archive for testing.
 */
export interface VirtualArchive {
  format: 'zip' | 'rar' | '7z';
  entries: VirtualArchiveEntry[];
  hasComicInfo: boolean;
  coverPath: string | null;
}

/**
 * Create a virtual archive for testing.
 */
export function createVirtualArchive(
  format: 'zip' | 'rar' | '7z' = 'zip',
  entries: VirtualArchiveEntry[] = []
): VirtualArchive {
  const hasComicInfo = entries.some(
    (e) => e.path.toLowerCase() === 'comicinfo.xml'
  );
  const coverPath = entries.find(
    (e) => /\.(jpg|jpeg|png|webp)$/i.test(e.path)
  )?.path ?? null;

  return {
    format,
    entries,
    hasComicInfo,
    coverPath,
  };
}

/**
 * Create a mock comic archive with typical structure.
 */
export function createMockComicArchive(options: {
  format?: 'zip' | 'rar' | '7z';
  pageCount?: number;
  hasComicInfo?: boolean;
  comicInfoContent?: string;
  seriesName?: string;
  issueNumber?: string;
} = {}): VirtualArchive {
  const {
    format = 'zip',
    pageCount = 20,
    hasComicInfo = true,
    comicInfoContent,
    seriesName = 'Batman',
    issueNumber = '1',
  } = options;

  const entries: VirtualArchiveEntry[] = [];

  // Add pages
  for (let i = 1; i <= pageCount; i++) {
    entries.push({
      path: `${i.toString().padStart(3, '0')}.jpg`,
      content: Buffer.from(`[Image data for page ${i}]`),
      size: 500000 + Math.random() * 500000,
    });
  }

  // Add ComicInfo.xml if requested
  if (hasComicInfo) {
    const xml = comicInfoContent ?? `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>${seriesName}</Series>
  <Number>${issueNumber}</Number>
  <Title>Test Issue</Title>
  <Publisher>DC Comics</Publisher>
  <Year>2024</Year>
  <Month>1</Month>
  <Writer>Test Writer</Writer>
  <Penciller>Test Artist</Penciller>
  <Summary>A test comic issue.</Summary>
  <PageCount>${pageCount}</PageCount>
</ComicInfo>`;

    entries.push({
      path: 'ComicInfo.xml',
      content: xml,
      size: xml.length,
    });
  }

  return createVirtualArchive(format, entries);
}

/**
 * Create mock archive service functions.
 */
export function createMockArchiveService(archives: Map<string, VirtualArchive> = new Map()) {
  return {
    listArchiveContents: vi.fn().mockImplementation(async (archivePath: string): Promise<ArchiveInfo> => {
      const archive = archives.get(archivePath);
      if (!archive) {
        throw new Error(`Archive not found: ${archivePath}`);
      }

      const entries: ArchiveEntry[] = archive.entries.map((e) => ({
        path: e.path,
        size: e.size ?? (typeof e.content === 'string' ? e.content.length : e.content.length),
        packedSize: Math.floor((e.size ?? 1000) * 0.8),
        isDirectory: e.isDirectory ?? false,
        date: new Date(),
      }));

      return {
        archivePath,
        format: archive.format,
        fileCount: entries.filter((e) => !e.isDirectory).length,
        totalSize: entries.reduce((sum, e) => sum + e.size, 0),
        entries,
        hasComicInfo: archive.hasComicInfo,
        coverPath: archive.coverPath,
      };
    }),

    extractFiles: vi.fn().mockImplementation(
      async (archivePath: string, outputDir: string, files: string[]): Promise<ExtractionResult> => {
        const archive = archives.get(archivePath);
        if (!archive) {
          return {
            success: false,
            extractedPath: outputDir,
            fileCount: 0,
            error: `Archive not found: ${archivePath}`,
          };
        }

        const filesToExtract = files.length > 0
          ? archive.entries.filter((e) => files.includes(e.path))
          : archive.entries;

        return {
          success: true,
          extractedPath: outputDir,
          fileCount: filesToExtract.filter((e) => !e.isDirectory).length,
        };
      }
    ),

    extractArchive: vi.fn().mockImplementation(
      async (archivePath: string, outputDir: string): Promise<ExtractionResult> => {
        const archive = archives.get(archivePath);
        if (!archive) {
          return {
            success: false,
            extractedPath: outputDir,
            fileCount: 0,
            error: `Archive not found: ${archivePath}`,
          };
        }

        return {
          success: true,
          extractedPath: outputDir,
          fileCount: archive.entries.filter((e) => !e.isDirectory).length,
        };
      }
    ),

    extractSingleFile: vi.fn().mockImplementation(
      async (archivePath: string, entryPath: string, _outputPath: string): Promise<{ success: boolean; error?: string }> => {
        const archive = archives.get(archivePath);
        if (!archive) {
          return { success: false, error: `Archive not found: ${archivePath}` };
        }

        const entry = archive.entries.find((e) => e.path === entryPath);
        if (!entry) {
          return { success: false, error: `Entry not found: ${entryPath}` };
        }

        return { success: true };
      }
    ),

    createCbzArchive: vi.fn().mockImplementation(
      async (_sourceDir: string, outputPath: string): Promise<ArchiveCreationResult> => {
        return {
          success: true,
          archivePath: outputPath,
          fileCount: 20,
          size: 10000000,
        };
      }
    ),

    updateFileInArchive: vi.fn().mockImplementation(
      async (archivePath: string, _entryPath: string, _content: Buffer): Promise<{ success: boolean; error?: string }> => {
        const archive = archives.get(archivePath);
        if (!archive) {
          return { success: false, error: `Archive not found: ${archivePath}` };
        }

        if (archive.format === 'rar') {
          return { success: false, error: 'Cannot modify RAR archives' };
        }

        return { success: true };
      }
    ),

    validateArchive: vi.fn().mockImplementation(
      async (archivePath: string): Promise<{ valid: boolean; error?: string; info?: ArchiveInfo }> => {
        const archive = archives.get(archivePath);
        if (!archive) {
          return { valid: false, error: `Archive not found: ${archivePath}` };
        }

        const hasImages = archive.entries.some((e) =>
          /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(e.path)
        );

        if (!hasImages) {
          return { valid: false, error: 'No image files found' };
        }

        return { valid: true };
      }
    ),

    getArchiveFormat: vi.fn().mockImplementation((filePath: string): string => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'cbz':
        case 'zip':
          return 'zip';
        case 'cbr':
        case 'rar':
          return 'rar';
        case 'cb7':
        case '7z':
          return '7z';
        default:
          return 'unknown';
      }
    }),

    isComicArchive: vi.fn().mockImplementation((filePath: string): boolean => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      return ['cbz', 'cbr', 'cb7', 'cbt'].includes(ext ?? '');
    }),

    createTempDir: vi.fn().mockResolvedValue('/tmp/helixio-test-123'),

    cleanupTempDir: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Get entry content from virtual archive.
 */
export function getArchiveEntryContent(
  archive: VirtualArchive,
  entryPath: string
): Buffer | string | null {
  const entry = archive.entries.find((e) => e.path === entryPath);
  return entry?.content ?? null;
}

/**
 * Add an entry to a virtual archive.
 */
export function addArchiveEntry(
  archive: VirtualArchive,
  entry: VirtualArchiveEntry
): void {
  archive.entries.push(entry);

  // Update hasComicInfo and coverPath
  if (entry.path.toLowerCase() === 'comicinfo.xml') {
    archive.hasComicInfo = true;
  }
  if (/\.(jpg|jpeg|png|webp)$/i.test(entry.path) && !archive.coverPath) {
    archive.coverPath = entry.path;
  }
}

/**
 * Create a corrupt archive for testing error handling.
 */
export function createCorruptArchive(): VirtualArchive {
  return {
    format: 'zip',
    entries: [],
    hasComicInfo: false,
    coverPath: null,
  };
}

/**
 * Create a password-protected archive marker.
 * The mock service should check for this and return appropriate error.
 */
export function createPasswordProtectedArchive(password: string): VirtualArchive & { password: string } {
  return {
    format: 'zip',
    entries: [],
    hasComicInfo: false,
    coverPath: null,
    password,
  };
}
