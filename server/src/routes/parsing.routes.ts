/**
 * Parsing Routes
 *
 * API endpoints for filename parsing, rename suggestions, and conventions management.
 */

import { Router, Request, Response } from 'express';
import { basename, dirname, join } from 'path';
import {
  parseFilename,
  parseFilenames,
  parseFilenameRegex,
  generateRenamePreview,
  generateBatchRenamePreview,
  isLLMAvailable,
  loadConventions,
  generateSuggestedFilename,
  generateSuggestedFolderName,
  ParsedFileMetadata,
} from '../services/filename-parser.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Parsing Endpoints
// =============================================================================

/**
 * POST /api/parsing/parse
 * Parse a single filename.
 * Body: { filename: string, folderPath?: string, useLLM?: boolean }
 */
router.post('/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, folderPath, useLLM } = req.body;

    if (!filename || typeof filename !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'filename is required',
      });
      return;
    }

    const result = await parseFilename(filename, folderPath, { useLLM });

    res.json({
      success: true,
      result,
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-filename' });
    res.status(500).json({
      error: 'Parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/parsing/parse-batch
 * Parse multiple filenames in batch.
 * Body: { files: Array<{ filename: string, folderPath?: string }>, useLLM?: boolean }
 */
router.post('/parse-batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { files, useLLM } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'files must be a non-empty array',
      });
      return;
    }

    // Validate files array
    for (const file of files) {
      if (!file.filename || typeof file.filename !== 'string') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'Each file must have a filename property',
        });
        return;
      }
    }

    // Limit batch size
    if (files.length > 100) {
      res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 files per batch',
      });
      return;
    }

    const results = await parseFilenames(files, { useLLM });

    res.json({
      success: true,
      total: files.length,
      results,
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-batch' });
    res.status(500).json({
      error: 'Batch parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/parsing/parse-regex
 * Parse a filename using only regex (no LLM).
 * Body: { filename: string, folderPath?: string }
 */
router.post('/parse-regex', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, folderPath } = req.body;

    if (!filename || typeof filename !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'filename is required',
      });
      return;
    }

    const result = parseFilenameRegex(filename, folderPath);

    res.json({
      success: true,
      result,
      llmUsed: false,
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-regex' });
    res.status(500).json({
      error: 'Parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// File-based Parsing Endpoints
// =============================================================================

/**
 * POST /api/parsing/parse-file/:fileId
 * Parse a file by its database ID.
 * Query: useLLM (boolean)
 */
router.post('/parse-file/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const useLLM = req.query.useLLM !== 'false';

    const prisma = getDatabase();
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filename = basename(file.path);
    const folderPath = dirname(file.path);

    const result = await parseFilename(filename, folderPath, { useLLM });

    res.json({
      success: true,
      fileId,
      filePath: file.path,
      result,
      llmUsed: useLLM && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-file' });
    res.status(500).json({
      error: 'Parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/parsing/parse-files
 * Parse multiple files by their database IDs.
 * Body: { fileIds: string[], useLLM?: boolean }
 */
router.post('/parse-files', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds, useLLM } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileIds must be a non-empty array',
      });
      return;
    }

    if (fileIds.length > 100) {
      res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 files per batch',
      });
      return;
    }

    const prisma = getDatabase();
    const files = await prisma.comicFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, path: true },
    });

    const fileMap = new Map(files.map((f: { id: string; path: string }) => [f.id, f]));

    const filesToParse = fileIds
      .map((id) => {
        const file = fileMap.get(id);
        if (!file) return null;
        return {
          id,
          filename: basename(file.path),
          folderPath: dirname(file.path),
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const parseResults = await parseFilenames(
      filesToParse.map((f) => ({ filename: f.filename, folderPath: f.folderPath })),
      { useLLM }
    );

    const results = filesToParse.map((file, i) => ({
      fileId: file.id,
      filename: file.filename,
      folderPath: file.folderPath,
      result: parseResults[i],
    }));

    res.json({
      success: true,
      total: fileIds.length,
      found: files.length,
      results,
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-files' });
    res.status(500).json({
      error: 'Batch parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Rename Suggestion Endpoints
// =============================================================================

/**
 * POST /api/parsing/suggest-rename
 * Generate rename suggestions for a file.
 * Body: { filename: string, folderPath?: string, useLLM?: boolean }
 */
router.post('/suggest-rename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, folderPath, useLLM } = req.body;

    if (!filename || typeof filename !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'filename is required',
      });
      return;
    }

    const parsed = await parseFilename(filename, folderPath, { useLLM });
    const suggestedFilename = generateSuggestedFilename(parsed);
    const suggestedFolderName = generateSuggestedFolderName(parsed);

    res.json({
      success: true,
      original: filename,
      parsed,
      suggestions: {
        filename: suggestedFilename,
        folderName: suggestedFolderName,
        fullPath: suggestedFolderName && suggestedFilename
          ? join(suggestedFolderName, suggestedFilename)
          : null,
      },
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'suggest-rename' });
    res.status(500).json({
      error: 'Suggestion failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/parsing/suggest-rename-batch
 * Generate rename suggestions for multiple files.
 * Body: { files: Array<{ filename: string, folderPath?: string }>, useLLM?: boolean }
 */
router.post('/suggest-rename-batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { files, useLLM } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'files must be a non-empty array',
      });
      return;
    }

    if (files.length > 100) {
      res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 files per batch',
      });
      return;
    }

    const parseResults = await parseFilenames(files, { useLLM });

    const suggestions = files.map((file, i) => {
      const parsed = parseResults[i]!;
      const suggestedFilename = generateSuggestedFilename(parsed);
      const suggestedFolderName = generateSuggestedFolderName(parsed);

      return {
        original: file.filename,
        folderPath: file.folderPath,
        parsed,
        suggestions: {
          filename: suggestedFilename,
          folderName: suggestedFolderName,
          fullPath: suggestedFolderName && suggestedFilename
            ? join(suggestedFolderName, suggestedFilename)
            : null,
        },
      };
    });

    const withSuggestions = suggestions.filter((s) => s.suggestions.filename !== null);

    res.json({
      success: true,
      total: files.length,
      withSuggestions: withSuggestions.length,
      suggestions,
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'suggest-rename-batch' });
    res.status(500).json({
      error: 'Batch suggestion failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/parsing/suggest-rename-file/:fileId
 * Generate rename suggestion for a file by its database ID.
 * Query: useLLM (boolean)
 */
router.post('/suggest-rename-file/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const useLLM = req.query.useLLM !== 'false';

    const prisma = getDatabase();
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const preview = await generateRenamePreview(file.path, { useLLM });

    res.json({
      success: true,
      fileId,
      ...preview,
      llmUsed: useLLM && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'suggest-rename-file' });
    res.status(500).json({
      error: 'Suggestion failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Conventions Endpoints
// =============================================================================

/**
 * GET /api/parsing/conventions
 * Get the current naming conventions.
 */
router.get('/conventions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const conventions = loadConventions();

    res.json({
      success: true,
      conventions,
    });
  } catch (err) {
    logError('parsing', err, { action: 'get-conventions' });
    res.status(500).json({
      error: 'Failed to load conventions',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/parsing/noise-tokens
 * Get the list of noise tokens.
 */
router.get('/noise-tokens', async (_req: Request, res: Response): Promise<void> => {
  try {
    const conventions = loadConventions();

    res.json({
      success: true,
      noiseTokens: conventions.noise_tokens || [],
    });
  } catch (err) {
    logError('parsing', err, { action: 'get-noise-tokens' });
    res.status(500).json({
      error: 'Failed to load noise tokens',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Status Endpoints
// =============================================================================

/**
 * GET /api/parsing/status
 * Get the status of the parsing service.
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const llmAvailable = isLLMAvailable();
    const conventions = loadConventions();

    res.json({
      llmAvailable,
      regexFallbackAvailable: true,
      conventionsLoaded: !!conventions,
      noiseTokensCount: conventions.noise_tokens?.length || 0,
    });
  } catch (err) {
    logError('parsing', err, { action: 'get-status' });
    res.status(500).json({
      error: 'Status check failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Library-level Parsing
// =============================================================================

/**
 * POST /api/parsing/library/:libraryId/parse
 * Parse all files in a library (or subset with filters).
 * Body: { limit?: number, offset?: number, status?: string, useLLM?: boolean }
 */
router.post('/library/:libraryId/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.params;
    const { limit = 50, offset = 0, status, useLLM } = req.body;

    const prisma = getDatabase();

    // Build where clause
    const where: { libraryId: string; status?: string } = { libraryId: libraryId! };
    if (status) {
      where.status = status;
    }

    // Get files
    const files = await prisma.comicFile.findMany({
      where,
      select: { id: true, path: true },
      take: Math.min(limit, 100),
      skip: offset,
    });

    if (files.length === 0) {
      res.json({
        success: true,
        total: 0,
        results: [],
      });
      return;
    }

    // Parse files
    const filesToParse = files.map((f: { id: string; path: string }) => ({
      id: f.id,
      filename: basename(f.path),
      folderPath: dirname(f.path),
    }));

    const parseResults = await parseFilenames(
      filesToParse.map((f) => ({ filename: f.filename, folderPath: f.folderPath })),
      { useLLM }
    );

    const results = filesToParse.map((file, i) => ({
      fileId: file.id,
      filename: file.filename,
      folderPath: file.folderPath,
      parsed: parseResults[i],
      suggestion: {
        filename: generateSuggestedFilename(parseResults[i]!),
        folderName: generateSuggestedFolderName(parseResults[i]!),
      },
    }));

    res.json({
      success: true,
      total: files.length,
      offset,
      results,
      llmUsed: useLLM !== false && isLLMAvailable(),
    });
  } catch (err) {
    logError('parsing', err, { action: 'parse-library-files' });
    res.status(500).json({
      error: 'Library parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
