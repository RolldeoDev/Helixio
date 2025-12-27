/**
 * Search Routes
 *
 * API endpoints for searching comic metadata from external sources (ComicVine, Metron).
 */

import { Router, Request, Response } from 'express';
import {
  search,
  searchSeries,
  searchIssues,
  getSeriesMetadata,
  getIssueMetadata,
  getSeriesIssues,
  checkSourcesAvailability,
  parseFilenameToQuery,
  MetadataSource,
  SearchQuery,
} from '../services/metadata-search.service.js';
import { getDatabase } from '../services/database.service.js';
import { mergeComicInfo, readComicInfo, ComicInfo } from '../services/comicinfo.service.js';
import { cacheFileMetadata } from '../services/metadata-cache.service.js';
import { invalidateFileMetadata } from '../services/metadata-invalidation.service.js';
import {
  MetadataFetchLogger,
  formatLogEntry,
  getStepDisplayName,
  getStepNumber,
  getTotalSteps,
} from '../services/metadata-fetch-logger.service.js';
import {
  parseFilename as llmParseFilename,
  isLLMAvailable,
} from '../services/filename-parser.service.js';

const router = Router();

// =============================================================================
// Search Endpoints
// =============================================================================

/**
 * GET /api/search
 * Combined search for series and issues.
 * Query params: series, issueNumber, publisher, year, limit, sources (comma-separated)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query: SearchQuery = {
      series: req.query.series as string | undefined,
      issueNumber: req.query.issueNumber as string | undefined,
      publisher: req.query.publisher as string | undefined,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    };

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const sources = req.query.sources
      ? (req.query.sources as string).split(',').filter((s): s is MetadataSource =>
          ['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(s)
        )
      : undefined;

    const results = await search(query, { limit, sources });

    res.json(results);
  } catch (err) {
    console.error('Error in search:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/series
 * Search for series/volumes.
 * Query params: series (required), publisher, year, limit, sources
 */
