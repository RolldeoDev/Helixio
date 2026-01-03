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
import {
  ComicBookRoundupProvider,
  getSeriesRatingsWithReviews,
  getIssueRatingsWithReviews,
  type RatingsWithReviews,
  type CBRParsedReview,
} from './rating-providers/comicbookroundup.provider.js';

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
 * Get the existing external ID for a provider from series metadata.
 * Returns the ID if available - the presence of an external ID indicates compatibility.
 */
function getExistingIdForProvider(
  providerName: RatingSource,
  series: {
    comicVineId: string | null;
    metronId: string | null;
    anilistId: string | null;
    malId: string | null;
  }
): string | undefined {
  switch (providerName) {
    case 'comicvine':
      return series.comicVineId || undefined;
    case 'metron':
      return series.metronId || undefined;
    case 'anilist':
      // If series has an AniList ID, it's manga-compatible
      return series.anilistId || undefined;
    case 'myanimelist':
      // If series has a MAL ID, it's manga-compatible
      return series.malId || undefined;
    default:
      return undefined;
  }
}

/**
 * Check if a provider is compatible with the series and has required external ID.
 * For AniList/MAL, the presence of an external ID indicates manga compatibility.
 * Returns true if the provider should be used, false if it should be skipped.
 */
function isProviderCompatibleWithSeries(
  providerName: RatingSource,
  series: {
    type: string;
    comicVineId: string | null;
    metronId: string | null;
    anilistId: string | null;
    malId: string | null;
  }
): { compatible: boolean; reason?: string } {
  switch (providerName) {
    case 'anilist':
      // If series has an AniList ID, it's compatible (the ID proves it's manga)
      if (!series.anilistId) {
        return {
          compatible: false,
          reason: 'Series has no AniList ID',
        };
      }
      return { compatible: true };

    case 'myanimelist':
      // If series has a MAL ID, it's compatible (the ID proves it's manga)
      if (!series.malId) {
        return {
          compatible: false,
          reason: 'Series has no MyAnimeList ID',
        };
      }
      return { compatible: true };

    case 'comicbookroundup':
    case 'leagueofcomicgeeks':
      // These support both western and manga, and use search (no ID required)
      return { compatible: true };

    case 'comicvine':
    case 'metron':
      // ComicVine and Metron work with any content type
      return { compatible: true };

    default:
      return { compatible: true };
  }
}

// =============================================================================
// Review Storage Functions
// =============================================================================

/**
 * Generate a summary from review text (first ~200 chars)
 */
