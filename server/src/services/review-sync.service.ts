/**
 * Review Sync Service
 *
 * Orchestrates syncing of external user reviews from various sources.
 * Coordinates with review providers to fetch, process, and store reviews.
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { getExternalRatingsSettings } from './config.service.js';
import {
  ReviewProviderRegistry,
  type ReviewSource,
  type ReviewData,
  type ReviewSearchQuery,
  type SeriesReviewSyncResult,
  type ExternalReviewDisplay,
  calculateExpirationDate,
  getSourceDisplayName,
  formatRatingDisplay,
  REVIEW_TTL_MS,
  getSourceUrl,
  generateSummary,
} from './review-providers/index.js';

const logger = createServiceLogger('review-sync');

// =============================================================================
// Types
// =============================================================================

export interface ReviewSyncOptions {
  /** Specific sources to sync (default: all enabled) */
  sources?: ReviewSource[];
  /** Force refresh even if not expired */
  forceRefresh?: boolean;
  /** Maximum reviews per source (default: 10) */
  reviewLimit?: number;
  /** Skip reviews marked as spoilers */
  skipSpoilers?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the existing external ID for a provider from series metadata
 */
function getExistingIdForProvider(
  providerName: ReviewSource,
  series: {
    anilistId: string | null;
    malId: string | null;
  }
): string | undefined {
  switch (providerName) {
    case 'anilist':
      return series.anilistId || undefined;
    case 'myanimelist':
      return series.malId || undefined;
    case 'comicbookroundup':
      // CBR uses URL slugs, not IDs - handled separately
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Generate a unique key for a review to use for upsert
 */
function generateReviewKey(review: ReviewData): string {
  // Use reviewId if available, otherwise generate from author + date
  if (review.reviewId) {
    return review.reviewId;
  }
  const authorKey = review.author.id || review.author.name;
  const dateKey = review.createdOnSource?.getTime() || 0;
  return `${authorKey}-${dateKey}`;
}

/**
 * Get existing sourceId from rating sync for a provider.
 * This allows review-sync to reuse matches found by rating-sync,
 * avoiding redundant series searches.
 */
async function getExistingSourceId(
  seriesId: string,
  providerName: ReviewSource
): Promise<string | null> {
  const db = getDatabase();
  const existingRating = await db.externalRating.findFirst({
    where: { seriesId, source: providerName },
    select: { sourceId: true },
  });
  return existingRating?.sourceId || null;
}

// =============================================================================
// Core Sync Functions
// =============================================================================

/**
 * Sync external reviews for a single series
 */
export async function syncSeriesReviews(
  seriesId: string,
  options: ReviewSyncOptions = {}
): Promise<SeriesReviewSyncResult> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();

  // Get series with external IDs and type
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      type: true,
      publisher: true,
      startYear: true,
      writer: true,
      anilistId: true,
      malId: true,
    },
  });

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const result: SeriesReviewSyncResult = {
    seriesId,
    seriesName: series.name,
    success: false,
    reviews: [],
    reviewCount: 0,
    matchedSources: [],
    unmatchedSources: [],
    errors: [],
  };

  // Determine which sources to use
  const sourcesToUse =
    options.sources ||
    (settings?.enabledReviewSources as ReviewSource[]) ||
    ReviewProviderRegistry.getAllSources();

  // Get providers for the requested sources
  let providers = sourcesToUse
    .map((source) => ReviewProviderRegistry.get(source))
    .filter((p) => p !== undefined);

  // Apply type-based priority if sources weren't explicitly ordered
  if (!options.sources && series) {
    const isManga = series.type === 'manga';
    const priorityOrder = isManga
      ? ['anilist', 'myanimelist', 'comicbookroundup']
      : ['comicbookroundup', 'anilist', 'myanimelist'];

    providers.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.name);
      const bIndex = priorityOrder.indexOf(b.name);
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      return aOrder - bOrder;
    });
  }

  logger.debug(
    {
      seriesId,
      sourcesToUse,
      providerCount: providers.length,
      providers: providers.map((p) => p.name),
    },
    'Resolved review providers for sync'
  );

  if (providers.length === 0) {
    logger.warn({ seriesId }, 'No review providers available');
    return result;
  }

  // Check if we need to refresh (unless forceRefresh)
  if (!options.forceRefresh) {
    const existingReviews = await db.externalReview.findMany({
      where: {
        seriesId,
        expiresAt: { gt: new Date() },
      },
    });

    // If we have non-expired reviews for all requested sources, skip sync
    const existingSources = new Set(existingReviews.map((r) => r.source));
    const allSourcesCovered = sourcesToUse.every((s) => existingSources.has(s));

    if (allSourcesCovered && existingReviews.length > 0) {
      logger.debug({ seriesId }, 'All reviews still valid, skipping sync');
      result.success = true;
      result.reviews = existingReviews.map((r) => ({
        source: r.source as ReviewSource,
        sourceId: r.sourceId,
        reviewId: r.reviewId || undefined,
        author: {
          name: r.authorName,
          id: r.authorId || undefined,
          avatarUrl: r.authorAvatarUrl || undefined,
          profileUrl: r.authorUrl || undefined,
        },
        text: r.reviewText,
        summary: r.summary || undefined,
        rating: r.rating || undefined,
        originalRating: r.originalRating || undefined,
        ratingScale: r.ratingScale || undefined,
        hasSpoilers: r.hasSpoilers,
        reviewType: r.reviewType as 'user' | 'critic',
        likes: r.likes || undefined,
        createdOnSource: r.reviewDate || undefined,
      }));
      result.reviewCount = result.reviews.length;
      result.matchedSources = Array.from(existingSources) as ReviewSource[];
      return result;
    }
  }

  // Build base search query
  const baseSearchQuery: Omit<ReviewSearchQuery, 'existingId'> = {
    seriesName: series.name,
    publisher: series.publisher || undefined,
    year: series.startYear || undefined,
    writer: series.writer?.split(',')[0]?.trim() || undefined,
  };

  const reviewLimit = options.reviewLimit || 10;
  const ttlDays = settings?.reviewTTLDays || 14;
  const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

  // Try each provider
  for (const provider of providers) {
    try {
      logger.debug(
        { seriesId, provider: provider.name },
        'Attempting to sync reviews from provider'
      );

      // Check for existing sourceId from rating sync first
      let sourceId = await getExistingSourceId(seriesId, provider.name);
      let matchConfidence = 1.0;
      let matchMethod = 'cached';

      if (sourceId) {
        logger.debug(
          { seriesId, provider: provider.name, sourceId },
          'Reusing sourceId from rating sync'
        );
      } else {
        // Build provider-specific search query
        const searchQuery: ReviewSearchQuery = {
          ...baseSearchQuery,
          existingId: getExistingIdForProvider(provider.name, series),
        };

        // Search for the series on this provider
        const match = await provider.searchSeries(searchQuery);

        if (!match) {
          logger.debug(
            { seriesId, provider: provider.name },
            'No match found on provider'
          );
          result.unmatchedSources.push(provider.name);
          continue;
        }
        sourceId = match.sourceId;
        matchConfidence = match.confidence;
        matchMethod = match.matchMethod;
      }

      // Fetch reviews
      const reviews = await provider.getSeriesReviews(sourceId, {
        limit: reviewLimit,
        skipSpoilers: options.skipSpoilers,
        sortBy: 'helpful',
      });

      if (reviews.length === 0) {
        logger.debug(
          { seriesId, provider: provider.name },
          'No reviews returned from provider'
        );
        result.unmatchedSources.push(provider.name);
        continue;
      }

      // Store reviews in database
      for (const review of reviews) {
        const reviewKey = generateReviewKey(review);

        await db.externalReview.upsert({
          where: {
            seriesId_source_reviewId: {
              seriesId,
              source: review.source,
              reviewId: reviewKey,
            },
          },
          create: {
            seriesId,
            source: review.source,
            sourceId: review.sourceId,
            reviewId: reviewKey,
            authorName: review.author.name,
            authorId: review.author.id,
            authorAvatarUrl: review.author.avatarUrl,
            authorUrl: review.author.profileUrl,
            reviewText: review.text,
            summary: review.summary || generateSummary(review.text, 200),
            rating: review.rating,
            originalRating: review.originalRating,
            ratingScale: review.ratingScale,
            hasSpoilers: review.hasSpoilers,
            reviewType: review.reviewType,
            likes: review.likes,
            reviewDate: review.createdOnSource,
            confidence: matchConfidence,
            matchMethod: matchMethod,
            expiresAt,
          },
          update: {
            reviewText: review.text,
            summary: review.summary || generateSummary(review.text, 200),
            rating: review.rating,
            originalRating: review.originalRating,
            ratingScale: review.ratingScale,
            hasSpoilers: review.hasSpoilers,
            likes: review.likes,
            lastSyncedAt: new Date(),
            expiresAt,
          },
        });

        result.reviews.push(review);
      }

      result.reviewCount += reviews.length;
      result.matchedSources.push(provider.name);
      logger.info(
        { seriesId, provider: provider.name, reviewCount: reviews.length },
        'Successfully synced reviews'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { seriesId, provider: provider.name, error: errorMessage },
        'Error syncing reviews from provider'
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

/**
 * Get external reviews for a series (from database)
 */
export async function getExternalReviews(
  seriesId: string,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
  } = {}
): Promise<ExternalReviewDisplay[]> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();
  const ttlMs = (settings?.reviewTTLDays || 14) * 24 * 60 * 60 * 1000;

  const where: {
    seriesId: string;
    source?: string;
    hasSpoilers?: boolean;
  } = { seriesId };

  if (options.source) {
    where.source = options.source;
  }

  if (options.skipSpoilers) {
    where.hasSpoilers = false;
  }

  const reviews = await db.externalReview.findMany({
    where,
    orderBy: [
      { likes: { sort: 'desc', nulls: 'last' } },
      { reviewDate: { sort: 'desc', nulls: 'last' } },
    ],
    take: options.limit,
  });

  return reviews.map((r) => ({
    id: r.id,
    source: r.source as ReviewSource,
    sourceDisplayName: getSourceDisplayName(r.source as ReviewSource),
    sourceUrl: getSourceUrl(r.source as ReviewSource, r.sourceId, r.reviewId || undefined),
    author: {
      name: r.authorName,
      avatarUrl: r.authorAvatarUrl || undefined,
      profileUrl: r.authorUrl || undefined,
    },
    text: r.reviewText,
    summary: r.summary || undefined,
    rating: r.rating || undefined,
    displayRating:
      r.originalRating && r.ratingScale
        ? formatRatingDisplay(r.originalRating, r.ratingScale)
        : undefined,
    hasSpoilers: r.hasSpoilers,
    reviewType: r.reviewType as 'user' | 'critic',
    likes: r.likes || undefined,
    reviewDate: r.reviewDate || undefined,
    lastSyncedAt: r.lastSyncedAt,
    isStale: r.expiresAt < new Date(),
    confidence: r.confidence,
  }));
}

/**
 * Get reviews for a specific issue (file)
 */
export async function getIssueExternalReviews(
  fileId: string,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
  } = {}
): Promise<ExternalReviewDisplay[]> {
  const db = getDatabase();

  const where: {
    fileId: string;
    source?: string;
    hasSpoilers?: boolean;
  } = { fileId };

  if (options.source) {
    where.source = options.source;
  }

  if (options.skipSpoilers) {
    where.hasSpoilers = false;
  }

  const reviews = await db.externalReview.findMany({
    where,
    orderBy: [
      { likes: { sort: 'desc', nulls: 'last' } },
      { reviewDate: { sort: 'desc', nulls: 'last' } },
    ],
    take: options.limit,
  });

  return reviews.map((r) => ({
    id: r.id,
    source: r.source as ReviewSource,
    sourceDisplayName: getSourceDisplayName(r.source as ReviewSource),
    sourceUrl: getSourceUrl(r.source as ReviewSource, r.sourceId, r.reviewId || undefined),
    author: {
      name: r.authorName,
      avatarUrl: r.authorAvatarUrl || undefined,
      profileUrl: r.authorUrl || undefined,
    },
    text: r.reviewText,
    summary: r.summary || undefined,
    rating: r.rating || undefined,
    displayRating:
      r.originalRating && r.ratingScale
        ? formatRatingDisplay(r.originalRating, r.ratingScale)
        : undefined,
    hasSpoilers: r.hasSpoilers,
    reviewType: r.reviewType as 'user' | 'critic',
    likes: r.likes || undefined,
    reviewDate: r.reviewDate || undefined,
    lastSyncedAt: r.lastSyncedAt,
    isStale: r.expiresAt < new Date(),
    confidence: r.confidence,
  }));
}

