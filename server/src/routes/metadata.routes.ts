/**
 * Metadata Routes
 *
 * API endpoints for series.json, folder ComicInfo.xml, and file metadata operations.
 */

import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import {
  readSeriesJson,
  writeSeriesJson,
  updateSeriesJson,
  deleteSeriesJson,
  getFolderMetadata,
  findSeriesFolders,
  initializeSeriesFromFolderName,
  syncAllComicInfoFiles,
  initializeAllSeriesFromFolderNames,
  parseSeriesFolderName,
  SeriesMetadata,
} from '../services/series-metadata.service.js';
import {
  readComicInfo,
  mergeComicInfo,
  ComicInfo,
} from '../services/comicinfo.service.js';
import { getDatabase } from '../services/database.service.js';
import { cacheFileMetadata, refreshMetadataCache } from '../services/metadata-cache.service.js';
import { invalidateFileMetadata } from '../services/metadata-invalidation.service.js';
import {
  searchSeriesFullData,
  expandSeriesResult,
  expandSeriesResultWithSources,
  getSeriesMetadataFullData,
  type SearchQuery,
  type SeriesMatch,
  type MetadataSource,
} from '../services/metadata-search.service.js';
import {
  findCrossSourceMatches,
  getCachedMappings,
  saveCrossSourceMapping,
  invalidateCrossSourceMappings,
} from '../services/cross-source-matcher.service.js';
import { ProviderRegistry } from '../services/metadata-providers/registry.js';
import { mergeSeriesWithAllValues } from '../services/metadata-merge.service.js';

const router = Router();

// =============================================================================
// Series.json Operations
// =============================================================================

/**
 * GET /api/metadata/series/:libraryId
 * Get all series folders in a library.
 */
