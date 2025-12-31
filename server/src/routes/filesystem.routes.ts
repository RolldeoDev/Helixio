/**
 * Filesystem Routes
 *
 * API endpoints for browsing the local filesystem.
 * Used by the folder picker in the UI for selecting library paths.
 */

import { Router, Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import { homedir, platform } from 'os';
import path from 'path';
import { logError } from '../services/logger.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// All filesystem browsing routes require admin authentication
router.use(requireAdmin);

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * Normalize path for consistent format across platforms
 */
function normalizePath(inputPath: string): string {
  // Normalize the path
  let normalized = path.normalize(inputPath);

  // On Unix systems, ensure leading slash
  if (platform() !== 'win32' && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Remove trailing slash (unless it's the root)
  if (normalized.length > 1 && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Get common starting locations for the folder browser
 */
function getStartingLocations(): DirectoryEntry[] {
  const locations: DirectoryEntry[] = [];

  // Home directory
  const home = homedir();
  locations.push({
    name: 'Home',
    path: home,
    isDirectory: true,
  });

  if (platform() === 'win32') {
    // Windows: common drives
    const drives = ['C:', 'D:', 'E:', 'F:'];
    for (const drive of drives) {
      locations.push({
        name: drive,
        path: drive + '\\',
        isDirectory: true,
      });
    }
  } else {
    // Unix: common locations
    locations.push(
      { name: 'Root', path: '/', isDirectory: true },
      { name: 'Volumes', path: '/Volumes', isDirectory: true },
      { name: 'Media', path: '/media', isDirectory: true },
      { name: 'mnt', path: '/mnt', isDirectory: true }
    );
  }

  return locations;
}

/**
 * GET /api/filesystem/roots
 * Get common starting locations for browsing
 */
router.get('/roots', async (_req: Request, res: Response) => {
  try {
    const locations = getStartingLocations();

    // Filter to only include existing locations
    const existingLocations: DirectoryEntry[] = [];
    for (const loc of locations) {
      try {
        const stats = await stat(loc.path);
        if (stats.isDirectory()) {
          existingLocations.push(loc);
        }
      } catch {
        // Skip non-existent locations
      }
    }

    res.json({ locations: existingLocations });
  } catch (error) {
    logError('filesystem', error, { action: 'get-filesystem-roots' });
    res.status(500).json({
      error: 'Failed to get filesystem roots',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/filesystem/browse
 * List contents of a directory
 * Query params:
 *   - path: The directory path to browse (defaults to home directory)
 */
router.get('/browse', async (req: Request, res: Response) => {
  try {
    const requestedPath = (req.query.path as string) || homedir();
    const normalizedPath = normalizePath(requestedPath);

    // Verify path exists and is a directory
    let stats;
    try {
      stats = await stat(normalizedPath);
    } catch (error) {
      res.status(404).json({
        error: 'Path not found',
        path: normalizedPath,
        message: error instanceof Error ? error.message : 'Path does not exist',
      });
      return;
    }

    if (!stats.isDirectory()) {
      res.status(400).json({
        error: 'Not a directory',
        path: normalizedPath,
      });
      return;
    }

    // Read directory contents
    const entries = await readdir(normalizedPath, { withFileTypes: true });

    // Filter to only directories and sort alphabetically
    const directories: DirectoryEntry[] = entries
      .filter((entry) => {
        // Skip hidden files/directories (those starting with .)
        if (entry.name.startsWith('.')) return false;
        // Only include directories
        return entry.isDirectory();
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Calculate parent path
    const parentPath = path.dirname(normalizedPath);
    const hasParent = parentPath !== normalizedPath;

    res.json({
      currentPath: normalizedPath,
      parentPath: hasParent ? parentPath : null,
      directories,
    });
  } catch (error) {
    logError('filesystem', error, { action: 'browse-directory' });
    res.status(500).json({
      error: 'Failed to browse directory',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/filesystem/validate
 * Validate that a path exists and is a directory
 * Query params:
 *   - path: The path to validate
 */
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const requestedPath = req.query.path as string;

    if (!requestedPath) {
      res.status(400).json({
        valid: false,
        error: 'Path is required',
      });
      return;
    }

    const normalizedPath = normalizePath(requestedPath);

    try {
      const stats = await stat(normalizedPath);

      if (!stats.isDirectory()) {
        res.json({
          valid: false,
          path: normalizedPath,
          error: 'Path is not a directory',
        });
        return;
      }

      res.json({
        valid: true,
        path: normalizedPath,
      });
    } catch (error) {
      res.json({
        valid: false,
        path: normalizedPath,
        error: error instanceof Error ? error.message : 'Path not accessible',
      });
    }
  } catch (error) {
    logError('filesystem', error, { action: 'validate-path' });
    res.status(500).json({
      valid: false,
      error: 'Failed to validate path',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
