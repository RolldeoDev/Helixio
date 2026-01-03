/**
 * Recommendation Engine Service
 *
 * Provides intelligent series recommendations based on:
 * - User engagement (recently read, time spent, completed issues)
 * - Series similarity (precomputed similarity scores)
 * - User feedback (likes/dislikes)
 * - Cold start handling (popular + diverse for new users)
 */

import { getDatabase } from './database.service.js';
import {
  getUserEngagedSeries,
  getUserReadSeriesIds,
  hasEnoughReadingHistory,
  type EngagedSeries,
  type SeriesMetadata,
} from './engagement.service.js';
import { getSimilarSeries, getMatchReasons } from './similarity/index.js';

// =============================================================================
// Types
// =============================================================================

export interface RecommendationReason {
  type: 'similar_to' | 'popular' | 'new' | 'random' | 'related' | 'highly_rated';
  sourceSeriesId?: string;
  sourceSeriesName?: string;
  detail: string;
}

export interface SeriesRecommendation {
  seriesId: string;
  series: SeriesInfo;
  score: number;
  reasons: RecommendationReason[];
}

export interface SeriesInfo {
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  coverHash: string | null;
  coverUrl: string | null;
  genres: string | null;
  issueCount: number;
  /** First issue ID for cover fallback */
  firstIssueId: string | null;
  /** First issue cover hash for cover fallback */
  firstIssueCoverHash: string | null;
}

interface SimilarityCandidate {
  score: number;
  reasons: RecommendationReason[];
}

// =============================================================================
// Configuration
// =============================================================================

/** Minimum number of engaged series for personalized recommendations */
const COLD_START_THRESHOLD = 3;

/** Maximum engaged series to use for similarity seeding */
const MAX_SEED_SERIES = 10;

/** Maximum similar series to fetch per seed series */
const SIMILAR_PER_SEED = 20;

/** Boost multiplier for series similar to liked ones */
const LIKE_BOOST = 1.2;

/** Minimum external rating (0-10) to receive a boost */
const EXTERNAL_RATING_THRESHOLD = 7.0;

/** Max boost for highly rated series (scales linearly from threshold to 10) */
const EXTERNAL_RATING_MAX_BOOST = 1.15;

/** Proportion of cold start results from popular series */
const POPULAR_RATIO = 0.6;

// =============================================================================
// Main Recommendation Function
// =============================================================================

/**
 * Get personalized series recommendations for a user.
 *
 * @param userId - The user ID
 * @param limit - Maximum number of recommendations (default: 20)
 * @param libraryId - Optional library filter
 * @returns Array of series recommendations with scores and reasons
 */