function generateReviewSummary(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;

  // Try to break at a sentence boundary
  const truncated = text.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Generate a unique review ID for CBR reviews (since they don't have native IDs)
 */
function generateCbrReviewId(review: CBRParsedReview, sourceId: string): string {
  // Create a hash-like ID from author + first 50 chars of review text
  const textSnippet = review.text.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '');
  return `${review.author.replace(/[^a-zA-Z0-9]/g, '')}-${textSnippet}`.substring(0, 100);
}

/**
 * Store reviews from CBR in the database.
 * Called during rating sync to capture reviews from the same page fetch.
 */
async function storeReviewsFromCbr(
  reviews: CBRParsedReview[],
  sourceId: string,
  target: { seriesId?: string; fileId?: string },
  expiresAt: Date
): Promise<number> {
  if (reviews.length === 0) return 0;

  const db = getDatabase();
  let storedCount = 0;

  for (const review of reviews) {
    try {
      const reviewId = generateCbrReviewId(review, sourceId);

      // Determine which unique constraint to use based on target
      if (target.seriesId) {
        await db.externalReview.upsert({
          where: {
            seriesId_source_reviewId: {
              seriesId: target.seriesId,
              source: 'comicbookroundup',
              reviewId,
            },
          },
          create: {
            seriesId: target.seriesId,
            source: 'comicbookroundup',
            sourceId,
            reviewId,
            authorName: review.author,
            authorUrl: review.authorUrl,
            reviewText: review.text,
            summary: generateReviewSummary(review.text),
            reviewUrl: review.reviewUrl,
            rating: review.rating,
            originalRating: review.rating,
            ratingScale: 10,
            reviewType: review.type,
            likes: review.likes,
            reviewDate: review.date,
            confidence: 1.0,
            matchMethod: 'id',
            expiresAt,
          },
          update: {
            authorName: review.author,
            authorUrl: review.authorUrl,
            reviewText: review.text,
            summary: generateReviewSummary(review.text),
            reviewUrl: review.reviewUrl,
            rating: review.rating,
            originalRating: review.rating,
            likes: review.likes,
            reviewDate: review.date,
            lastSyncedAt: new Date(),
            expiresAt,
          },
        });
      } else if (target.fileId) {
        await db.externalReview.upsert({
          where: {
            fileId_source_reviewId: {
              fileId: target.fileId,
              source: 'comicbookroundup',
              reviewId,
            },
          },
          create: {
            fileId: target.fileId,
            source: 'comicbookroundup',
            sourceId,
            reviewId,
            authorName: review.author,
            authorUrl: review.authorUrl,
            reviewText: review.text,
            summary: generateReviewSummary(review.text),
            reviewUrl: review.reviewUrl,
            rating: review.rating,
            originalRating: review.rating,
            ratingScale: 10,
            reviewType: review.type,
            likes: review.likes,
            reviewDate: review.date,
            confidence: 1.0,
            matchMethod: 'id',
            expiresAt,
          },
          update: {
            authorName: review.author,
            authorUrl: review.authorUrl,
            reviewText: review.text,
            summary: generateReviewSummary(review.text),
            reviewUrl: review.reviewUrl,
            rating: review.rating,
            originalRating: review.rating,
            likes: review.likes,
            reviewDate: review.date,
            lastSyncedAt: new Date(),
            expiresAt,
          },
        });
      }

      storedCount++;
    } catch (error) {
      // Log but don't fail - individual review errors shouldn't stop the sync
      logger.warn(
        { author: review.author, error: error instanceof Error ? error.message : 'Unknown' },
        'Failed to store review'
      );
    }
  }

  return storedCount;
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
  const sourcesToUse =
    options.sources ||
    (settings?.enabledSources as RatingSource[]) ||
    RatingProviderRegistry.getAllSources();

  // Get providers for the requested sources directly (not filtered by enabled list)
  // This ensures explicitly requested providers are always tried
  let providers = sourcesToUse
    .map((source) => RatingProviderRegistry.get(source))
    .filter((p): p is typeof p & { name: RatingSource } => p !== undefined);

  // Filter out providers that are incompatible with the series type or missing required IDs
  const skippedProviders: Array<{ name: string; reason: string }> = [];
  providers = providers.filter((provider) => {
    const compatibility = isProviderCompatibleWithSeries(provider.name, series);
    if (!compatibility.compatible) {
      skippedProviders.push({
        name: provider.name,
        reason: compatibility.reason || 'Incompatible',
      });
      return false;
    }
    return true;
  });

  // Log skipped providers for debugging
  if (skippedProviders.length > 0) {
    logger.debug(
      { seriesId, seriesType: series.type, skippedProviders },
      'Skipped incompatible rating providers'
    );
  }

  // If sources weren't explicitly ordered by caller, apply type-based priority
  // Note: Incompatible providers are already filtered out above, so priority
  // arrays only need to include providers that could actually be present
  if (!options.sources && providers.length > 0) {
    // Consider manga if type is 'manga' or if it has AniList/MAL IDs
    const isManga =
      series.type?.toLowerCase() === 'manga' || !!series.anilistId || !!series.malId;
    const priorityOrder = isManga
      ? ['anilist', 'comicbookroundup', 'leagueofcomicgeeks', 'comicvine', 'metron'] // Manga: prefer AniList
      : ['comicbookroundup', 'leagueofcomicgeeks', 'comicvine', 'metron']; // Western: no AniList

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
    {
      seriesId,
      seriesType: series.type,
      sourcesToUse,
      providerCount: providers.length,
      providers: providers.map((p) => p.name),
    },
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

      // Store ratings in database
      const ttlDays = settings?.ratingTTLDays || 7;
      const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

      // For CBR, use the extended function to get both ratings and reviews in one fetch
      let ratings: RatingData[];
      let reviewsStored = 0;

      if (provider.name === 'comicbookroundup') {
        // Fetch ratings AND reviews together (single page scrape)
        const data = await getSeriesRatingsWithReviews(sourceId);
        ratings = data.ratings;

        // Store reviews alongside ratings
        const allReviews = [...data.criticReviews, ...data.userReviews];
        if (allReviews.length > 0) {
          reviewsStored = await storeReviewsFromCbr(
            allReviews,
            sourceId,
            { seriesId },
            expiresAt
          );
          logger.debug(
            { seriesId, reviewsStored, total: allReviews.length },
            'Stored CBR reviews during rating sync'
          );
        }
      } else {
        // Other providers - just fetch ratings
        ratings = await provider.getSeriesRatings(sourceId);
      }

      if (ratings.length === 0) {
        logger.debug(
          { seriesId, provider: provider.name },
          'No ratings returned from provider'
        );
        result.unmatchedSources.push(provider.name);
        continue;
      }

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
        { seriesId, provider: provider.name, ratingCount: ratings.length, reviewsStored },
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

    // Use issue-specific TTL
    const ttlDays = settings?.issueRatingTTLDays || 14;
    const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

    // Fetch ratings AND reviews from CBR in a single page scrape
    const data = await getIssueRatingsWithReviews(
      seriesCbrRating.sourceId,
      issueNumber
    );
    const ratings = data.ratings;
    const issueSourceId = `${seriesCbrRating.sourceId}/${issueNumber}`;

    // Store reviews alongside ratings
    const allReviews = [...data.criticReviews, ...data.userReviews];
    if (allReviews.length > 0) {
      const reviewsStored = await storeReviewsFromCbr(
        allReviews,
        issueSourceId,
        { fileId },
        expiresAt
      );
      logger.debug(
        { fileId, issueNumber, reviewsStored, total: allReviews.length },
        'Stored CBR reviews during issue rating sync'
      );
    }

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

// =============================================================================
// Manual CBR Match Types
// =============================================================================

export interface CBRMatchPreview {
  sourceId: string;
  seriesName: string;
  publisher: string;
  issueRange?: string;
  criticRating?: { value: number; count: number };
  communityRating?: { value: number; count: number };
}

export interface CBRMatchStatus {
  matched: boolean;
  sourceId?: string;
  sourceUrl?: string;
  matchMethod?: string;
  confidence?: number;
  matchedName?: string;
}

// =============================================================================
// Manual CBR Match Functions
// =============================================================================

/**
 * Validate a CBR URL and return preview data.
 * Performs strict validation: URL must be valid, fetchable, and contain ratings.
 */
export async function validateCbrUrl(url: string): Promise<{
  valid: boolean;
  error?: string;
  preview?: CBRMatchPreview;
}> {
  // Import CBR utilities dynamically to avoid circular deps
  const { parseSourceIdFromUrl, buildUrlFromSourceId } = await import('./comicbookroundup/url-builder.js');
  const { fetchSeriesData } = await import('./comicbookroundup/index.js');

  // Step 1: Validate URL format
  if (!url.includes('comicbookroundup.com/comic-books/reviews/')) {
    return {
      valid: false,
      error: 'URL must be a Comic Book Roundup series page (e.g., https://comicbookroundup.com/comic-books/reviews/dc-comics/batman)',
    };
  }

  // Step 2: Reject issue pages
  if (/\/\d+$/.test(url)) {
    return {
      valid: false,
      error: 'This appears to be an issue page. Please use the series page URL instead.',
    };
  }

  // Step 3: Extract sourceId
  const sourceId = parseSourceIdFromUrl(url);
  if (!sourceId) {
    return {
      valid: false,
      error: 'Could not parse series information from URL. Check URL format.',
    };
  }

  // Step 4: Fetch and validate page data
  try {
    const pageData = await fetchSeriesData(sourceId);

    // Check for valid ratings
    const hasCriticRating = pageData.criticRating && pageData.criticRating.count > 0;
    const hasCommunityRating = pageData.communityRating && pageData.communityRating.count > 0;

    if (!hasCriticRating && !hasCommunityRating) {
      return {
        valid: false,
        error: 'No ratings found on this page. The page may be empty or not a valid series.',
      };
    }

    // Extract publisher from sourceId
    const [publisherSlug] = sourceId.split('/');
    const publisher = publisherSlug
      ? publisherSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Unknown';

    return {
      valid: true,
      preview: {
        sourceId,
        seriesName: pageData.pageName || 'Unknown Series',
        publisher,
        criticRating: pageData.criticRating,
        communityRating: pageData.communityRating,
      },
    };
  } catch (error) {
    logger.error({ error, url }, 'Error validating CBR URL');
    return {
      valid: false,
      error: `Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Save a manual CBR match for a series.
 * Validates the URL, fetches ratings and reviews, and stores with matchMethod='manual'.
 */
export async function saveManualCbrMatch(
  seriesId: string,
  url: string
): Promise<{
  success: boolean;
  error?: string;
  preview?: CBRMatchPreview;
}> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();

  // Validate the URL first
  const validation = await validateCbrUrl(url);
  if (!validation.valid || !validation.preview) {
    return { success: false, error: validation.error };
  }

  const { sourceId, seriesName, publisher, criticRating, communityRating } = validation.preview;

  // Delete existing CBR ratings and reviews for this series
  await db.externalRating.deleteMany({
    where: {
      seriesId,
      source: 'comicbookroundup',
    },
  });
  await db.externalReview.deleteMany({
    where: {
      seriesId,
      source: 'comicbookroundup',
    },
  });

  // Calculate expiration
  const ttlDays = settings?.ratingTTLDays || 7;
  const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

  // Fetch full data with reviews (the validation already fetched data, but we want reviews too)
  const data = await getSeriesRatingsWithReviews(sourceId);

  // Store critic rating if available
  if (criticRating && criticRating.count > 0) {
    await db.externalRating.create({
      data: {
        seriesId,
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'critic',
        ratingValue: criticRating.value,
        ratingScale: 10,
        originalValue: criticRating.value,
        voteCount: criticRating.count,
        confidence: 1.0,
        matchMethod: 'manual',
        expiresAt,
      },
    });
  }

  // Store community rating if available
  if (communityRating && communityRating.count > 0) {
    await db.externalRating.create({
      data: {
        seriesId,
        source: 'comicbookroundup',
        sourceId,
        ratingType: 'community',
        ratingValue: communityRating.value,
        ratingScale: 10,
        originalValue: communityRating.value,
        voteCount: communityRating.count,
        confidence: 1.0,
        matchMethod: 'manual',
        expiresAt,
      },
    });
  }

  // Store reviews
  const allReviews = [...data.criticReviews, ...data.userReviews];
  let reviewsStored = 0;
  if (allReviews.length > 0) {
    reviewsStored = await storeReviewsFromCbr(
      allReviews,
      sourceId,
      { seriesId },
      expiresAt
    );
  }

  logger.info(
    { seriesId, sourceId, seriesName, reviewsStored },
    'Saved manual CBR match with reviews'
  );

  return {
    success: true,
    preview: validation.preview,
  };
}

/**
 * Get the current CBR match status for a series.
 */
export async function getCbrMatchStatus(seriesId: string): Promise<CBRMatchStatus> {
  const db = getDatabase();

  const rating = await db.externalRating.findFirst({
    where: {
      seriesId,
      source: 'comicbookroundup',
    },
    select: {
      sourceId: true,
      matchMethod: true,
      confidence: true,
    },
  });

  if (!rating || !rating.sourceId) {
    return { matched: false };
  }

  return {
    matched: true,
    sourceId: rating.sourceId,
    sourceUrl: `https://comicbookroundup.com/comic-books/reviews/${rating.sourceId}`,
    matchMethod: rating.matchMethod || undefined,
    confidence: rating.confidence,
  };
}

/**
 * Reset CBR match for a series.
 * Optionally re-runs automatic search after clearing.
 */
export async function resetCbrMatch(
  seriesId: string,
  reSearch: boolean
): Promise<{
  success: boolean;
  researchResult?: SeriesSyncResult;
}> {
  const db = getDatabase();

  // Delete CBR ratings
  await db.externalRating.deleteMany({
    where: {
      seriesId,
      source: 'comicbookroundup',
    },
  });

  logger.info({ seriesId, reSearch }, 'Reset CBR match');

  // If re-search requested, trigger automatic search
  if (reSearch) {
    const researchResult = await syncSeriesRatings(seriesId, {
      sources: ['comicbookroundup'] as RatingSource[],
      forceRefresh: true,
    });

    return {
      success: true,
      researchResult,
    };
  }

  return { success: true };
}

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
  // Manual CBR match functions
  validateCbrUrl,
  saveManualCbrMatch,
  getCbrMatchStatus,
  resetCbrMatch,
};

export default RatingSyncService;