router.get('/series/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.params;
    const prisma = getDatabase();

    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    const seriesFolders = await findSeriesFolders(library.rootPath);

    res.json({
      libraryId,
      libraryPath: library.rootPath,
      seriesCount: seriesFolders.length,
      series: seriesFolders.map(f => ({
        folderPath: f.folderPath,
        relativePath: f.folderPath.replace(library.rootPath, '').replace(/^\//, ''),
        hasSeriesJson: f.hasSeriesJson,
        hasComicInfo: f.hasComicInfo,
        fileCount: f.fileCount,
        metadata: f.seriesMetadata,
      })),
    });
  } catch (err) {
    console.error('Error getting series:', err);
    res.status(500).json({
      error: 'Failed to get series',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/folder
 * Get metadata for a specific folder.
 * Query: path (absolute path to folder)
 */
router.get('/folder', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    if (!existsSync(path)) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const metadata = await getFolderMetadata(path);

    res.json(metadata);
  } catch (err) {
    console.error('Error getting folder metadata:', err);
    res.status(500).json({
      error: 'Failed to get folder metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/series-json
 * Read series.json from a folder.
 * Query: path (absolute path to folder)
 */
router.get('/series-json', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    const result = await readSeriesJson(path);

    if (!result.success) {
      res.status(404).json({
        error: 'series.json not found',
        message: result.error,
      });
      return;
    }

    res.json(result.metadata);
  } catch (err) {
    console.error('Error reading series.json:', err);
    res.status(500).json({
      error: 'Failed to read series.json',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * PUT /api/metadata/series-json
 * Write/replace series.json for a folder.
 * Query: path (absolute path to folder)
 * Body: SeriesMetadata
 */
router.put('/series-json', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    if (!existsSync(path)) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const metadata: SeriesMetadata = req.body;

    if (!metadata.seriesName) {
      res.status(400).json({
        error: 'Invalid metadata',
        message: 'seriesName is required',
      });
      return;
    }

    const result = await writeSeriesJson(path, metadata);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to write series.json',
        message: result.error,
      });
      return;
    }

    res.json({
      success: true,
      message: 'series.json and ComicInfo.xml updated',
    });
  } catch (err) {
    console.error('Error writing series.json:', err);
    res.status(500).json({
      error: 'Failed to write series.json',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * PATCH /api/metadata/series-json
 * Update series.json with partial updates.
 * Query: path (absolute path to folder)
 * Body: Partial<SeriesMetadata>
 */
router.patch('/series-json', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    if (!existsSync(path)) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const updates: Partial<SeriesMetadata> = req.body;

    const result = await updateSeriesJson(path, updates);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to update series.json',
        message: result.error,
      });
      return;
    }

    res.json({
      success: true,
      message: 'series.json and ComicInfo.xml updated',
    });
  } catch (err) {
    console.error('Error updating series.json:', err);
    res.status(500).json({
      error: 'Failed to update series.json',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/metadata/series-json
 * Delete series.json from a folder.
 * Query: path (absolute path to folder)
 */
router.delete('/series-json', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    const deleted = await deleteSeriesJson(path);

    res.json({ deleted });
  } catch (err) {
    console.error('Error deleting series.json:', err);
    res.status(500).json({
      error: 'Failed to delete series.json',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata/series-json/initialize
 * Initialize series.json from folder name.
 * Query: path (absolute path to folder)
 */
router.post('/series-json/initialize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (typeof path !== 'string' || !path) {
      res.status(400).json({
        error: 'Missing path',
        message: 'path query parameter is required',
      });
      return;
    }

    if (!existsSync(path)) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const result = await initializeSeriesFromFolderName(path);

    res.json(result);
  } catch (err) {
    console.error('Error initializing series.json:', err);
    res.status(500).json({
      error: 'Failed to initialize series.json',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata/series-json/parse-folder-name
 * Parse a folder name to extract series metadata (preview only).
 * Body: { folderName: string }
 */
router.post('/series-json/parse-folder-name', async (req: Request, res: Response): Promise<void> => {
  try {
    const { folderName } = req.body;

    if (typeof folderName !== 'string' || !folderName) {
      res.status(400).json({
        error: 'Missing folderName',
        message: 'folderName is required in request body',
      });
      return;
    }

    const parsed = parseSeriesFolderName(folderName);

    res.json(parsed);
  } catch (err) {
    console.error('Error parsing folder name:', err);
    res.status(500).json({
      error: 'Failed to parse folder name',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// File Metadata Operations
// =============================================================================

/**
 * GET /api/metadata/file/:fileId
 * Get metadata for a comic file.
 * Returns cached database metadata and optionally reads from archive.
 */
router.get('/file/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const { refresh } = req.query;
    const prisma = getDatabase();

    // Get file from database
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
      include: { metadata: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // If refresh requested, read from archive and update cache
    if (refresh === 'true') {
      const comicInfoResult = await readComicInfo(file.path);
      if (comicInfoResult.success && comicInfoResult.comicInfo) {
        await cacheFileMetadata(fileId!, comicInfoResult.comicInfo);

        // Refetch with updated metadata
        const updatedFile = await prisma.comicFile.findUnique({
          where: { id: fileId },
          include: { metadata: true },
        });

        res.json({
          fileId,
          path: file.path,
          fromArchive: true,
          metadata: updatedFile?.metadata,
          comicInfo: comicInfoResult.comicInfo,
        });
        return;
      }
    }

    // Return cached metadata
    res.json({
      fileId,
      path: file.path,
      fromArchive: false,
      metadata: file.metadata,
    });
  } catch (err) {
    console.error('Error getting file metadata:', err);
    res.status(500).json({
      error: 'Failed to get file metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * PATCH /api/metadata/file/:fileId
 * Update metadata for a comic file.
 * Updates both the archive ComicInfo.xml and database cache.
 * Body: Partial<ComicInfo>
 */
router.patch('/file/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const updates: Partial<ComicInfo> = req.body;
    const prisma = getDatabase();

    // Get file from database
    const file = await prisma.comicFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Update archive ComicInfo.xml
    const result = await mergeComicInfo(file.path, updates);

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to update ComicInfo.xml',
        message: result.error,
      });
      return;
    }

    // Invalidate and refresh all related data (cache, series linkage, etc.)
    const invalidationResult = await invalidateFileMetadata(fileId!, {
      refreshFromArchive: true,
      updateSeriesLinkage: true,
    });

    res.json({
      success: true,
      message: 'Metadata updated',
      cached: invalidationResult.fileMetadataRefreshed,
      seriesUpdated: invalidationResult.seriesUpdated,
      errors: invalidationResult.errors?.length ? invalidationResult.errors : undefined,
      warnings: invalidationResult.warnings?.length ? invalidationResult.warnings : undefined,
    });
  } catch (err) {
    console.error('Error updating file metadata:', err);
    res.status(500).json({
      error: 'Failed to update file metadata',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * POST /api/metadata/sync-comicinfo/:libraryId
 * Sync all folder ComicInfo.xml files from their series.json files in a library.
 */
router.post('/sync-comicinfo/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.params;
    const prisma = getDatabase();

    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    const result = await syncAllComicInfoFiles(library.rootPath);

    res.json({
      libraryId,
      ...result,
    });
  } catch (err) {
    console.error('Error syncing ComicInfo files:', err);
    res.status(500).json({
      error: 'Sync failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata/initialize-all/:libraryId
 * Initialize series.json for all folders in a library that don't have one.
 */
router.post('/initialize-all/:libraryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { libraryId } = req.params;
    const prisma = getDatabase();

    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    const result = await initializeAllSeriesFromFolderNames(library.rootPath);

    res.json({
      libraryId,
      ...result,
    });
  } catch (err) {
    console.error('Error initializing series.json files:', err);
    res.status(500).json({
      error: 'Initialization failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata/cache/refresh
 * Refresh metadata cache for specified files.
 * Body: { fileIds: string[] }
 */
router.post('/cache/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body;

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

    let refreshed = 0;
    let failed = 0;
    const errors: Array<{ fileId: string; error: string }> = [];

    for (const fileId of fileIds) {
      try {
        const success = await refreshMetadataCache(fileId);
        if (success) {
          refreshed++;
        } else {
          failed++;
          errors.push({ fileId, error: 'Failed to refresh' });
        }
      } catch (err) {
        failed++;
        errors.push({
          fileId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.json({
      total: fileIds.length,
      refreshed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Error refreshing metadata cache:', err);
    res.status(500).json({
      error: 'Cache refresh failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/scrape-themes
 * Scrape themes from a ComicVine volume page.
 * This is a backend proxy to avoid CORS issues with client-side fetching.
 * Query: url (ComicVine volume page URL)
 */
router.get('/scrape-themes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.query;

    if (typeof url !== 'string' || !url) {
      res.status(400).json({
        error: 'Missing url parameter',
        message: 'url query parameter is required',
      });
      return;
    }

    // Validate it's a ComicVine URL
    if (!url.includes('comicvine.gamespot.com')) {
      res.status(400).json({
        error: 'Invalid URL',
        message: 'URL must be a ComicVine page',
      });
      return;
    }

    // Import cheerio dynamically
    const cheerio = await import('cheerio');

    // Fetch the page with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      // Return 200 with success: false since theme scraping is optional
      // Don't proxy ComicVine's status code - our endpoint worked, scraping just failed
      res.json({
        success: false,
        error: 'Failed to fetch page',
        message: `ComicVine returned status ${response.status}`,
        themes: [],
      });
      return;
    }

    const html = await response.text();

    // Check if we got a Cloudflare challenge page
    if (html.includes('Cloudflare') && html.includes('challenge')) {
      res.json({
        success: false,
        message: 'ComicVine is blocking requests (Cloudflare protection)',
        themes: [],
      });
      return;
    }

    // Parse with cheerio
    const $ = cheerio.load(html);
    const themes: string[] = [];

    // Method 1: Look for "Themes" header and extract links
    $('h4').each((_, el) => {
      const headerText = $(el).text().trim().toLowerCase();
      if (headerText === 'themes') {
        // Get the parent container or next sibling with links
        const container = $(el).parent();
        container.find('a').each((_, link) => {
          const text = $(link).text().trim();
          // Filter out the header itself and any navigation links
          if (text && text.length > 0 && text.length < 50 && text.toLowerCase() !== 'themes') {
            themes.push(text);
          }
        });
      }
    });

    // Method 2: Alternative - look for concept links in wiki details
    if (themes.length === 0) {
      $('.wiki-details a[href*="/4015-"], .pod-body a[href*="concept"]').each((_, link) => {
        const text = $(link).text().trim();
        if (text && text.length > 0 && text.length < 50 && !themes.includes(text)) {
          themes.push(text);
        }
      });
    }

    res.json({
      success: true,
      themes,
      count: themes.length,
    });
  } catch (err) {
    console.error('Error scraping themes:', err);
    res.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      themes: [],
    });
  }
});

/**
 * GET /api/metadata/search
 * Search metadata across all files.
 * Query: q (search query), series, writer, publisher, year, limit, offset
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q,
      series,
      writer,
      publisher,
      year,
      limit = '50',
      offset = '0',
    } = req.query;

    const prisma = getDatabase();
    const where: Record<string, unknown> = {};

    // Build search criteria
    if (typeof q === 'string' && q) {
      // Full text search across multiple fields
      where.OR = [
        { series: { contains: q } },
        { title: { contains: q } },
        { writer: { contains: q } },
        { characters: { contains: q } },
        { summary: { contains: q } },
      ];
    }

    if (typeof series === 'string' && series) {
      where.series = { contains: series };
    }
    if (typeof writer === 'string' && writer) {
      where.writer = { contains: writer };
    }
    if (typeof publisher === 'string' && publisher) {
      where.publisher = { contains: publisher };
    }
    if (typeof year === 'string' && year) {
      const yearNum = parseInt(year, 10);
      if (!isNaN(yearNum)) {
        where.year = yearNum;
      }
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
    const offsetNum = parseInt(offset as string, 10) || 0;

    const [results, total] = await Promise.all([
      prisma.fileMetadata.findMany({
        where,
        include: {
          comic: {
            select: {
              id: true,
              filename: true,
              path: true,
              libraryId: true,
            },
          },
        },
        take: limitNum,
        skip: offsetNum,
        orderBy: [
          { series: 'asc' },
          { number: 'asc' },
        ],
      }),
      prisma.fileMetadata.count({ where }),
    ]);

    res.json({
      total,
      limit: limitNum,
      offset: offsetNum,
      results,
    });
  } catch (err) {
    console.error('Error searching metadata:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Full Data Mode Search Operations
// =============================================================================

/**
 * POST /api/metadata/search-full
 * Search for series across all enabled metadata sources (Full Data mode).
 * Body: { query: SearchQuery, sources?: MetadataSource[], limit?: number }
 */
router.post('/search-full', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, sources, limit } = req.body as {
      query?: SearchQuery;
      sources?: MetadataSource[];
      limit?: number;
    };

    if (!query || !query.series) {
      res.status(400).json({
        error: 'Invalid query',
        message: 'query.series is required',
      });
      return;
    }

    const result = await searchSeriesFullData({
      query,
      sources,
      limit: limit || 10,
    });

    res.json(result);
  } catch (err) {
    console.error('Error in full data search:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata/expand-result
 * Expand a single series result by fetching from additional sources.
 * Returns both the merged result AND the per-source SeriesMatch objects.
 * Body: { match: SeriesMatch, additionalSources?: MetadataSource[] }
 */
router.post('/expand-result', async (req: Request, res: Response): Promise<void> => {
  try {
    const { match, additionalSources } = req.body as {
      match?: SeriesMatch;
      additionalSources?: MetadataSource[];
    };

    if (!match || !match.source || !match.sourceId) {
      res.status(400).json({
        error: 'Invalid match',
        message: 'match with source and sourceId is required',
      });
      return;
    }

    // Use the new function that returns both merged and sourceResults
    const result = await expandSeriesResultWithSources(match, additionalSources);

    if (!result) {
      res.status(404).json({
        error: 'No data found',
        message: 'Could not find matching data in additional sources',
      });
      return;
    }

    // Return both merged and sourceResults
    res.json(result);
  } catch (err) {
    console.error('Error expanding result:', err);
    res.status(500).json({
      error: 'Expand failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/series-full/:source/:sourceId
 * Get full series metadata merged from all sources.
 */
router.get('/series-full/:source/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId } = req.params;

    if (!source || !sourceId) {
      res.status(400).json({
        error: 'Invalid parameters',
        message: 'source and sourceId are required',
      });
      return;
    }

    const validSources: MetadataSource[] = ['comicvine', 'metron', 'gcd', 'anilist', 'mal'];
    if (!validSources.includes(source as MetadataSource)) {
      res.status(400).json({
        error: 'Invalid source',
        message: `source must be one of: ${validSources.join(', ')}`,
      });
      return;
    }

    const result = await getSeriesMetadataFullData(source as MetadataSource, sourceId);

    if (!result) {
      res.status(404).json({
        error: 'Series not found',
        message: `No series found for ${source}:${sourceId}`,
      });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Error getting full series metadata:', err);
    res.status(500).json({
      error: 'Fetch failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Cross-Source Matching Operations
// =============================================================================

/**
 * POST /api/metadata/cross-match
 * Find matching series across secondary sources for a given primary series.
 * Body: { source: MetadataSource, sourceId: string, targetSources?: MetadataSource[] }
 */
router.post('/cross-match', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId, targetSources, autoMatchThreshold } = req.body as {
      source?: MetadataSource;
      sourceId?: string;
      targetSources?: MetadataSource[];
      autoMatchThreshold?: number;
    };

    if (!source || !sourceId) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'source and sourceId are required',
      });
      return;
    }

    // First, get the primary series metadata
    const provider = ProviderRegistry.get(source);
    if (!provider) {
      res.status(400).json({
        error: 'Invalid source',
        message: `Unknown metadata source: ${source}`,
      });
      return;
    }

    const primarySeries = await provider.getSeriesById(sourceId);
    if (!primarySeries) {
      res.status(404).json({
        error: 'Series not found',
        message: `No series found for ${source}:${sourceId}`,
      });
      return;
    }

    // Find cross-source matches
    const result = await findCrossSourceMatches(primarySeries, {
      targetSources,
      autoMatchThreshold,
    });

    // Auto-save high-confidence matches to cache
    for (const match of result.matches) {
      if (match.isAutoMatchCandidate) {
        await saveCrossSourceMapping(
          source,
          sourceId,
          match.source,
          match.sourceId,
          match.confidence,
          'auto',
          match.matchFactors
        );
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error finding cross-source matches:', err);
    res.status(500).json({
      error: 'Cross-match failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/cross-matches/:source/:sourceId
 * Get cached cross-source mappings for a series.
 */
router.get('/cross-matches/:source/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId } = req.params;

    if (!source || !sourceId) {
      res.status(400).json({
        error: 'Invalid parameters',
        message: 'source and sourceId are required',
      });
      return;
    }

    const mappings = await getCachedMappings(source as MetadataSource, sourceId);

    res.json({
      source,
      sourceId,
      mappings,
      count: mappings.length,
    });
  } catch (err) {
    console.error('Error getting cross-source mappings:', err);
    res.status(500).json({
      error: 'Failed to get mappings',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * PUT /api/metadata/cross-matches/:source/:sourceId
 * Save or update a cross-source mapping (user-confirmed match).
 * Body: { matchedSource: MetadataSource, matchedSourceId: string, confidence?: number }
 */
router.put('/cross-matches/:source/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId } = req.params;
    const { matchedSource, matchedSourceId, confidence } = req.body as {
      matchedSource?: MetadataSource;
      matchedSourceId?: string;
      confidence?: number;
    };

    if (!source || !sourceId || !matchedSource || !matchedSourceId) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'source, sourceId, matchedSource, and matchedSourceId are required',
      });
      return;
    }

    await saveCrossSourceMapping(
      source as MetadataSource,
      sourceId,
      matchedSource,
      matchedSourceId,
      confidence ?? 1.0, // User-confirmed = 100% confidence
      'user'
    );

    res.json({
      success: true,
      message: 'Cross-source mapping saved',
    });
  } catch (err) {
    console.error('Error saving cross-source mapping:', err);
    res.status(500).json({
      error: 'Failed to save mapping',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/metadata/cross-matches/:source/:sourceId
 * Invalidate all cross-source mappings for a series.
 */
router.delete('/cross-matches/:source/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId } = req.params;

    if (!source || !sourceId) {
      res.status(400).json({
        error: 'Invalid parameters',
        message: 'source and sourceId are required',
      });
      return;
    }

    const deletedCount = await invalidateCrossSourceMappings(source as MetadataSource, sourceId);

    res.json({
      success: true,
      deletedCount,
      message: `Invalidated ${deletedCount} cross-source mappings`,
    });
  } catch (err) {
    console.error('Error invalidating cross-source mappings:', err);
    res.status(500).json({
      error: 'Failed to invalidate mappings',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata/series-all-values/:source/:sourceId
 * Get series metadata with all values from all sources for per-field selection.
 * Query: sources (comma-separated list of sources to cross-match against), sessionId
 */
router.get('/series-all-values/:source/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, sourceId } = req.params;
    const { sources, sessionId } = req.query;

    if (!source || !sourceId) {
      res.status(400).json({
        error: 'Invalid parameters',
        message: 'source and sourceId are required',
      });
      return;
    }

    // Parse target sources from query
    const targetSources = sources
      ? (sources as string).split(',').filter(s => s.trim()) as MetadataSource[]
      : undefined;

    // First, get the primary series data
    const provider = ProviderRegistry.get(source as MetadataSource);
    if (!provider) {
      res.status(400).json({
        error: 'Invalid source',
        message: `Unknown metadata source: ${source}`,
      });
      return;
    }

    const primarySeries = await provider.getSeriesById(sourceId, sessionId as string | undefined);
    if (!primarySeries) {
      res.status(404).json({
        error: 'Series not found',
        message: `Series with ID ${sourceId} not found in ${source}`,
      });
      return;
    }

    // Find cross-source matches to get data from other sources
    const crossMatchResult = await findCrossSourceMatches(primarySeries, { targetSources });

    // Collect all series data into a Map for merging
    const allSeriesData = new Map<MetadataSource, typeof primarySeries | null>();
    allSeriesData.set(source as MetadataSource, primarySeries);

    for (const match of crossMatchResult.matches) {
      if (match.seriesData) {
        // The match already has series data from cross-matcher
        allSeriesData.set(match.source, match.seriesData);
      }
    }

    // Merge with all values tracking
    const mergedWithAllValues = mergeSeriesWithAllValues(allSeriesData);

    if (!mergedWithAllValues) {
      res.status(500).json({
        error: 'Failed to merge metadata',
        message: 'No valid metadata found to merge',
      });
      return;
    }

    // Add cross-match status
    res.json({
      ...mergedWithAllValues,
      crossMatchStatus: crossMatchResult.status,
    });
  } catch (err) {
    console.error('Error getting series with all values:', err);
    res.status(500).json({
      error: 'Failed to get series with all values',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