export async function getPersonalizedRecommendations(
  userId: string,
  limit = 20,
  libraryId?: string
): Promise<SeriesRecommendation[]> {
  const db = getDatabase();

  // 1. Get user's engaged series (seed for recommendations)
  const engagedSeries = await getUserEngagedSeries(userId, MAX_SEED_SERIES);

  // 2. Load user feedback
  const feedback = await db.recommendationFeedback.findMany({
    where: { userId },
  });

  const dislikedIds = new Set(
    feedback
      .filter((f) => f.feedbackType === 'dislike' || f.feedbackType === 'not_interested')
      .map((f) => f.recommendedSeriesId)
  );

  const likedIds = new Set(
    feedback
      .filter((f) => f.feedbackType === 'like')
      .map((f) => f.recommendedSeriesId)
  );

  // 3. Get series user has already read (to exclude)
  const readSeriesIds = await getUserReadSeriesIds(userId);

  // 4. Check for cold start
  if (engagedSeries.length < COLD_START_THRESHOLD) {
    return getColdStartRecommendations(
      userId,
      limit,
      libraryId,
      dislikedIds,
      readSeriesIds
    );
  }

  // 5. Find similar series to user's engaged series
  const candidateScores = new Map<string, SimilarityCandidate>();

  for (const engaged of engagedSeries) {
    // Get top similar series for this engaged series
    const similar = await getSimilarSeries(engaged.seriesId, SIMILAR_PER_SEED);

    for (const sim of similar) {
      // Skip if already read or disliked
      if (readSeriesIds.has(sim.seriesId) || dislikedIds.has(sim.seriesId)) {
        continue;
      }

      // Weight by engagement score and similarity
      const weightedScore = sim.similarityScore * engaged.engagementScore;

      const existing = candidateScores.get(sim.seriesId);
      if (existing) {
        // Accumulate scores when same series appears multiple times
        existing.score += weightedScore;
        existing.reasons.push({
          type: 'similar_to',
          sourceSeriesId: engaged.seriesId,
          sourceSeriesName: engaged.seriesName,
          detail: `Similar to ${engaged.seriesName}`,
        });
      } else {
        candidateScores.set(sim.seriesId, {
          score: weightedScore,
          reasons: [
            {
              type: 'similar_to',
              sourceSeriesId: engaged.seriesId,
              sourceSeriesName: engaged.seriesName,
              detail: `Similar to ${engaged.seriesName}`,
            },
          ],
        });
      }
    }
  }

  // 6. Boost series similar to liked ones
  for (const likedId of Array.from(likedIds)) {
    const similar = await getSimilarSeries(likedId, 10);

    for (const sim of similar) {
      const existing = candidateScores.get(sim.seriesId);
      if (existing) {
        existing.score *= LIKE_BOOST;
      }
    }
  }

  // 6.5. Boost highly rated series (external ratings)
  const candidateIds = Array.from(candidateScores.keys());
  if (candidateIds.length > 0) {
    // Fetch external ratings for all candidates in one query
    const externalRatings = await db.externalRating.findMany({
      where: {
        seriesId: { in: candidateIds },
      },
      select: {
        seriesId: true,
        ratingValue: true,
        ratingType: true,
      },
    });

    // Group ratings by series and compute max
    const seriesRatings = new Map<string, { max: number; types: string[] }>();
    for (const rating of externalRatings) {
      if (!rating.seriesId) continue;
      const existing = seriesRatings.get(rating.seriesId);
      if (existing) {
        if (rating.ratingValue > existing.max) {
          existing.max = rating.ratingValue;
        }
        if (!existing.types.includes(rating.ratingType)) {
          existing.types.push(rating.ratingType);
        }
      } else {
        seriesRatings.set(rating.seriesId, {
          max: rating.ratingValue,
          types: [rating.ratingType],
        });
      }
    }

    // Apply boost to candidates with high external ratings
    for (const [seriesId, ratingInfo] of seriesRatings) {
      if (ratingInfo.max >= EXTERNAL_RATING_THRESHOLD) {
        const candidate = candidateScores.get(seriesId);
        if (candidate) {
          // Scale boost linearly: 7.0 = 1.0 (no boost), 10.0 = MAX_BOOST
          const boostFactor =
            1.0 +
            ((ratingInfo.max - EXTERNAL_RATING_THRESHOLD) /
              (10 - EXTERNAL_RATING_THRESHOLD)) *
              (EXTERNAL_RATING_MAX_BOOST - 1.0);
          candidate.score *= boostFactor;
          candidate.reasons.push({
            type: 'highly_rated',
            detail: `Highly rated (${ratingInfo.max.toFixed(1)}/10 from ${ratingInfo.types.join('/')})`,
          });
        }
      }
    }
  }

  // 7. Sort and take top candidates
  const sortedCandidates = Array.from(candidateScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  // 8. Fetch series details and filter by library
  const recommendations: SeriesRecommendation[] = [];

  for (const [seriesId, { score, reasons }] of sortedCandidates) {
    const series = await db.series.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        name: true,
        publisher: true,
        startYear: true,
        coverHash: true,
        coverUrl: true,
        genres: true,
        deletedAt: true,
        _count: { select: { issues: true } },
        // Include first issue for cover fallback
        issues: {
          take: 1,
          orderBy: [
            { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
            { filename: 'asc' },
          ],
          select: { id: true, coverHash: true },
        },
      },
    });

    if (!series || series.deletedAt) continue;

    // Check library filter if specified
    if (libraryId) {
      const inLibrary = await seriesInLibrary(seriesId, libraryId);
      if (!inLibrary) continue;
    }

    const firstIssue = series.issues[0] || null;

    recommendations.push({
      seriesId,
      series: {
        id: series.id,
        name: series.name,
        publisher: series.publisher,
        startYear: series.startYear,
        coverHash: series.coverHash,
        coverUrl: series.coverUrl,
        genres: series.genres,
        issueCount: series._count.issues,
        firstIssueId: firstIssue?.id || null,
        firstIssueCoverHash: firstIssue?.coverHash || null,
      },
      score,
      reasons: reasons.slice(0, 3), // Limit reasons to top 3
    });

    if (recommendations.length >= limit) break;
  }

  // 9. Fill remaining slots with random diverse if needed
  if (recommendations.length < limit) {
    const existingIds = new Set([
      ...Array.from(readSeriesIds),
      ...Array.from(dislikedIds),
      ...recommendations.map((r) => r.seriesId),
    ]);

    const fillCount = limit - recommendations.length;
    const randomFill = await getRandomDiverseSeries(
      fillCount,
      libraryId,
      existingIds
    );
    recommendations.push(...randomFill);
  }

  return recommendations;
}

