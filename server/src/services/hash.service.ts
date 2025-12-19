/**
 * Hash Service
 *
 * Provides fast partial file hashing for file matching/move detection.
 * Uses first and last N bytes to create a fingerprint without reading entire files.
 */

import { createHash } from 'crypto';
import { open, stat } from 'fs/promises';

// Number of bytes to read from start and end of file
const HASH_CHUNK_SIZE = 64 * 1024; // 64KB from each end

/**
 * Generate a partial hash of a file using first and last N bytes.
 * This is much faster than hashing the entire file for large archives.
 *
 * Hash format: sha256(first64KB + last64KB + fileSize)
 * Including file size helps differentiate files that might have similar beginnings/endings.
 */
export async function generatePartialHash(filePath: string): Promise<string> {
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;

  // For small files, just hash the whole thing
  if (fileSize <= HASH_CHUNK_SIZE * 2) {
    return generateFullHash(filePath);
  }

  const hash = createHash('sha256');
  const fileHandle = await open(filePath, 'r');

  try {
    // Read first chunk
    const firstChunk = Buffer.alloc(HASH_CHUNK_SIZE);
    await fileHandle.read(firstChunk, 0, HASH_CHUNK_SIZE, 0);
    hash.update(firstChunk);

    // Read last chunk
    const lastChunk = Buffer.alloc(HASH_CHUNK_SIZE);
    const lastChunkPosition = fileSize - HASH_CHUNK_SIZE;
    await fileHandle.read(lastChunk, 0, HASH_CHUNK_SIZE, lastChunkPosition);
    hash.update(lastChunk);

    // Include file size in hash to help differentiate similar files
    hash.update(fileSize.toString());

    return hash.digest('hex');
  } finally {
    await fileHandle.close();
  }
}

/**
 * Generate a full SHA-256 hash of a file.
 * Used for small files or when full verification is needed.
 */
export async function generateFullHash(filePath: string): Promise<string> {
  const { createReadStream } = await import('fs');

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data: Buffer | string) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verify if a file matches a given partial hash.
 */
export async function verifyPartialHash(filePath: string, expectedHash: string): Promise<boolean> {
  try {
    const actualHash = await generatePartialHash(filePath);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(filePath: string): Promise<number> {
  const fileStats = await stat(filePath);
  return fileStats.size;
}

/**
 * Get file modification time.
 */
export async function getFileModifiedTime(filePath: string): Promise<Date> {
  const fileStats = await stat(filePath);
  return fileStats.mtime;
}

/**
 * Get basic file info including size and modification time.
 */
export interface FileInfo {
  size: number;
  modifiedAt: Date;
  hash?: string;
}

export async function getFileInfo(filePath: string, includeHash = false): Promise<FileInfo> {
  const fileStats = await stat(filePath);
  const info: FileInfo = {
    size: fileStats.size,
    modifiedAt: fileStats.mtime,
  };

  if (includeHash) {
    info.hash = await generatePartialHash(filePath);
  }

  return info;
}