/**
 * Sync external reviews for a single issue
 */
export async function syncIssueReviews(
  fileId: string,
  options: ReviewSyncOptions = {}
): Promise<{
  success: boolean;
  reviews: ReviewData[];
  reviewCount: number;
  matchedSources: ReviewSource[];
  unmatchedSources: ReviewSource[];
  errors: Array<{ source: ReviewSource; error: string }>;
  lastSyncedAt: Date;
}> {
  const db = getDatabase();
  const settings = getExternalRatingsSettings();
  const now = new Date();

  // Get file with series info
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: {
        select: {
          id: true,
          name: true,
          publisher: true,
          startYear: true,
          writer: true,
        },
      },
      metadata: true,
    },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  if (!file.series) {
    throw new Error(`File ${fileId} is not associated with a series`);
  }

  const issueNumber = file.metadata?.number || '';
  if (!issueNumber) {
    throw new Error(`File ${fileId} has no issue number`);
  }

  const result = {
    success: false,
    reviews: [] as ReviewData[],
    reviewCount: 0,
    matchedSources: [] as ReviewSource[],
    unmatchedSources: [] as ReviewSource[],
    errors: [] as Array<{ source: ReviewSource; error: string }>,
    lastSyncedAt: now,
  };

  // Get providers that support issue reviews
  const providers = ReviewProviderRegistry.getWithIssueSupport();

  if (providers.length === 0) {
    logger.warn({ fileId }, 'No review providers with issue support');
    return result;
  }

  // Check if we need to refresh (unless forceRefresh)
  if (!options.forceRefresh) {
    const existingReviews = await db.externalReview.findMany({
      where: {
        fileId,
        expiresAt: { gt: now },
      },
    });

    if (existingReviews.length > 0) {
      logger.debug({ fileId }, 'Issue reviews still valid, skipping sync');
      result.success = true;
      result.reviewCount = existingReviews.length;
      result.matchedSources = [
        ...new Set(existingReviews.map((r) => r.source as ReviewSource)),
      ];
      return result;
    }
  }

  // Build search query
  const searchQuery: ReviewSearchQuery = {
    seriesName: file.series.name,
    publisher: file.series.publisher || undefined,
    year: file.series.startYear || undefined,
    writer: file.series.writer?.split(',')[0]?.trim() || undefined,
  };

  const reviewLimit = options.reviewLimit || 15;
  const ttlDays = settings?.reviewTTLDays || 14;
  const expiresAt = calculateExpirationDate(ttlDays * 24 * 60 * 60 * 1000);

  for (const provider of providers) {
    if (!provider.getIssueReviews) continue;

    try {
      logger.debug(
        { fileId, provider: provider.name },
        'Attempting to sync issue reviews from provider'
      );

      // Check for existing sourceId from rating sync first
      let sourceId = await getExistingSourceId(file.series.id, provider.name);
      let matchConfidence = 1.0;
      let matchMethod = 'cached';

      if (sourceId) {
        logger.debug(
          { fileId, provider: provider.name, sourceId },
          'Reusing sourceId from rating sync'
        );
      } else {
        // Search for series match
        const match = await provider.searchSeries(searchQuery);

        if (!match) {
          logger.debug(
            { fileId, provider: provider.name },
            'No series match found on provider'
          );
          result.unmatchedSources.push(provider.name);
          continue;
        }
        sourceId = match.sourceId;
        matchConfidence = match.confidence;
        matchMethod = match.matchMethod;
      }

      // Fetch issue reviews
      const reviews = await provider.getIssueReviews(sourceId, issueNumber, {
        limit: reviewLimit,
        skipSpoilers: options.skipSpoilers,
        sortBy: 'helpful',
      });

      if (reviews.length === 0) {
        logger.debug(
          { fileId, provider: provider.name },
          'No reviews returned from provider'
        );
        result.unmatchedSources.push(provider.name);
        continue;
      }

      // Store reviews in database
      for (const review of reviews) {
        const reviewKey = review.reviewId || generateReviewKey(review);

        await db.externalReview.upsert({
          where: {
            fileId_source_reviewId: {
              fileId,
              source: review.source,
              reviewId: reviewKey,
            },
          },
          create: {
            fileId,
            source: review.source,
            sourceId: review.sourceId,
            reviewId: reviewKey,
            authorName: review.author.name,
            authorId: review.author.id,
            authorAvatarUrl: review.author.avatarUrl,
            authorUrl: review.author.profileUrl,
            reviewText: review.text,
            summary: review.summary || generateSummary(review.text, 200),
            rating: review.rating,
            originalRating: review.originalRating,
            ratingScale: review.ratingScale,
            hasSpoilers: review.hasSpoilers,
            reviewType: review.reviewType,
            likes: review.likes,
            reviewDate: review.createdOnSource,
            confidence: matchConfidence,
            matchMethod: matchMethod,
            expiresAt,
          },
          update: {
            reviewText: review.text,
            summary: review.summary || generateSummary(review.text, 200),
            rating: review.rating,
            originalRating: review.originalRating,
            ratingScale: review.ratingScale,
            hasSpoilers: review.hasSpoilers,
            likes: review.likes,
            lastSyncedAt: now,
            expiresAt,
          },
        });

        result.reviews.push(review);
      }

      result.reviewCount += reviews.length;
      result.matchedSources.push(provider.name);
      logger.info(
        { fileId, provider: provider.name, reviewCount: reviews.length },
        'Successfully synced issue reviews'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { fileId, provider: provider.name, error: errorMessage },
        'Error syncing issue reviews from provider'
      );
      result.errors.push({
        source: provider.name,
        error: errorMessage,
      });
    }
  }

  result.success = result.matchedSources.length > 0;

  return result;
}