// =============================================================================
// Cold Start Handling
// =============================================================================

/**
 * Get recommendations for users with little or no reading history.
 * Uses a mix of popular series and random diverse selections.
 */
async function getColdStartRecommendations(
  userId: string,
  limit: number,
  libraryId?: string,
  dislikedIds: Set<string> = new Set(),
  readSeriesIds: Set<string> = new Set()
): Promise<SeriesRecommendation[]> {
  const db = getDatabase();
  const recommendations: SeriesRecommendation[] = [];

  const excludeIds = new Set([...Array.from(readSeriesIds), ...Array.from(dislikedIds)]);

  // Strategy 1: Popular series (most read by all users)
  const popularLimit = Math.ceil(limit * POPULAR_RATIO);

  const popularSeries = await db.seriesProgress.groupBy({
    by: ['seriesId'],
    _sum: { totalRead: true },
    orderBy: { _sum: { totalRead: 'desc' } },
    take: popularLimit * 2, // Get extra to account for filtering
    where: {
      series: { deletedAt: null },
      seriesId: { notIn: Array.from(excludeIds) },
    },
  });

  for (const pop of popularSeries) {
    if (recommendations.length >= popularLimit) break;

    const series = await db.series.findUnique({
      where: { id: pop.seriesId },
      select: {
        id: true,
        name: true,
        publisher: true,
        startYear: true,
        coverHash: true,
        coverUrl: true,
        genres: true,
        deletedAt: true,
        _count: { select: { issues: true } },
        // Include first issue for cover fallback
        issues: {
          take: 1,
          orderBy: [
            { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
            { filename: 'asc' },
          ],
          select: { id: true, coverHash: true },
        },
      },
    });

    if (!series || series.deletedAt) continue;

    // Check library filter
    if (libraryId) {
      const inLibrary = await seriesInLibrary(pop.seriesId, libraryId);
      if (!inLibrary) continue;
    }

    const firstIssue = series.issues[0] || null;

    recommendations.push({
      seriesId: pop.seriesId,
      series: {
        id: series.id,
        name: series.name,
        publisher: series.publisher,
        startYear: series.startYear,
        coverHash: series.coverHash,
        coverUrl: series.coverUrl,
        genres: series.genres,
        issueCount: series._count.issues,
        firstIssueId: firstIssue?.id || null,
        firstIssueCoverHash: firstIssue?.coverHash || null,
      },
      score: pop._sum.totalRead || 0,
      reasons: [{ type: 'popular', detail: 'Popular with readers' }],
    });
  }

  // Strategy 2: Random diverse (fill remaining slots)
  if (recommendations.length < limit) {
    const fillIds = new Set([
      ...Array.from(excludeIds),
      ...recommendations.map((r) => r.seriesId),
    ]);
    const fillCount = limit - recommendations.length;
    const randomFill = await getRandomDiverseSeries(fillCount, libraryId, fillIds);
    recommendations.push(...randomFill);
  }

  return recommendations;
}

// =============================================================================
// Random Diverse Series
// =============================================================================

/**
 * Get random series from diverse genres/publishers.
 * Ensures variety in recommendations by avoiding same genre clusters.
 */
async function getRandomDiverseSeries(
  count: number,
  libraryId?: string,
  excludeIds: Set<string> = new Set()
): Promise<SeriesRecommendation[]> {
  const db = getDatabase();

  // Get all eligible series
  const whereClause: {
    deletedAt: null;
    id?: { notIn: string[] };
    issues?: { some: { libraryId: string } };
  } = {
    deletedAt: null,
    id: { notIn: Array.from(excludeIds) },
  };

  if (libraryId) {
    whereClause.issues = { some: { libraryId } };
  }

  const allSeries = await db.series.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      publisher: true,
      startYear: true,
      coverHash: true,
      coverUrl: true,
      genres: true,
      _count: { select: { issues: true } },
      // Include first issue for cover fallback
      issues: {
        take: 1,
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
        select: { id: true, coverHash: true },
      },
    },
    take: count * 10, // Get more than needed for filtering
  });

  // Shuffle and pick diverse selections
  const shuffled = allSeries.sort(() => Math.random() - 0.5);
  const usedGenres = new Set<string>();
  const recommendations: SeriesRecommendation[] = [];

  for (const series of shuffled) {
    if (recommendations.length >= count) break;

    // Check genre diversity
    const seriesGenres = series.genres
      ?.split(',')
      .map((g) => g.trim().toLowerCase()) || [];
    const isNewGenre = seriesGenres.length === 0 || seriesGenres.some((g) => !usedGenres.has(g));

    const firstIssue = series.issues[0] || null;

    // Add if new genre or we need more items
    if (isNewGenre || recommendations.length < count / 2) {
      seriesGenres.forEach((g) => usedGenres.add(g));
      recommendations.push({
        seriesId: series.id,
        series: {
          id: series.id,
          name: series.name,
          publisher: series.publisher,
          startYear: series.startYear,
          coverHash: series.coverHash,
          coverUrl: series.coverUrl,
          genres: series.genres,
          issueCount: series._count.issues,
          firstIssueId: firstIssue?.id || null,
          firstIssueCoverHash: firstIssue?.coverHash || null,
        },
        score: 0,
        reasons: [{ type: 'random', detail: 'Discover something new' }],
      });
    }
  }

  return recommendations;
}

