/**
 * Rating Sync Service
 *
 * Orchestrates syncing of external community/critic ratings from various sources.
 * Coordinates with rating providers to fetch, normalize, and store ratings.
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { getExternalRatingsSettings } from './config.service.js';
import {
  RatingProviderRegistry,
  type RatingSource,
  type RatingData,
  type RatingSearchQuery,
  type SeriesSyncResult,
  type ExternalRatingDisplay,
  calculateExpirationDate,
  getSourceDisplayName,
  formatRatingDisplay,
  RATING_TTL_MS,
} from './rating-providers/index.js';
import { ComicBookRoundupProvider } from './rating-providers/comicbookroundup.provider.js';

const logger = createServiceLogger('rating-sync');

// =============================================================================
// Types
// =============================================================================

export interface SyncOptions {
  /** Specific sources to sync (default: all enabled) */
  sources?: RatingSource[];
  /** Force refresh even if not expired */
  forceRefresh?: boolean;
  /** Include issue-level ratings */
  includeIssues?: boolean;
}

export interface IssueSyncResult {
  fileId: string;
  issueNumber: string;
  success: boolean;
  hasRatings: boolean;
  ratings: RatingData[];
  error?: string;
}

export interface SeriesIssuesSyncResult {
  seriesId: string;
  seriesName: string;
  totalIssues: number;
  syncedIssues: number;
  issuesWithRatings: number;
  issuesWithoutRatings: number;
  skippedIssues: number;
  errors: Array<{ fileId: string; issueNumber: string; error: string }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the source URL for a rating source
 * Returns a direct link to the rating page on the source site
 */
function getSourceUrl(source: string, sourceId: string | null): string | null {
  if (!sourceId) return null;

  switch (source) {
    case 'comicbookroundup':
      return `https://comicbookroundup.com/comic-books/reviews/${sourceId}`;
    case 'anilist':
      return `https://anilist.co/manga/${sourceId}`;
    // TODO: Add other sources when implemented
    // case 'leagueofcomicgeeks':
    //   return `https://leagueofcomicgeeks.com/comic/${sourceId}`;
    default:
      return null;
  }
}

/**
 * Get the existing external ID for a provider from series metadata
 * This allows providers to do direct lookups instead of searching
 */
function getExistingIdForProvider(
  providerName: RatingSource,
  series: { comicVineId: string | null; metronId: string | null; anilistId: string | null; malId: string | null }
): string | undefined {
  switch (providerName) {
    case 'comicvine':
      return series.comicVineId || undefined;
    case 'metron':
      return series.metronId || undefined;
    case 'anilist':
      return series.anilistId || undefined;
    // MAL uses the anilist idMal mapping if available
    // case 'myanimelist':
    //   return series.malId || undefined;
    default:
      return undefined;
  }
}

// =============================================================================
// Core Sync Functions
// =============================================================================

/**
 * Sync external ratings for a single series
 */
export async function syncSeriesRatings(
  seriesId: string,
  options: SyncOptions = {}
): Promise<SeriesSyncResult> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();