/**
 * Delete all external reviews for a series
 */
export async function deleteSeriesReviews(seriesId: string): Promise<void> {
  const db = getDatabase();
  await db.externalReview.deleteMany({ where: { seriesId } });
  logger.info({ seriesId }, 'Deleted all external reviews for series');
}

/**
 * Delete all external reviews for an issue
 */
export async function deleteIssueReviews(fileId: string): Promise<void> {
  const db = getDatabase();
  await db.externalReview.deleteMany({ where: { fileId } });
  logger.info({ fileId }, 'Deleted all external reviews for issue');
}

/**
 * Get expired reviews count (for scheduled sync)
 */
export async function getExpiredReviewsCount(): Promise<number> {
  const db = getDatabase();
  return db.externalReview.count({
    where: { expiresAt: { lt: new Date() } },
  });
}

/**
 * Get series IDs with expired reviews
 */
export async function getSeriesWithExpiredReviews(
  limit: number = 100
): Promise<string[]> {
  const db = getDatabase();
  const expired = await db.externalReview.findMany({
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
 * Get review count for a series
 */
export async function getSeriesReviewCount(
  seriesId: string
): Promise<{ total: number; bySource: Record<ReviewSource, number> }> {
  const db = getDatabase();

  const reviews = await db.externalReview.groupBy({
    by: ['source'],
    where: { seriesId },
    _count: { id: true },
  });

  const bySource = {} as Record<ReviewSource, number>;
  let total = 0;

  for (const group of reviews) {
    bySource[group.source as ReviewSource] = group._count.id;
    total += group._count.id;
  }

  return { total, bySource };
}

/**
 * Get all available review sources and their status
 */
export async function getReviewSourcesStatus(): Promise<
  Array<{
    source: ReviewSource;
    displayName: string;
    enabled: boolean;
    available: boolean;
    error?: string;
    supportsIssueReviews: boolean;
  }>
> {
  const settings = getExternalRatingsSettings();
  const enabledSources = new Set(settings?.enabledReviewSources || []);
  const allProviders = ReviewProviderRegistry.getAll();
  const availability = await ReviewProviderRegistry.checkAllAvailability();

  return allProviders.map((provider) => {
    const status = availability.get(provider.name);
    return {
      source: provider.name,
      displayName: provider.displayName,
      enabled: enabledSources.has(provider.name as ReviewSource),
      available: status?.available ?? false,
      error: status?.error,
      supportsIssueReviews: provider.supportsIssueReviews,
    };
  });
}

// =============================================================================
// Exports
// =============================================================================

export const ReviewSyncService = {
  syncSeriesReviews,
  syncIssueReviews,
  getExternalReviews,
  getIssueExternalReviews,
  deleteSeriesReviews,
  deleteIssueReviews,
  getExpiredReviewsCount,
  getSeriesWithExpiredReviews,
  getSeriesReviewCount,
  getReviewSourcesStatus,
};

export default ReviewSyncService;