// =============================================================================
// Per-Series Similar Recommendations
// =============================================================================

export type SimilarSeriesMatchType = 'similarity' | 'genre_fallback';

export interface SimilarSeriesResult {
  series: SeriesInfo;
  similarityScore: number;
  matchReasons: Array<{ type: string; score: number }>;
  matchType: SimilarSeriesMatchType;
}

/**
 * Get series similar to a specific series.
 * Used for the "Similar Series" section on SeriesDetailPage.
 *
 * When similarity-based matches are insufficient, falls back to genre-based matches
 * to ensure users always see some recommendations.
 *
 * @param seriesId - The series to find similar series for
 * @param limit - Maximum number of results (default: 10)
 * @param userId - Optional user ID for filtering read series
 * @returns Array of similar series with similarity details and match type
 */
export async function getSimilarSeriesRecommendations(
  seriesId: string,
  limit = 10,
  userId?: string
): Promise<SimilarSeriesResult[]> {
  const db = getDatabase();

  // Get similar series from precomputed scores
  const similar = await getSimilarSeries(seriesId, limit * 2);

  // Optionally exclude series user has already read
  let excludeIds = new Set<string>();
  if (userId) {
    excludeIds = await getUserReadSeriesIds(userId);
  }

  const results: SimilarSeriesResult[] = [];
  const includedSeriesIds = new Set<string>();

  for (const sim of similar) {
    if (excludeIds.has(sim.seriesId)) continue;

    const series = await db.series.findUnique({
      where: { id: sim.seriesId },
      select: {
        id: true,
        name: true,
        publisher: true,
        startYear: true,
        coverHash: true,
        coverUrl: true,
        genres: true,
        deletedAt: true,
        _count: { select: { issues: true } },
        // Include first issue for cover fallback
        issues: {
          take: 1,
          orderBy: [
            { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
            { filename: 'asc' },
          ],
          select: { id: true, coverHash: true },
        },
      },
    });

    if (!series || series.deletedAt) continue;

    const firstIssue = series.issues[0] || null;

    // Extract top match reasons
    const matchReasons = [
      { type: 'characters', score: sim.characterScore },
      { type: 'genres', score: sim.genreScore },
      { type: 'creators', score: sim.creatorScore },
      { type: 'tags', score: sim.tagScore },
      { type: 'teams', score: sim.teamScore },
      { type: 'keywords', score: sim.keywordScore },
      { type: 'publisher', score: sim.publisherScore },
    ]
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    results.push({
      series: {
        id: series.id,
        name: series.name,
        publisher: series.publisher,
        startYear: series.startYear,
        coverHash: series.coverHash,
        coverUrl: series.coverUrl,
        genres: series.genres,
        issueCount: series._count.issues,
        firstIssueId: firstIssue?.id || null,
        firstIssueCoverHash: firstIssue?.coverHash || null,
      },
      similarityScore: sim.similarityScore,
      matchReasons,
      matchType: 'similarity',
    });

    includedSeriesIds.add(sim.seriesId);

    if (results.length >= limit) break;
  }

  // If we have fewer results than requested, add genre-based fallbacks
  if (results.length < limit) {
    const fallbacks = await getGenreFallbackSeries(
      seriesId,
      limit - results.length,
      new Set([...Array.from(excludeIds), ...Array.from(includedSeriesIds), seriesId])
    );
    results.push(...fallbacks);
  }

  return results;
}

/**
 * Get genre-based fallback series when similarity matches are insufficient.
 * Finds series with overlapping genres and calculates a score based on genre overlap.
 */
async function getGenreFallbackSeries(
  sourceSeriesId: string,
  limit: number,
  excludeIds: Set<string>
): Promise<SimilarSeriesResult[]> {
  const db = getDatabase();

  // Get source series to extract its genres
  const sourceSeries = await db.series.findUnique({
    where: { id: sourceSeriesId },
    select: { genres: true, publisher: true },
  });

  if (!sourceSeries) return [];

  const sourceGenres = sourceSeries.genres
    ?.split(',')
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 0) || [];

  // If no genres, we can't do genre-based fallback
  if (sourceGenres.length === 0) return [];

  // Find series with matching genres
  // We use a simple approach: find series where genres field contains any of the source genres
  const candidateSeries = await db.series.findMany({
    where: {
      deletedAt: null,
      id: { notIn: Array.from(excludeIds) },
      genres: { not: null },
    },
    select: {
      id: true,
      name: true,
      publisher: true,
      startYear: true,
      coverHash: true,
      coverUrl: true,
      genres: true,
      _count: { select: { issues: true } },
      issues: {
        take: 1,
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
        select: { id: true, coverHash: true },
      },
    },
    take: limit * 10, // Get extra to filter and sort
  });

  // Calculate genre overlap scores
  const scoredCandidates: Array<{
    series: typeof candidateSeries[0];
    overlapCount: number;
    overlapScore: number;
  }> = [];

  for (const candidate of candidateSeries) {
    const candidateGenres = candidate.genres
      ?.split(',')
      .map((g) => g.trim().toLowerCase())
      .filter((g) => g.length > 0) || [];

    if (candidateGenres.length === 0) continue;

    // Count overlapping genres
    const overlappingGenres = sourceGenres.filter((g) =>
      candidateGenres.includes(g)
    );

    if (overlappingGenres.length > 0) {
      // Score = overlap / total unique genres (Jaccard-like)
      const unionSize = new Set([...sourceGenres, ...candidateGenres]).size;
      const overlapScore = overlappingGenres.length / unionSize;

      scoredCandidates.push({
        series: candidate,
        overlapCount: overlappingGenres.length,
        overlapScore,
      });
    }
  }

  // Sort by overlap score descending
  scoredCandidates.sort((a, b) => b.overlapScore - a.overlapScore);

  // Take top candidates up to limit
  const results: SimilarSeriesResult[] = [];

  for (const { series, overlapScore } of scoredCandidates.slice(0, limit)) {
    const firstIssue = series.issues[0] || null;

    results.push({
      series: {
        id: series.id,
        name: series.name,
        publisher: series.publisher,
        startYear: series.startYear,
        coverHash: series.coverHash,
        coverUrl: series.coverUrl,
        genres: series.genres,
        issueCount: series._count.issues,
        firstIssueId: firstIssue?.id || null,
        firstIssueCoverHash: firstIssue?.coverHash || null,
      },
      similarityScore: overlapScore,
      matchReasons: [{ type: 'genres', score: overlapScore }],
      matchType: 'genre_fallback',
    });
  }

  return results;
}