  // Get series with its external IDs and type
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      type: true,
      publisher: true,
      startYear: true,
      writer: true,
      comicVineId: true,
      metronId: true,
      anilistId: true,
      malId: true,
    },
  });

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const result: SeriesSyncResult = {
    seriesId,
    seriesName: series.name,
    success: false,
    ratings: [],
    matchedSources: [],
    unmatchedSources: [],
    errors: [],
  };

  // Determine which sources to use (explicit sources > config > all registered)
  const sourcesToUse = options.sources || (settings?.enabledSources as RatingSource[]) || RatingProviderRegistry.getAllSources();

  // Get providers for the requested sources directly (not filtered by enabled list)
  // This ensures explicitly requested providers are always tried
  let providers = sourcesToUse
    .map((source) => RatingProviderRegistry.get(source))
    .filter((p): p is typeof p & { name: RatingSource } => p !== undefined);

  // If sources weren't explicitly ordered by caller, apply type-based priority
  if (!options.sources && series) {
    const isManga = series.type === 'manga';
    const priorityOrder = isManga
      ? ['anilist', 'comicbookroundup', 'leagueofcomicgeeks', 'comicvine', 'metron']
      : ['comicbookroundup', 'leagueofcomicgeeks', 'comicvine', 'metron', 'anilist'];

    providers.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.name);
      const bIndex = priorityOrder.indexOf(b.name);
      // Handle providers not in priority list (put them at the end)
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      return aOrder - bOrder;
    });
  }

  logger.debug(
    { seriesId, sourcesToUse, providerCount: providers.length, providers: providers.map(p => p.name) },
    'Resolved rating providers for sync'
  );

  if (providers.length === 0) {
    logger.warn({ seriesId }, 'No rating providers available');
    return result;
  }

  // Check if we need to refresh (unless forceRefresh)
  if (!options.forceRefresh) {
    const existingRatings = await db.externalRating.findMany({
      where: {
        seriesId,
        expiresAt: { gt: new Date() },
      },
    });

    // If we have non-expired ratings for all requested sources, skip sync
    const existingSources = new Set(existingRatings.map((r) => r.source));
    const allSourcesCovered = sourcesToUse.every((s) => existingSources.has(s));

    if (allSourcesCovered && existingRatings.length > 0) {
      logger.debug({ seriesId }, 'All ratings still valid, skipping sync');
      result.success = true;
      result.ratings = existingRatings.map((r) => ({
        source: r.source as RatingSource,
        sourceId: r.sourceId || '',
        ratingType: r.ratingType as 'community' | 'critic',
        value: r.ratingValue,
        originalValue: r.originalValue,
        scale: r.ratingScale,
        voteCount: r.voteCount || undefined,
      }));
      result.matchedSources = Array.from(existingSources) as RatingSource[];
      return result;
    }
  }

  // Build base search query (include writer for better matching on CBR)
  const baseSearchQuery: Omit<RatingSearchQuery, 'existingId'> = {
    seriesName: series.name,
    publisher: series.publisher || undefined,
    year: series.startYear || undefined,
    writer: series.writer?.split(',')[0]?.trim() || undefined, // First writer only
  };

  // Try each provider
  for (const provider of providers) {
    try {
      logger.debug(
        { seriesId, provider: provider.name },
        'Attempting to sync from provider'
      );

      // Build provider-specific search query with existingId from series metadata
      const searchQuery: RatingSearchQuery = {
        ...baseSearchQuery,
        existingId: getExistingIdForProvider(provider.name, series),
      };

      // Check if we have an existing sourceId for this provider
      let sourceId: string | null = null;
      const existingRating = await db.externalRating.findFirst({
        where: { seriesId, source: provider.name },
        select: { sourceId: true },
      });

      if (existingRating?.sourceId) {
        sourceId = existingRating.sourceId;
      } else {
        // Search for the series on this provider
        const match = await provider.searchSeries(searchQuery);

        if (match) {
          sourceId = match.sourceId;
          logger.debug(
            { seriesId, provider: provider.name, sourceId, confidence: match.confidence },
            'Found series match'
          );
        } else {
          logger.debug(
            { seriesId, provider: provider.name },
            'No match found on provider'
          );
          result.unmatchedSources.push(provider.name);
          continue;
        }
      }

      // Fetch ratings
      const ratings = await provider.getSeriesRatings(sourceId);

      if (ratings.length === 0) {
        logger.debug(
          { seriesId, provider: provider.name },
          'No ratings returned from provider'
        );
        result.unmatchedSources.push(provider.name);
        continue;
      }

      // Store ratings in database
      const ttlDays = settings?.ratingTTLDays || 7;
      const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

      for (const rating of ratings) {
        await db.externalRating.upsert({
          where: {
            seriesId_source_ratingType: {
              seriesId,
              source: rating.source,
              ratingType: rating.ratingType,
            },
          },
          create: {
            seriesId,
            source: rating.source,
            sourceId: rating.sourceId,
            ratingType: rating.ratingType,
            ratingValue: rating.value,
            ratingScale: rating.scale,
            originalValue: rating.originalValue,
            voteCount: rating.voteCount,
            confidence: 1.0,
            matchMethod: 'id',
            expiresAt,
          },
          update: {
            sourceId: rating.sourceId,
            ratingValue: rating.value,
            ratingScale: rating.scale,
            originalValue: rating.originalValue,
            voteCount: rating.voteCount,
            lastSyncedAt: new Date(),
            expiresAt,
          },
        });

        result.ratings.push(rating);
      }

      result.matchedSources.push(provider.name);
      logger.info(
        { seriesId, provider: provider.name, ratingCount: ratings.length },
        'Successfully synced ratings'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { seriesId, provider: provider.name, error: errorMessage },
        'Error syncing from provider'
      );
      result.errors?.push({
        source: provider.name,
        error: errorMessage,
      });
    }
  }

  result.success = result.matchedSources.length > 0;

  return result;
}

