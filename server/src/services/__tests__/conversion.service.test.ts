/**
 * Conversion Service Tests
 *
 * Tests for CBR to CBZ file conversion functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaClient, createMockComicFile, createMockOperationLog } from './__mocks__/prisma.mock.js';

// =============================================================================
// Mocks
// =============================================================================

const mockPrisma = createMockPrismaClient();

vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

const mockArchive = {
  extractArchive: vi.fn(),
  createCbzArchive: vi.fn(),
  validateArchive: vi.fn(),
  testArchiveExtraction: vi.fn(),
  createTempDir: vi.fn(),
  cleanupTempDir: vi.fn(),
  getArchiveFormat: vi.fn(),
  listArchiveContents: vi.fn(),
};

vi.mock('../archive.service.js', () => mockArchive);

const mockFileOperations = {
  quarantineFile: vi.fn(),
};

vi.mock('../file-operations.service.js', () => mockFileOperations);

vi.mock('../logger.service.js', () => ({
  conversionLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs/promises
const mockFs = {
  unlink: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
};

vi.mock('fs/promises', () => mockFs);

// Import AFTER mocks
const {
  convertCbrToCbz,
  batchConvertCbrToCbz,
  canConvert,
  getConversionPreview,
  findConvertibleFiles,
} = await import('../conversion.service.js');

// =============================================================================
// Tests
// =============================================================================

describe('Conversion Service', () => {
  // Track temp dir counter for unique names
  let tempDirCounter = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDirCounter = 0;

    // Default mock implementations
    // stat: default behavior - CBR exists, CBZ doesn't
    mockFs.stat.mockImplementation((path: string) => {
      if (path.endsWith('.cbr')) {
        return Promise.resolve({ size: 1000000 });
      }
      // For output.cbz in temp dir or final destination, return new size
      if (path.includes('/tmp/') && path.endsWith('.cbz')) {
        return Promise.resolve({ size: 900000 });
      }
      // Final destination CBZ doesn't exist by default
      return Promise.reject(new Error('ENOENT'));
    });

    // Create temp dirs - can be called multiple times per conversion
    mockArchive.createTempDir.mockImplementation(() => {
      tempDirCounter++;
      return Promise.resolve(`/tmp/convert-${tempDirCounter}`);
    });
    mockArchive.cleanupTempDir.mockResolvedValue(undefined);
    mockArchive.validateArchive.mockResolvedValue({
      valid: true,
      info: {
        entries: [
          { path: 'page001.jpg', isDirectory: false },
          { path: 'page002.jpg', isDirectory: false },
        ],
      },
    });
    mockArchive.extractArchive.mockResolvedValue({
      success: true,
      fileCount: 10,
    });
    mockArchive.createCbzArchive.mockResolvedValue({
      success: true,
      fileCount: 10,
      size: 900000,
    });
    mockFs.readdir.mockResolvedValue(['page001.jpg', 'page002.jpg']);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockPrisma.comicFile.findFirst.mockResolvedValue(null);
    mockPrisma.operationLog.create.mockResolvedValue(createMockOperationLog());
  });

  // ===========================================================================
  // convertCbrToCbz
  // ===========================================================================

  describe('convertCbrToCbz', () => {
    it('should successfully convert a CBR to CBZ', async () => {
      // Override stat to handle both temp and final CBZ paths
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        // First CBZ stat call is destination check (should fail = doesn't exist)
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        // All other CBZ stats (temp file, final file after rename)
        return Promise.resolve({ size: 900000 });
      });

      const result = await convertCbrToCbz('/comics/test.cbr');

      expect(result.success).toBe(true);
      expect(result.source).toBe('/comics/test.cbr');
      expect(result.destination).toBe('/comics/test.cbz');
      expect(result.originalSize).toBe(1000000);
    });

    it('should reject non-CBR files', async () => {
      const result = await convertCbrToCbz('/comics/test.cbz');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File is not a CBR archive');
    });

    it('should check if destination exists when overwrite is false', async () => {
      // Override stat to make destination exist
      mockFs.stat.mockImplementation((path: string) => {
        // Both original and destination exist
        return Promise.resolve({ size: path.endsWith('.cbr') ? 1000000 : 500000 });
      });

      const result = await convertCbrToCbz('/comics/test.cbr', { overwrite: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Destination CBZ file already exists');
    });

    it('should overwrite destination when overwrite is true', async () => {
      // Override stat to make destination exist initially
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1) {
          // First call - destination exists
          return Promise.resolve({ size: 500000 });
        }
        // After conversion, return new size
        return Promise.resolve({ size: 900000 });
      });

      const result = await convertCbrToCbz('/comics/test.cbr', { overwrite: true });

      expect(result.success).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalled(); // Should delete existing destination
    });

    it('should handle corrupted source archive', async () => {
      mockArchive.validateArchive.mockResolvedValueOnce({
        valid: false,
        error: 'Cannot read archive header',
      });

      const result = await convertCbrToCbz('/comics/corrupted.cbr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Corrupted source archive');
    });

    it('should quarantine corrupted files when option is set', async () => {
      mockArchive.validateArchive.mockResolvedValueOnce({
        valid: false,
        error: 'Cannot read archive',
      });

      const fileRecord = createMockComicFile({ id: 'file-1', path: '/comics/corrupted.cbr' });
      mockPrisma.comicFile.findFirst.mockResolvedValueOnce(fileRecord);
      mockFileOperations.quarantineFile.mockResolvedValue(undefined);

      const result = await convertCbrToCbz('/comics/corrupted.cbr', {
        quarantineOnFailure: true,
      });

      expect(result.success).toBe(false);
      expect(result.quarantined).toBe(true);
      expect(mockFileOperations.quarantineFile).toHaveBeenCalledWith(
        'file-1',
        expect.stringContaining('Corrupted')
      );
    });

    it('should handle extraction failure', async () => {
      mockArchive.extractArchive.mockResolvedValueOnce({
        success: false,
        error: 'Extraction failed: password required',
      });

      const result = await convertCbrToCbz('/comics/encrypted.cbr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to extract CBR');
    });

    it('should handle CBZ creation failure', async () => {
      mockArchive.createCbzArchive.mockResolvedValueOnce({
        success: false,
        error: 'Disk full',
      });

      const result = await convertCbrToCbz('/comics/test.cbr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create CBZ');
    });

    it('should validate new CBZ archive', async () => {
      // First validation passes (source), second fails (destination)
      mockArchive.validateArchive
        .mockResolvedValueOnce({
          valid: true,
          info: { entries: [{ path: 'page1.jpg', isDirectory: false }] },
        })
        .mockResolvedValueOnce({
          valid: false,
          error: 'Invalid ZIP structure',
        });

      const result = await convertCbrToCbz('/comics/test.cbr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('CBZ validation failed');
    });

    it('should detect image count mismatch', async () => {
      mockArchive.validateArchive
        .mockResolvedValueOnce({
          valid: true,
          info: {
            entries: [
              { path: 'page1.jpg', isDirectory: false },
              { path: 'page2.jpg', isDirectory: false },
              { path: 'page3.jpg', isDirectory: false },
            ],
          },
        })
        .mockResolvedValueOnce({
          valid: true,
          info: {
            entries: [
              { path: 'page1.jpg', isDirectory: false },
              // Missing page2 and page3
            ],
          },
        });

      const result = await convertCbrToCbz('/comics/test.cbr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Image count mismatch');
    });

    it('should delete original when deleteOriginal is true', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      await convertCbrToCbz('/comics/test.cbr', { deleteOriginal: true });

      // unlink should be called for original file
      expect(mockFs.unlink).toHaveBeenCalledWith('/comics/test.cbr');
    });

    it('should keep original when deleteOriginal is false', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      await convertCbrToCbz('/comics/test.cbr', { deleteOriginal: false });

      // unlink should NOT be called for original file
      expect(mockFs.unlink).not.toHaveBeenCalledWith('/comics/test.cbr');
    });

    it('should update database record after conversion', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      const fileRecord = createMockComicFile({
        id: 'file-1',
        path: '/comics/test.cbr',
        relativePath: 'test.cbr',
      });
      mockPrisma.comicFile.findFirst.mockResolvedValueOnce(fileRecord);
      mockPrisma.comicFile.update.mockResolvedValue({});

      await convertCbrToCbz('/comics/test.cbr');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: expect.objectContaining({
          path: '/comics/test.cbz',
          filename: 'test.cbz',
          relativePath: 'test.cbz',
        }),
      });
    });

    it('should log conversion operation to database', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      await convertCbrToCbz('/comics/test.cbr');

      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'convert',
          source: '/comics/test.cbr',
          destination: '/comics/test.cbz',
          status: 'success',
        }),
      });
    });

    it('should cleanup temp directories on success', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      await convertCbrToCbz('/comics/test.cbr');

      expect(mockArchive.cleanupTempDir).toHaveBeenCalled();
    });

    it('should cleanup temp directories on failure', async () => {
      mockArchive.extractArchive.mockResolvedValueOnce({
        success: false,
        error: 'Failed',
      });

      await convertCbrToCbz('/comics/test.cbr');

      expect(mockArchive.cleanupTempDir).toHaveBeenCalled();
    });

    it('should call progress callback when provided', async () => {
      // Setup successful conversion mocks
      let cbzStatCalls = 0;
      mockFs.stat.mockImplementation((path: string) => {
        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        cbzStatCalls++;
        if (cbzStatCalls === 1 && !path.includes('/tmp/')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve({ size: 900000 });
      });

      const onProgress = vi.fn();

      await convertCbrToCbz('/comics/test.cbr', { onProgress });

      expect(onProgress).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // batchConvertCbrToCbz
  // ===========================================================================

  describe('batchConvertCbrToCbz', () => {
    // Helper to setup successful conversion mocks that track file state
    function setupSuccessMocks() {
      // Track which destination files have been "created" by rename
      const createdFiles = new Set<string>();
      // Track stat calls per file to differentiate between destination-check and post-rename
      const statCallsPerPath: Record<string, number> = {};

      mockFs.stat.mockImplementation((path: string) => {
        statCallsPerPath[path] = (statCallsPerPath[path] || 0) + 1;

        if (path.endsWith('.cbr')) {
          return Promise.resolve({ size: 1000000 });
        }
        // Temp CBZ files always exist
        if (path.includes('/tmp/')) {
          return Promise.resolve({ size: 900000 });
        }
        // Final destination: check if it's been "created"
        if (createdFiles.has(path)) {
          return Promise.resolve({ size: 900000 });
        }
        // First call to destination = doesn't exist
        return Promise.reject(new Error('ENOENT'));
      });

      // Track when files are "created" via rename
      mockFs.rename.mockImplementation((from: string, to: string) => {
        createdFiles.add(to);
        return Promise.resolve();
      });
    }

    it('should convert multiple files', async () => {
      setupSuccessMocks();

      const result = await batchConvertCbrToCbz([
        '/comics/test1.cbr',
        '/comics/test2.cbr',
      ]);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should count failures separately', async () => {
      setupSuccessMocks();
      // First file succeeds, second fails
      mockArchive.extractArchive
        .mockResolvedValueOnce({ success: true, fileCount: 10 })
        .mockResolvedValueOnce({ success: false, error: 'Failed' });

      const result = await batchConvertCbrToCbz([
        '/comics/test1.cbr',
        '/comics/test2.cbr',
      ]);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should pass options to each conversion', async () => {
      setupSuccessMocks();
      const onProgress = vi.fn();

      await batchConvertCbrToCbz(
        ['/comics/test1.cbr'],
        { deleteOriginal: false, onProgress }
      );

      // Original should not be deleted
      expect(mockFs.unlink).not.toHaveBeenCalledWith('/comics/test1.cbr');
      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const result = await batchConvertCbrToCbz([]);

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  // ===========================================================================
  // canConvert
  // ===========================================================================

  describe('canConvert', () => {
    it('should return true for valid CBR files', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('rar');
      mockArchive.listArchiveContents.mockResolvedValue({
        fileCount: 10,
        totalSize: 1000000,
      });

      const result = await canConvert('/comics/test.cbr');

      expect(result.canConvert).toBe(true);
    });

    it('should return false for CBZ files', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('zip');

      const result = await canConvert('/comics/test.cbz');

      expect(result.canConvert).toBe(false);
      expect(result.reason).toContain('already in ZIP/CBZ format');
    });

    it('should return false for unsupported formats', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('7z');

      const result = await canConvert('/comics/test.cb7');

      expect(result.canConvert).toBe(false);
      expect(result.reason).toContain('Unsupported format');
    });

    it('should return false for empty archives', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('rar');
      mockArchive.listArchiveContents.mockResolvedValue({
        fileCount: 0,
        totalSize: 0,
      });

      const result = await canConvert('/comics/empty.cbr');

      expect(result.canConvert).toBe(false);
      expect(result.reason).toBe('Archive is empty');
    });

    it('should return false for unreadable archives', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('rar');
      mockArchive.listArchiveContents.mockRejectedValue(new Error('Cannot read file'));

      const result = await canConvert('/comics/unreadable.cbr');

      expect(result.canConvert).toBe(false);
      expect(result.reason).toBe('Cannot read file');
    });
  });

  // ===========================================================================
  // getConversionPreview
  // ===========================================================================

  describe('getConversionPreview', () => {
    it('should return preview for convertible file', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('rar');
      mockArchive.listArchiveContents.mockResolvedValue({
        fileCount: 25,
        totalSize: 50000000,
      });

      const result = await getConversionPreview('/comics/test.cbr');

      expect(result.source).toBe('/comics/test.cbr');
      expect(result.destination).toBe('/comics/test.cbz');
      expect(result.format).toBe('rar');
      expect(result.canConvert).toBe(true);
      expect(result.fileCount).toBe(25);
      expect(result.totalSize).toBe(50000000);
    });

    it('should return preview for non-convertible file', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('zip');

      const result = await getConversionPreview('/comics/test.cbz');

      expect(result.canConvert).toBe(false);
      expect(result.reason).toContain('already in ZIP/CBZ format');
    });

    it('should handle errors gracefully for preview', async () => {
      mockArchive.getArchiveFormat.mockReturnValue('rar');
      mockArchive.listArchiveContents
        .mockResolvedValueOnce({ fileCount: 10, totalSize: 1000 }) // for canConvert
        .mockRejectedValueOnce(new Error('Error')); // for preview details

      const result = await getConversionPreview('/comics/test.cbr');

      // Should still return basic info even if details fail
      expect(result.source).toBe('/comics/test.cbr');
      expect(result.canConvert).toBe(true);
    });
  });

  // ===========================================================================
  // findConvertibleFiles
  // ===========================================================================

  describe('findConvertibleFiles', () => {
    it('should find all CBR files in a library', async () => {
      const cbrFiles = [
        createMockComicFile({ id: 'f1', path: '/comics/test1.cbr', filename: 'test1.cbr', size: 1000 }),
        createMockComicFile({ id: 'f2', path: '/comics/test2.cbr', filename: 'test2.cbr', size: 2000 }),
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(cbrFiles);

      const result = await findConvertibleFiles('library-1');

      expect(result.files).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalSize).toBe(3000);
    });

    it('should exclude quarantined files', async () => {
      mockPrisma.comicFile.findMany.mockResolvedValue([]);

      await findConvertibleFiles('library-1');

      const findCall = mockPrisma.comicFile.findMany.mock.calls[0]![0];
      expect(findCall.where.status).toEqual({ not: 'quarantined' });
    });

    it('should only find .cbr files', async () => {
      mockPrisma.comicFile.findMany.mockResolvedValue([]);

      await findConvertibleFiles('library-1');

      const findCall = mockPrisma.comicFile.findMany.mock.calls[0]![0];
      expect(findCall.where.filename).toEqual({ endsWith: '.cbr' });
    });

    it('should return empty result when no CBR files', async () => {
      mockPrisma.comicFile.findMany.mockResolvedValue([]);

      const result = await findConvertibleFiles('library-1');

      expect(result.files).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalSize).toBe(0);
    });
  });
});