// =============================================================================
// Feedback Management
// =============================================================================

/**
 * Submit feedback on a recommendation.
 *
 * @param userId - The user ID
 * @param recommendedSeriesId - The series that was recommended
 * @param feedbackType - Type of feedback: 'like', 'dislike', or 'not_interested'
 * @param sourceSeriesId - Optional: the series that triggered this recommendation
 */
export async function submitRecommendationFeedback(
  userId: string,
  recommendedSeriesId: string,
  feedbackType: 'like' | 'dislike' | 'not_interested',
  sourceSeriesId?: string
): Promise<void> {
  const db = getDatabase();

  await db.recommendationFeedback.upsert({
    where: {
      userId_recommendedSeriesId: {
        userId,
        recommendedSeriesId,
      },
    },
    create: {
      userId,
      recommendedSeriesId,
      feedbackType,
      sourceSeriesId,
    },
    update: {
      feedbackType,
      sourceSeriesId,
    },
  });
}

/**
 * Get user's recommendation feedback.
 *
 * @param userId - The user ID
 * @returns Array of feedback records
 */
export async function getUserFeedback(userId: string): Promise<
  Array<{
    recommendedSeriesId: string;
    feedbackType: string;
    sourceSeriesId: string | null;
    createdAt: Date;
  }>