// =============================================================================
// Issue Rating Sync Functions
// =============================================================================

/**
 * Sync external ratings for a single issue (file)
 * Currently only supports ComicBookRoundup
 */
export async function syncIssueRatings(
  fileId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<IssueSyncResult> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();

  // Get the file with its metadata and series info
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: true,
      series: {
        include: {
          externalRatings: {
            where: { source: 'comicbookroundup' },
            take: 1,
          },
        },
      },
    },
  });

  if (!file) {
    return {
      fileId,
      issueNumber: '',
      success: false,
      hasRatings: false,
      ratings: [],
      error: 'File not found',
    };
  }

  const issueNumber = file.metadata?.number;
  if (!issueNumber) {
    return {
      fileId,
      issueNumber: '',
      success: false,
      hasRatings: false,
      ratings: [],
      error: 'No issue number in metadata',
    };
  }

  // Check if series has a CBR sourceId
  const seriesCbrRating = file.series?.externalRatings?.[0];
  if (!seriesCbrRating?.sourceId) {
    return {
      fileId,
      issueNumber,
      success: false,
      hasRatings: false,
      ratings: [],
      error: 'Series has no ComicBookRoundup match',
    };
  }

  // Check if we need to refresh (unless forceRefresh)
  if (!options.forceRefresh) {
    const existingRatings = await db.externalRating.findMany({
      where: {
        fileId,
        source: 'comicbookroundup',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingRatings.length > 0) {
      logger.debug({ fileId, issueNumber }, 'Issue ratings still valid, skipping sync');
      return {
        fileId,
        issueNumber,
        success: true,
        hasRatings: existingRatings.some((r) => r.ratingValue !== -1),
        ratings: existingRatings
          .filter((r) => r.ratingValue !== -1)
          .map((r) => ({
            source: r.source as RatingSource,
            sourceId: r.sourceId || '',
            ratingType: r.ratingType as 'community' | 'critic',
            value: r.ratingValue,
            originalValue: r.originalValue,
            scale: r.ratingScale,
            voteCount: r.voteCount || undefined,
          })),
      };
    }
  }

  try {
    // Check if provider supports issue ratings
    if (!ComicBookRoundupProvider.getIssueRatings) {
      return {
        fileId,
        issueNumber,
        success: false,
        hasRatings: false,
        ratings: [],
        error: 'Provider does not support issue ratings',
      };
    }

    // Fetch ratings from CBR
    const ratings = await ComicBookRoundupProvider.getIssueRatings(
      seriesCbrRating.sourceId,
      issueNumber
    );

    // Use issue-specific TTL
    const ttlDays = settings?.issueRatingTTLDays || 14;
    const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

    if (ratings.length === 0) {
      // Store -1 to indicate "checked but no ratings available"
      // Create entries for both critic and community to track that we checked
      for (const ratingType of ['critic', 'community'] as const) {
        await db.externalRating.upsert({
          where: {
            fileId_source_ratingType: {
              fileId,
              source: 'comicbookroundup',
              ratingType,
            },
          },
          create: {
            fileId,
            source: 'comicbookroundup',
            sourceId: `${seriesCbrRating.sourceId}/${issueNumber}`,
            ratingType,
            ratingValue: -1, // Special value for "no rating available"
            ratingScale: 10,
            originalValue: -1,
            voteCount: 0,
            confidence: 1.0,
            matchMethod: 'id',
            expiresAt,
          },
          update: {
            ratingValue: -1,
            originalValue: -1,
            voteCount: 0,
            lastSyncedAt: new Date(),
            expiresAt,
          },
        });
      }

      logger.debug({ fileId, issueNumber }, 'No ratings found, stored as N/A');

      return {
        fileId,
        issueNumber,
        success: true,
        hasRatings: false,
        ratings: [],
      };
    }

    // Store actual ratings
    for (const rating of ratings) {
      await db.externalRating.upsert({
        where: {
          fileId_source_ratingType: {
            fileId,
            source: rating.source,
            ratingType: rating.ratingType,
          },
        },
        create: {
          fileId,
          source: rating.source,
          sourceId: rating.sourceId,
          ratingType: rating.ratingType,
          ratingValue: rating.value,
          ratingScale: rating.scale,
          originalValue: rating.originalValue,
          voteCount: rating.voteCount,
          confidence: 1.0,
          matchMethod: 'id',
          expiresAt,
        },
        update: {
          sourceId: rating.sourceId,
          ratingValue: rating.value,
          ratingScale: rating.scale,
          originalValue: rating.originalValue,
          voteCount: rating.voteCount,
          lastSyncedAt: new Date(),
          expiresAt,
        },
      });
    }

    logger.info({ fileId, issueNumber, ratingCount: ratings.length }, 'Synced issue ratings');

    return {
      fileId,
      issueNumber,
      success: true,
      hasRatings: true,
      ratings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ fileId, issueNumber, error: errorMessage }, 'Error syncing issue ratings');

    return {
      fileId,
      issueNumber,
      success: false,
      hasRatings: false,
      ratings: [],
      error: errorMessage,
    };
  }
}