router.get('/series', async (req: Request, res: Response): Promise<void> => {
  try {
    const series = req.query.series as string;

    if (!series) {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'series parameter is required',
      });
      return;
    }

    const query: SearchQuery = {
      series,
      publisher: req.query.publisher as string | undefined,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    };

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const sources = req.query.sources
      ? (req.query.sources as string).split(',').filter((s): s is MetadataSource =>
          ['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(s)
        )
      : undefined;

    const results = await searchSeries(query, { limit, sources });

    res.json(results);
  } catch (err) {
    console.error('Error in series search:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/issues
 * Search for issues.
 * Query params: series, issueNumber, publisher, year, limit, sources, seriesSource, seriesId
 */
router.get('/issues', async (req: Request, res: Response): Promise<void> => {
  try {
    const query: SearchQuery = {
      series: req.query.series as string | undefined,
      issueNumber: req.query.issueNumber as string | undefined,
      publisher: req.query.publisher as string | undefined,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    };

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const sources = req.query.sources
      ? (req.query.sources as string).split(',').filter((s): s is MetadataSource =>
          ['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(s)
        )
      : undefined;

    // Optional: search within a specific series
    const seriesId =
      req.query.seriesSource && req.query.seriesId
        ? {
            source: req.query.seriesSource as MetadataSource,
            id: req.query.seriesId as string,
          }
        : undefined;

    const results = await searchIssues(query, { limit, sources, seriesId });

    res.json(results);
  } catch (err) {
    console.error('Error in issue search:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/search/parse-filename
 * Parse a filename to extract search query components.
 * Body: { filename: string }
 */
router.post('/parse-filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.body;

    if (!filename || typeof filename !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'filename is required',
      });
      return;
    }

    const query = parseFilenameToQuery(filename);

    res.json({
      filename,
      query,
    });
  } catch (err) {
    console.error('Error parsing filename:', err);
    res.status(500).json({
      error: 'Parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/search/parse-filenames
 * Parse multiple filenames to extract search queries.
 * Body: { filenames: string[] }
 */
router.post('/parse-filenames', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filenames } = req.body;

    if (!Array.isArray(filenames)) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'filenames must be an array',
      });
      return;
    }

    const results = filenames.map((filename) => ({
      filename,
      query: parseFilenameToQuery(filename),
    }));

    res.json({ results });
  } catch (err) {
    console.error('Error parsing filenames:', err);
    res.status(500).json({
      error: 'Parse failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Metadata Retrieval Endpoints
// =============================================================================

/**
 * GET /api/search/series/:source/:id
 * Get full series metadata from a source.
 */
router.get('/series/:source/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, id } = req.params;

    if (!['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(source!)) {
      res.status(400).json({
        error: 'Invalid source',
        message: 'source must be comicvine, metron, gcd, anilist, or mal',
      });
      return;
    }

    const metadata = await getSeriesMetadata(source as MetadataSource, id!);

    if (!metadata) {
      res.status(404).json({
        error: 'Not found',
        message: 'Series not found',
      });
      return;
    }

    res.json({
      source,
      sourceId: id,
      metadata,
    });
  } catch (err) {
    console.error('Error getting series metadata:', err);
    res.status(500).json({
      error: 'Failed to get metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/series/:source/:id/issues
 * Get all issues for a series from a source.
 * Query params: limit, page
 */
router.get('/series/:source/:id/issues', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, id } = req.params;

    if (!['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(source!)) {
      res.status(400).json({
        error: 'Invalid source',
        message: 'source must be comicvine, metron, gcd, anilist, or mal',
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const result = await getSeriesIssues(source as MetadataSource, id!, { limit, page });

    res.json({
      source,
      seriesId: id,
      ...result,
    });
  } catch (err) {
    console.error('Error getting series issues:', err);
    res.status(500).json({
      error: 'Failed to get issues',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/issue/:source/:id
 * Get full issue metadata from a source.
 */
router.get('/issue/:source/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, id } = req.params;

    if (!['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(source!)) {
      res.status(400).json({
        error: 'Invalid source',
        message: 'source must be comicvine, metron, gcd, anilist, or mal',
      });
      return;
    }

    const metadata = await getIssueMetadata(source as MetadataSource, id!);

    if (!metadata) {
      res.status(404).json({
        error: 'Not found',
        message: 'Issue not found',
      });
      return;
    }

    res.json({
      source,
      sourceId: id,
      metadata,
    });
  } catch (err) {
    console.error('Error getting issue metadata:', err);
    res.status(500).json({
      error: 'Failed to get metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Apply Metadata Endpoints
// =============================================================================

/**
 * POST /api/search/apply/:fileId
 * Apply metadata from a search result to a file.
 * Body: { source: 'comicvine' | 'metron', sourceId: string, type: 'series' | 'issue', sessionId?: string }
 */
router.post('/apply/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const { source, sourceId, type, sessionId } = req.body;

    if (!source || !sourceId || !type) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'source, sourceId, and type are required',
      });
      return;
    }

    if (!['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(source)) {
      res.status(400).json({
        error: 'Invalid source',
        message: 'source must be comicvine, metron, gcd, anilist, or mal',
      });
      return;
    }

    if (!['series', 'issue'].includes(type)) {
      res.status(400).json({
        error: 'Invalid type',
        message: 'type must be series or issue',
      });
      return;
    }

    // Get file from database
    const prisma = getDatabase();
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      select: { id: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Get metadata from source
    let metadata: Record<string, unknown> | null = null;

    if (type === 'issue') {
      metadata = await getIssueMetadata(source as MetadataSource, sourceId, sessionId);
    } else {
      metadata = await getSeriesMetadata(source as MetadataSource, sourceId, sessionId);
    }

    if (!metadata) {
      res.status(404).json({
        error: 'Metadata not found',
        message: `Could not fetch ${type} metadata from ${source}`,
      });
      return;
    }

    // Convert metadata to ComicInfo format
    const comicInfoUpdates: Partial<ComicInfo> = {};
    const fieldMapping: Record<string, keyof ComicInfo> = {
      Series: 'Series',
      Number: 'Number',
      Title: 'Title',
      Summary: 'Summary',
      Publisher: 'Publisher',
      Year: 'Year',
      Month: 'Month',
      Day: 'Day',
      Writer: 'Writer',
      Penciller: 'Penciller',
      Inker: 'Inker',
      Colorist: 'Colorist',
      Letterer: 'Letterer',
      CoverArtist: 'CoverArtist',
      Editor: 'Editor',
      Characters: 'Characters',
      Teams: 'Teams',
      Locations: 'Locations',
      StoryArc: 'StoryArc',
      PageCount: 'PageCount',
      Web: 'Web',
      // Series metadata fields
      seriesName: 'Series',
      publisher: 'Publisher',
      startYear: 'Year',
      description: 'Summary',
    };

    for (const [key, value] of Object.entries(metadata)) {
      const mappedKey = fieldMapping[key];
      if (mappedKey && value !== undefined && value !== null) {
        (comicInfoUpdates as Record<string, unknown>)[mappedKey] = value;
      }
    }

    // Merge and write to archive (handles reading existing + merging + writing)
    const writeResult = await mergeComicInfo(file.path, comicInfoUpdates);

    if (!writeResult.success) {
      res.status(500).json({
        error: 'Failed to write metadata',
        message: writeResult.error,
      });
      return;
    }

    // Log the applying step
    if (sessionId) {
      MetadataFetchLogger.logApplying(sessionId, fileId!, source, Object.keys(comicInfoUpdates));
    }

    // Invalidate and refresh all related data (cache, series linkage, etc.)
    // This handles moving the file to a new series if the metadata series changed
    const invalidationResult = await invalidateFileMetadata(fileId!, {
      refreshFromArchive: true,
      updateSeriesLinkage: true,
    });

    res.json({
      success: true,
      fileId,
      source,
      sourceId,
      type,
      appliedFields: Object.keys(comicInfoUpdates),
      seriesUpdated: invalidationResult.seriesUpdated,
      warnings: invalidationResult.warnings?.length ? invalidationResult.warnings : undefined,
    });
  } catch (err) {
    console.error('Error applying metadata:', err);
    res.status(500).json({
      error: 'Failed to apply metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/search/apply-batch
 * Apply metadata to multiple files.
 * Body: { matches: Array<{ fileId: string, source: string, sourceId: string, type: string }> }
 */
router.post('/apply-batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { matches } = req.body;

    if (!Array.isArray(matches) || matches.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'matches must be a non-empty array',
      });
      return;
    }

    const results: Array<{
      fileId: string;
      success: boolean;
      error?: string;
      warnings?: string[];
    }> = [];

    const prisma = getDatabase();

    for (const match of matches) {
      const { fileId, source, sourceId, type } = match;

      try {
        // Validate
        if (!fileId || !source || !sourceId || !type) {
          results.push({ fileId, success: false, error: 'Missing required fields' });
          continue;
        }

        if (!['comicvine', 'metron', 'gcd', 'anilist', 'mal'].includes(source)) {
          results.push({ fileId, success: false, error: 'Invalid source' });
          continue;
        }

        // Get file
        const file = await prisma.comicFile.findUnique({
          where: { id: fileId },
          select: { id: true, path: true },
        });

        if (!file) {
          results.push({ fileId, success: false, error: 'File not found' });
          continue;
        }

        // Get metadata
        let metadata: Record<string, unknown> | null = null;
        if (type === 'issue') {
          metadata = await getIssueMetadata(source as MetadataSource, sourceId);
        } else {
          metadata = await getSeriesMetadata(source as MetadataSource, sourceId);
        }

        if (!metadata) {
          results.push({ fileId, success: false, error: 'Metadata not found' });
          continue;
        }

        // Build ComicInfo updates
        const comicInfoUpdates: Partial<ComicInfo> = {};
        const fieldMapping: Record<string, keyof ComicInfo> = {
          Series: 'Series',
          Number: 'Number',
          Title: 'Title',
          Summary: 'Summary',
          Publisher: 'Publisher',
          Year: 'Year',
          Month: 'Month',
          Day: 'Day',
          Writer: 'Writer',
          Penciller: 'Penciller',
          Inker: 'Inker',
          Colorist: 'Colorist',
          Letterer: 'Letterer',
          CoverArtist: 'CoverArtist',
          Editor: 'Editor',
          Characters: 'Characters',
          Teams: 'Teams',
          Locations: 'Locations',
          StoryArc: 'StoryArc',
          PageCount: 'PageCount',
          Web: 'Web',
          seriesName: 'Series',
          publisher: 'Publisher',
          startYear: 'Year',
          description: 'Summary',
        };

        for (const [key, value] of Object.entries(metadata)) {
          const mappedKey = fieldMapping[key];
          if (mappedKey && value !== undefined && value !== null) {
            (comicInfoUpdates as Record<string, unknown>)[mappedKey] = value;
          }
        }

        // Merge and write to archive
        const writeResult = await mergeComicInfo(file.path, comicInfoUpdates);

        if (!writeResult.success) {
          results.push({ fileId, success: false, error: writeResult.error });
          continue;
        }

        // Invalidate and refresh all related data (cache, series linkage, etc.)
        // This handles moving the file to a new series if the metadata series changed
        const invalidationResult = await invalidateFileMetadata(fileId, {
          refreshFromArchive: true,
          updateSeriesLinkage: true,
        });

        results.push({
          fileId,
          success: true,
          warnings: invalidationResult.warnings?.length ? invalidationResult.warnings : undefined,
        });
      } catch (err) {
        results.push({
          fileId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Aggregate all warnings from individual results
    const allWarnings: string[] = [];
    for (const r of results) {
      if (r.warnings && r.warnings.length > 0) {
        allWarnings.push(...r.warnings);
      }
    }

    res.json({
      total: results.length,
      successful,
      failed,
      results,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    });
  } catch (err) {
    console.error('Error in batch apply:', err);
    res.status(500).json({
      error: 'Batch apply failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Bulk Fetch Metadata Endpoints
// =============================================================================

/**
 * POST /api/search/fetch-metadata
 * Fetch metadata for multiple files by parsing filenames and searching.
 * Body: { fileIds: string[], includeSession?: boolean }
 * Returns matches with confidence scores for user approval.
 * If includeSession is true, also returns a sessionId for tracking logs.
 */
router.post('/fetch-metadata', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds, includeSession = false } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileIds must be a non-empty array',
      });
      return;
    }

    // Limit batch size
    if (fileIds.length > 100) {
      res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 files per batch',
      });
      return;
    }

    // Create a logging session if requested
    const sessionId = includeSession
      ? MetadataFetchLogger.createSession({ filename: `Batch of ${fileIds.length} files` })
      : undefined;

    const prisma = getDatabase();

    // Get all files from database
    const files = await prisma.comicFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, filename: true, path: true },
    });

    if (files.length === 0) {
      if (sessionId) {
        MetadataFetchLogger.errorSession(sessionId, 'No files found');
      }
      res.status(404).json({
        error: 'No files found',
        message: 'None of the provided file IDs were found',
      });
      return;
    }

    const results: Array<{
      fileId: string;
      filename: string;
      query: SearchQuery;
      bestMatch: {
        source: MetadataSource;
        sourceId: string;
        type: 'issue' | 'series';
        name: string;
        number?: string;
        publisher?: string;
        year?: number;
        confidence: number;
        coverUrl?: string;
      } | null;
      alternateMatches: Array<{
        source: MetadataSource;
        sourceId: string;
        type: 'issue' | 'series';
        name: string;
        number?: string;
        publisher?: string;
        year?: number;
        confidence: number;
        coverUrl?: string;
      }>;
      status: 'matched' | 'low_confidence' | 'no_match' | 'error';
      error?: string;
    }> = [];

    // Check if LLM parsing is available
    const useLLM = isLLMAvailable();

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      try {
        // Parse filename to query - use LLM if available for better accuracy
        let query: SearchQuery;

        if (useLLM && sessionId) {
          // Use LLM parser with logging
          const parsed = await llmParseFilename(file.filename, undefined, { sessionId });
          query = {
            series: parsed.series,
            issueNumber: parsed.number?.toString(),
            year: parsed.year,
            publisher: parsed.publisher,
          };
          // Log parsing step with parsed result
          MetadataFetchLogger.logParsing(sessionId, file.filename, query);
        } else {
          // Fall back to regex parsing
          query = parseFilenameToQuery(file.filename);
          // Log parsing step
          if (sessionId) {
            MetadataFetchLogger.logParsing(sessionId, file.filename, query);
          }
        }

        // Skip if we couldn't extract meaningful info
        if (!query.series) {
          results.push({
            fileId: file.id,
            filename: file.filename,
            query,
            bestMatch: null,
            alternateMatches: [],
            status: 'no_match',
            error: 'Could not extract series name from filename',
          });
          continue;
        }

        // Search for issues first (more specific)
        const searchResults = await search(query, { limit: 5, sessionId });

        // Determine best match
        let bestMatch: typeof results[0]['bestMatch'] = null;
        const alternateMatches: typeof results[0]['alternateMatches'] = [];

        // Prefer issue matches if we have an issue number
        if (query.issueNumber && searchResults.issues.length > 0) {
          for (const issue of searchResults.issues) {
            const match = {
              source: issue.source,
              sourceId: issue.sourceId,
              type: 'issue' as const,
              name: issue.seriesName,
              number: issue.number,
              publisher: issue.publisher,
              year: issue.coverDate ? new Date(issue.coverDate).getFullYear() : undefined,
              confidence: issue.confidence,
              coverUrl: issue.coverUrl,
            };

            if (!bestMatch) {
              bestMatch = match;
            } else {
              alternateMatches.push(match);
            }
          }
        }

        // Fall back to series matches
        if (!bestMatch && searchResults.series.length > 0) {
          for (const series of searchResults.series) {
            const match = {
              source: series.source,
              sourceId: series.sourceId,
              type: 'series' as const,
              name: series.name,
              publisher: series.publisher,
              year: series.startYear,
              confidence: series.confidence,
              coverUrl: series.coverUrl,
            };

            if (!bestMatch) {
              bestMatch = match;
            } else {
              alternateMatches.push(match);
            }
          }
        }

        // Add remaining series as alternates if we matched an issue
        if (bestMatch?.type === 'issue') {
          for (const series of searchResults.series.slice(0, 3)) {
            alternateMatches.push({
              source: series.source,
              sourceId: series.sourceId,
              type: 'series' as const,
              name: series.name,
              publisher: series.publisher,
              year: series.startYear,
              confidence: series.confidence,
              coverUrl: series.coverUrl,
            });
          }
        }

        // Determine status based on confidence
        let status: typeof results[0]['status'] = 'no_match';
        if (bestMatch) {
          if (bestMatch.confidence >= 0.7) {
            status = 'matched';
          } else if (bestMatch.confidence >= 0.4) {
            status = 'low_confidence';
          } else {
            status = 'low_confidence';
          }
        }

        results.push({
          fileId: file.id,
          filename: file.filename,
          query,
          bestMatch,
          alternateMatches: alternateMatches.slice(0, 5),
          status,
        });
      } catch (err) {
        results.push({
          fileId: file.id,
          filename: file.filename,
          query: {},
          bestMatch: null,
          alternateMatches: [],
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Summary stats
    const matched = results.filter((r) => r.status === 'matched').length;
    const lowConfidence = results.filter((r) => r.status === 'low_confidence').length;
    const noMatch = results.filter((r) => r.status === 'no_match').length;
    const errors = results.filter((r) => r.status === 'error').length;

    // Complete the session if we created one
    if (sessionId) {
      MetadataFetchLogger.completeSession(sessionId, {
        filesParsed: files.length,
        resultsFound: matched + lowConfidence,
        errors: results.filter((r) => r.error).map((r) => r.error!),
      });
    }

    res.json({
      total: results.length,
      matched,
      lowConfidence,
      noMatch,
      errors,
      results,
      sessionId, // Include session ID so client can fetch logs
    });
  } catch (err) {
    console.error('Error in bulk metadata fetch:', err);
    res.status(500).json({
      error: 'Bulk fetch failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Status Endpoints
// =============================================================================

/**
 * GET /api/search/status
 * Check availability of metadata sources.
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await checkSourcesAvailability();

    res.json(status);
  } catch (err) {
    console.error('Error checking status:', err);
    res.status(500).json({
      error: 'Status check failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Logging Endpoints
// =============================================================================

/**
 * GET /api/search/logs/sessions
 * Get recent metadata fetch sessions.
 * Query params: limit (default 20)
 */
router.get('/logs/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const sessions = MetadataFetchLogger.getRecentSessions(limit);

    res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        fileId: session.fileId,
        filename: session.filename,
        status: session.status,
        currentStep: session.currentStep,
        currentStepName: getStepDisplayName(session.currentStep),
        stepNumber: getStepNumber(session.currentStep),
        totalSteps: getTotalSteps(),
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        summary: session.summary,
        logCount: session.logs.length,
      })),
    });
  } catch (err) {
    console.error('Error getting sessions:', err);
    res.status(500).json({
      error: 'Failed to get sessions',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/logs/sessions/active
 * Get currently active metadata fetch sessions.
 */
router.get('/logs/sessions/active', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sessions = MetadataFetchLogger.getActiveSessions();

    res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        fileId: session.fileId,
        filename: session.filename,
        status: session.status,
        currentStep: session.currentStep,
        currentStepName: getStepDisplayName(session.currentStep),
        stepNumber: getStepNumber(session.currentStep),
        totalSteps: getTotalSteps(),
        startedAt: session.startedAt,
        summary: session.summary,
        logCount: session.logs.length,
      })),
    });
  } catch (err) {
    console.error('Error getting active sessions:', err);
    res.status(500).json({
      error: 'Failed to get active sessions',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/logs/session/:sessionId
 * Get details and logs for a specific session.
 */
router.get('/logs/session/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const session = MetadataFetchLogger.getSession(sessionId!);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    const apiCalls = MetadataFetchLogger.getAPICalls(sessionId!);

    res.json({
      session: {
        id: session.id,
        fileId: session.fileId,
        filename: session.filename,
        status: session.status,
        currentStep: session.currentStep,
        currentStepName: getStepDisplayName(session.currentStep),
        stepNumber: getStepNumber(session.currentStep),
        totalSteps: getTotalSteps(),
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        summary: session.summary,
      },
      logs: session.logs.map((log) => ({
        ...log,
        stepName: getStepDisplayName(log.step),
        formatted: formatLogEntry(log),
      })),
      apiCalls: apiCalls.map((call) => ({
        source: call.source,
        endpoint: call.endpoint,
        status: call.status,
        duration: call.duration,
        resultCount: call.resultCount,
        error: call.error,
        retryCount: call.retryCount,
        startTime: call.startTime,
        endTime: call.endTime,
      })),
    });
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({
      error: 'Failed to get session',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/search/logs/stream/:sessionId
 * Server-Sent Events stream for real-time log updates.
 */
router.get('/logs/stream/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const session = MetadataFetchLogger.getSession(sessionId!);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial state
    res.write(`data: ${JSON.stringify({
      type: 'init',
      session: {
        id: session.id,
        status: session.status,
        currentStep: session.currentStep,
        currentStepName: getStepDisplayName(session.currentStep),
        stepNumber: getStepNumber(session.currentStep),
        totalSteps: getTotalSteps(),
      },
      logs: session.logs.slice(-20).map((log) => ({
        ...log,
        stepName: getStepDisplayName(log.step),
        formatted: formatLogEntry(log),
      })),
    })}\n\n`);

    // If session is already complete, close the stream
    if (session.status !== 'in_progress') {
      res.write(`data: ${JSON.stringify({ type: 'complete', status: session.status })}\n\n`);
      res.end();
      return;
    }

    // Listen for new logs
    const onLog = (log: { sessionId: string; step: string; message: string }) => {
      if (log.sessionId === sessionId) {
        res.write(`data: ${JSON.stringify({
          type: 'log',
          log: {
            ...(log as object),
            stepName: getStepDisplayName((log as { step: string }).step as import('../services/metadata-fetch-logger.service.js').MetadataFetchStep),
            formatted: formatLogEntry(log as import('../services/metadata-fetch-logger.service.js').MetadataFetchLogEntry),
          },
        })}\n\n`);
      }
    };

    const onComplete = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        res.write(`data: ${JSON.stringify({ type: 'complete', status: 'completed' })}\n\n`);
        cleanup();
        res.end();
      }
    };

    const onError = (data: { sessionId: string; error: string }) => {
      if (data.sessionId === sessionId) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: data.error })}\n\n`);
        cleanup();
        res.end();
      }
    };

    const cleanup = () => {
      MetadataFetchLogger.off(`log:${sessionId}`, onLog);
      MetadataFetchLogger.off('sessionComplete', onComplete);
      MetadataFetchLogger.off('sessionError', onError);
    };

    MetadataFetchLogger.on(`log:${sessionId}`, onLog);
    MetadataFetchLogger.on('sessionComplete', onComplete);
    MetadataFetchLogger.on('sessionError', onError);

    // Clean up on client disconnect
    req.on('close', cleanup);
  } catch (err) {
    console.error('Error setting up log stream:', err);
    res.status(500).json({
      error: 'Failed to set up log stream',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