> {
  const db = getDatabase();

  return db.recommendationFeedback.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Remove feedback for a specific recommendation.
 *
 * @param userId - The user ID
 * @param recommendedSeriesId - The series to remove feedback for
 */
export async function removeRecommendationFeedback(
  userId: string,
  recommendedSeriesId: string
): Promise<void> {
  const db = getDatabase();

  await db.recommendationFeedback.delete({
    where: {
      userId_recommendedSeriesId: {
        userId,
        recommendedSeriesId,
      },
    },
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a series has files in a specific library.
 */
async function seriesInLibrary(
  seriesId: string,
  libraryId: string
): Promise<boolean> {
  const db = getDatabase();

  const count = await db.comicFile.count({
    where: {
      seriesId,
      libraryId,
    },
  });

  return count > 0;
}

/**
 * Get recommendation statistics for a user.
 */
export async function getRecommendationStats(userId: string): Promise<{
  totalFeedback: number;
  likes: number;
  dislikes: number;
  notInterested: number;
  engagedSeriesCount: number;
  hasColdStart: boolean;
}> {
  const db = getDatabase();

  const feedback = await db.recommendationFeedback.groupBy({
    by: ['feedbackType'],
    _count: true,
    where: { userId },
  });

  const feedbackCounts = {
    like: 0,
    dislike: 0,
    not_interested: 0,
  };

  for (const f of feedback) {
    if (f.feedbackType in feedbackCounts) {
      feedbackCounts[f.feedbackType as keyof typeof feedbackCounts] = f._count;
    }
  }

  const engagedSeriesCount = await db.seriesProgress.count({
    where: {
      userId,
      totalRead: { gt: 0 },
    },
  });

  return {
    totalFeedback: feedbackCounts.like + feedbackCounts.dislike + feedbackCounts.not_interested,
    likes: feedbackCounts.like,
    dislikes: feedbackCounts.dislike,
    notInterested: feedbackCounts.not_interested,
    engagedSeriesCount,
    hasColdStart: engagedSeriesCount < COLD_START_THRESHOLD,
  };
}