/**
 * Sync external ratings for all issues in a series
 * Currently only supports ComicBookRoundup
 */
export async function syncSeriesIssueRatings(
  seriesId: string,
  options: {
    forceRefresh?: boolean;
    onProgress?: (message: string, detail: string) => void;
  } = {}
): Promise<SeriesIssuesSyncResult> {
  const db = getDatabase();

  // Get series info
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      externalRatings: {
        where: { source: 'comicbookroundup' },
        take: 1,
      },
    },
  });

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const result: SeriesIssuesSyncResult = {
    seriesId,
    seriesName: series.name,
    totalIssues: 0,
    syncedIssues: 0,
    issuesWithRatings: 0,
    issuesWithoutRatings: 0,
    skippedIssues: 0,
    errors: [],
  };

  // Check if series has a CBR sourceId
  if (!series.externalRatings[0]?.sourceId) {
    logger.warn({ seriesId }, 'Series has no ComicBookRoundup match, skipping issue sync');
    return result;
  }

  // Get all files for this series with valid issue numbers
  const files = await db.comicFile.findMany({
    where: {
      seriesId,
      metadata: {
        number: { not: null },
      },
    },
    include: {
      metadata: {
        select: { number: true, issueNumberSort: true },
      },
    },
    orderBy: {
      metadata: {
        issueNumberSort: { sort: 'asc', nulls: 'last' },
      },
    },
  });

  result.totalIssues = files.length;

  if (files.length === 0) {
    logger.debug({ seriesId }, 'No files with issue numbers to sync');
    return result;
  }

  logger.info({ seriesId, seriesName: series.name, issueCount: files.length }, 'Starting issue ratings sync');

  // Sync each issue
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const issueNumber = file.metadata?.number || 'Unknown';

    // Report per-issue progress
    if (options.onProgress) {
      options.onProgress(
        `${series.name} #${issueNumber}`,
        `${i + 1} of ${files.length}`
      );
    }

    try {
      const syncResult = await syncIssueRatings(file.id, { forceRefresh: options.forceRefresh });

      if (syncResult.success) {
        result.syncedIssues++;
        if (syncResult.hasRatings) {
          result.issuesWithRatings++;
        } else {
          result.issuesWithoutRatings++;
        }
      } else if (syncResult.error === 'Issue ratings still valid, skipping sync') {
        result.skippedIssues++;
      } else {
        result.errors.push({
          fileId: file.id,
          issueNumber: file.metadata?.number || '',
          error: syncResult.error || 'Unknown error',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        fileId: file.id,
        issueNumber: file.metadata?.number || '',
        error: errorMessage,
      });
    }
  }

  logger.info(
    {
      seriesId,
      seriesName: series.name,
      syncedIssues: result.syncedIssues,
      issuesWithRatings: result.issuesWithRatings,
      issuesWithoutRatings: result.issuesWithoutRatings,
      errorCount: result.errors.length,
    },
    'Completed issue ratings sync'
  );

  return result;
}

/**
 * Get external ratings for a series (from database)
 */
export async function getExternalRatings(
  seriesId: string
): Promise<ExternalRatingDisplay[]> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();
  const ttlMs = (settings?.ratingTTLDays || 7) * 24 * 60 * 60 * 1000;

  const ratings = await db.externalRating.findMany({
    where: { seriesId },
    orderBy: [{ source: 'asc' }, { ratingType: 'asc' }],
  });

  return ratings.map((r) => ({
    source: r.source as RatingSource,
    sourceDisplayName: getSourceDisplayName(r.source as RatingSource),
    ratingType: r.ratingType as 'community' | 'critic',
    value: r.ratingValue,
    displayValue: formatRatingDisplay(r.originalValue, r.ratingScale),
    voteCount: r.voteCount || undefined,
    lastSyncedAt: r.lastSyncedAt,
    isStale: r.expiresAt < new Date(),
    confidence: r.confidence,
    sourceUrl: getSourceUrl(r.source, r.sourceId),
  }));
}

/**
 * Get external ratings for an issue (from database)
 */
export async function getIssueExternalRatings(
  fileId: string
): Promise<ExternalRatingDisplay[]> {
  const db = getDatabase();

  const ratings = await db.externalRating.findMany({
    where: { fileId },
    orderBy: [{ source: 'asc' }, { ratingType: 'asc' }],
  });

  return ratings.map((r) => ({
    source: r.source as RatingSource,
    sourceDisplayName: getSourceDisplayName(r.source as RatingSource),
    ratingType: r.ratingType as 'community' | 'critic',
    value: r.ratingValue,
    displayValue: formatRatingDisplay(r.originalValue, r.ratingScale),
    voteCount: r.voteCount || undefined,
    lastSyncedAt: r.lastSyncedAt,
    isStale: r.expiresAt < new Date(),
    confidence: r.confidence,
    sourceUrl: getSourceUrl(r.source, r.sourceId),
  }));
}

/**
 * Delete all external ratings for a series
 */
export async function deleteSeriesRatings(seriesId: string): Promise<void> {
  const db = getDatabase();
  await db.externalRating.deleteMany({ where: { seriesId } });
  logger.info({ seriesId }, 'Deleted all external ratings for series');
}

/**
 * Delete all external ratings for an issue
 */
export async function deleteIssueRatings(fileId: string): Promise<void> {
  const db = getDatabase();
  await db.externalRating.deleteMany({ where: { fileId } });
  logger.info({ fileId }, 'Deleted all external ratings for issue');
}

/**
 * Get expired ratings count (for scheduled sync)
 */
export async function getExpiredRatingsCount(): Promise<number> {
  const db = getDatabase();
  return db.externalRating.count({
    where: { expiresAt: { lt: new Date() } },
  });
}

/**
 * Get series IDs with expired ratings
 */
export async function getSeriesWithExpiredRatings(
  limit: number = 100
): Promise<string[]> {
  const db = getDatabase();
  const expired = await db.externalRating.findMany({
    where: {
      expiresAt: { lt: new Date() },
      seriesId: { not: null },
    },
    select: { seriesId: true },
    distinct: ['seriesId'],
    take: limit,
  });

  return expired.map((r) => r.seriesId!).filter(Boolean);
}

/**
 * Get average external rating for a series (across all sources)
 */
export async function getSeriesAverageExternalRating(
  seriesId: string,
  ratingType?: 'community' | 'critic'
): Promise<{ average: number | null; count: number }> {
  const db = getDatabase();

  const where: { seriesId: string; ratingType?: string } = { seriesId };
  if (ratingType) {
    where.ratingType = ratingType;
  }

  const ratings = await db.externalRating.findMany({
    where,
    select: { ratingValue: true },
  });

  if (ratings.length === 0) {
    return { average: null, count: 0 };
  }

  const sum = ratings.reduce((acc, r) => acc + r.ratingValue, 0);
  const average = Math.round((sum / ratings.length) * 10) / 10; // 1 decimal place

  return { average, count: ratings.length };
}

/**
 * Get all available rating sources and their status
 */
export async function getRatingSourcesStatus(): Promise<
  Array<{
    source: RatingSource;
    displayName: string;
    enabled: boolean;
    available: boolean;
    error?: string;
    ratingTypes: ('community' | 'critic')[];
    supportsIssueRatings: boolean;
  }>
> {
  const settings = getExternalRatingsSettings();
  const enabledSources = new Set(settings?.enabledSources || []);
  const allProviders = RatingProviderRegistry.getAll();
  const availability = await RatingProviderRegistry.checkAllAvailability();

  return allProviders.map((provider) => {
    const status = availability.get(provider.name);
    return {
      source: provider.name,
      displayName: provider.displayName,
      enabled: enabledSources.has(provider.name as RatingSource),
      available: status?.available ?? false,
      error: status?.error,
      ratingTypes: provider.ratingTypes,
      supportsIssueRatings: provider.supportsIssueRatings,
    };
  });
}

// =============================================================================
// Exports
// =============================================================================

export const RatingSyncService = {
  syncSeriesRatings,
  syncIssueRatings,
  syncSeriesIssueRatings,
  getExternalRatings,
  getIssueExternalRatings,
  deleteSeriesRatings,
  deleteIssueRatings,
  getExpiredRatingsCount,
  getSeriesWithExpiredRatings,
  getSeriesAverageExternalRating,
  getRatingSourcesStatus,
};

export default RatingSyncService;
