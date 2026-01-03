/**
 * User Data Service
 *
 * Manages user-specific data for series and issues:
 * - Ratings (0.5-5.0 stars in 0.5 increments)
 * - Private notes (visible only to author)
 * - Public reviews (visible to other users)
 * - Review visibility toggle
 * - Rating aggregation for series
 * - Migration from localStorage notes
 */

import { getDatabase } from './database.service.js';
import { markSmartCollectionsDirty } from './smart-collection-dirty.service.js';
import { markDirtyForRatingChange } from './stats-dirty.service.js';
import { triggerAchievementCheck } from './achievement-trigger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface UserSeriesData {
  id: string;
  userId: string;
  seriesId: string;
  rating: number | null;
  privateNotes: string | null;
  publicReview: string | null;
  reviewVisibility: 'private' | 'public';
  ratedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserIssueData {
  id: string;
  userId: string;
  fileId: string;
  rating: number | null;
  privateNotes: string | null;
  publicReview: string | null;
  reviewVisibility: 'private' | 'public';
  ratedAt: Date | null;
  reviewedAt: Date | null;
  // Reading progress fields (included for convenience)
  currentPage: number;
  totalPages: number;
  completed: boolean;
  lastReadAt: Date;
}

export interface UpdateUserDataInput {
  rating?: number | null;
  privateNotes?: string | null;
  publicReview?: string | null;
  reviewVisibility?: 'private' | 'public';
}

export interface SeriesRatingStats {
  average: number | null;
  count: number;
  totalIssues: number;
}

export interface LocalStorageNote {
  fileId: string;
  title?: string;
  content?: string;
  rating?: number;
  tags?: string[];
}

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: string[];
}

// =============================================================================
// Series User Data CRUD
// =============================================================================

/**
 * Get user's data for a series
 */
export async function getSeriesUserData(
  userId: string,
  seriesId: string
): Promise<UserSeriesData | null> {
  const db = getDatabase();

  const data = await db.userSeriesData.findUnique({
    where: {
      userId_seriesId: { userId, seriesId },
    },
  });

  if (!data) return null;

  return {
    ...data,
    reviewVisibility: data.reviewVisibility as 'private' | 'public',
  };
}

/**
 * Update user's data for a series (rating, notes, review)
 */
export async function updateSeriesUserData(
  userId: string,
  seriesId: string,
  input: UpdateUserDataInput
): Promise<UserSeriesData> {
  const db = getDatabase();

  // Verify series exists
  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {};
  const now = new Date();

  if (input.rating !== undefined) {
    // Validate rating is 0.5-5.0 in 0.5 increments, or null
    if (input.rating !== null) {
      if (input.rating < 0.5 || input.rating > 5) {
        throw new Error('Rating must be between 0.5 and 5');
      }
      // Validate 0.5 increments: multiply by 2, check if integer
      if ((input.rating * 2) % 1 !== 0) {
        throw new Error('Rating must be in 0.5 increments');
      }
    }
    updateData.rating = input.rating;
    updateData.ratedAt = input.rating !== null ? now : null;
  }

  if (input.privateNotes !== undefined) {
    updateData.privateNotes = input.privateNotes;
    updateData.reviewedAt = now;
  }

  if (input.publicReview !== undefined) {
    updateData.publicReview = input.publicReview;
    updateData.reviewedAt = now;
  }

  if (input.reviewVisibility !== undefined) {
    updateData.reviewVisibility = input.reviewVisibility;
  }

  const data = await db.userSeriesData.upsert({
    where: {
      userId_seriesId: { userId, seriesId },
    },
    create: {
      userId,
      seriesId,
      rating: input.rating ?? null,
      privateNotes: input.privateNotes ?? null,
      publicReview: input.publicReview ?? null,
      reviewVisibility: input.reviewVisibility ?? 'private',
      ratedAt: input.rating !== undefined && input.rating !== null ? now : null,
      reviewedAt: (input.privateNotes !== undefined || input.publicReview !== undefined) ? now : null,
    },
    update: updateData,
  });

  // Mark smart collections dirty if rating changed (for rating-based filters)
  if (input.rating !== undefined) {
    markSmartCollectionsDirty({
      userId,
      seriesIds: [seriesId],
      reason: 'user_data',
    }).catch(() => {
      // Non-critical, errors logged inside
    });

    // Mark rating stats as dirty for recomputation
    markDirtyForRatingChange().catch(() => {
      // Non-critical
    });
  }

  // Also mark dirty if review was added/changed
  if (input.publicReview !== undefined || input.privateNotes !== undefined) {
    markDirtyForRatingChange().catch(() => {
      // Non-critical
    });
  }

  // Trigger achievement check if rating or review was saved
  if (input.rating !== undefined || input.publicReview !== undefined) {
    triggerAchievementCheck(userId).catch(() => {
      // Non-critical, errors logged inside the function
    });
  }

  return {
    ...data,
    reviewVisibility: data.reviewVisibility as 'private' | 'public',
  };
}

/**
 * Delete user's data for a series
 */
export async function deleteSeriesUserData(
  userId: string,
  seriesId: string
): Promise<void> {
  const db = getDatabase();

  await db.userSeriesData.delete({
    where: {
      userId_seriesId: { userId, seriesId },
    },
  }).catch(() => {
    // Ignore if not found
  });
}

// =============================================================================
// Issue User Data CRUD
// =============================================================================

/**
 * Get user's data for an issue (file)
 */
export async function getIssueUserData(
  userId: string,
  fileId: string
): Promise<UserIssueData | null> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findUnique({
    where: {
      userId_fileId: { userId, fileId },
    },
  });

  if (!progress) return null;

  return {
    id: progress.id,
    userId: progress.userId,
    fileId: progress.fileId,
    rating: progress.rating,
    privateNotes: progress.privateNotes,
    publicReview: progress.publicReview,
    reviewVisibility: (progress.reviewVisibility || 'private') as 'private' | 'public',
    ratedAt: progress.ratedAt,
    reviewedAt: progress.reviewedAt,
    currentPage: progress.currentPage,
    totalPages: progress.totalPages,
    completed: progress.completed,
    lastReadAt: progress.lastReadAt,
  };
}

/**
 * Update user's data for an issue (rating, notes, review)
 */
export async function updateIssueUserData(
  userId: string,
  fileId: string,
  input: UpdateUserDataInput
): Promise<UserIssueData> {
  const db = getDatabase();

  // Verify file exists
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {};
  const now = new Date();

  if (input.rating !== undefined) {
    // Validate rating is 0.5-5.0 in 0.5 increments, or null
    if (input.rating !== null) {
      if (input.rating < 0.5 || input.rating > 5) {
        throw new Error('Rating must be between 0.5 and 5');
      }
      // Validate 0.5 increments: multiply by 2, check if integer
      if ((input.rating * 2) % 1 !== 0) {
        throw new Error('Rating must be in 0.5 increments');
      }
    }
    updateData.rating = input.rating;
    updateData.ratedAt = input.rating !== null ? now : null;
  }

  if (input.privateNotes !== undefined) {
    updateData.privateNotes = input.privateNotes;
    updateData.reviewedAt = now;
  }

  if (input.publicReview !== undefined) {
    updateData.publicReview = input.publicReview;
    updateData.reviewedAt = now;
  }

  if (input.reviewVisibility !== undefined) {
    updateData.reviewVisibility = input.reviewVisibility;
  }

  const progress = await db.userReadingProgress.upsert({
    where: {
      userId_fileId: { userId, fileId },
    },
    create: {
      userId,
      fileId,
      currentPage: 0,
      totalPages: 0,
      completed: false,
      bookmarks: '[]',
      rating: input.rating ?? null,
      privateNotes: input.privateNotes ?? null,
      publicReview: input.publicReview ?? null,
      reviewVisibility: input.reviewVisibility ?? 'private',
      ratedAt: input.rating !== undefined && input.rating !== null ? now : null,
      reviewedAt: (input.privateNotes !== undefined || input.publicReview !== undefined) ? now : null,
    },
    update: updateData,
  });

  // Mark smart collections dirty if rating changed (for rating-based filters)
  if (input.rating !== undefined && file.seriesId) {
    markSmartCollectionsDirty({
      userId,
      seriesIds: [file.seriesId],
      fileIds: [fileId],
      reason: 'user_data',
    }).catch(() => {
      // Non-critical, errors logged inside
    });

    // Mark rating stats as dirty for recomputation
    markDirtyForRatingChange().catch(() => {
      // Non-critical
    });
  }

  // Also mark dirty if review was added/changed
  if (input.publicReview !== undefined || input.privateNotes !== undefined) {
    markDirtyForRatingChange().catch(() => {
      // Non-critical
    });
  }

  // Trigger achievement check if rating or review was saved
  if (input.rating !== undefined || input.publicReview !== undefined) {
    triggerAchievementCheck(userId).catch(() => {
      // Non-critical, errors logged inside the function
    });
  }

  return {
    id: progress.id,
    userId: progress.userId,
    fileId: progress.fileId,
    rating: progress.rating,
    privateNotes: progress.privateNotes,
    publicReview: progress.publicReview,
    reviewVisibility: (progress.reviewVisibility || 'private') as 'private' | 'public',
    ratedAt: progress.ratedAt,
    reviewedAt: progress.reviewedAt,
    currentPage: progress.currentPage,
    totalPages: progress.totalPages,
    completed: progress.completed,
    lastReadAt: progress.lastReadAt,
  };
}

/**
 * Delete user's rating and review for an issue (keeps reading progress)
 */
export async function deleteIssueUserData(
  userId: string,
  fileId: string
): Promise<void> {
  const db = getDatabase();

  // Only clear the rating/review fields, keep reading progress
  await db.userReadingProgress.update({
    where: {
      userId_fileId: { userId, fileId },
    },
    data: {
      rating: null,
      privateNotes: null,
      publicReview: null,
      reviewVisibility: 'private',
      ratedAt: null,
      reviewedAt: null,
    },
  }).catch(() => {
    // Ignore if not found
  });
}

// =============================================================================
// Rating Aggregation
// =============================================================================

/**
 * Get average rating for a series from its rated issues
 */
export async function getSeriesAverageRating(
  userId: string,
  seriesId: string
): Promise<SeriesRatingStats> {
  const db = getDatabase();

  // Get all files in the series
  const files = await db.comicFile.findMany({
    where: { seriesId },
    select: { id: true },
  });

  const totalIssues = files.length;

  if (totalIssues === 0) {
    return { average: null, count: 0, totalIssues: 0 };
  }

  const fileIds = files.map(f => f.id);

  // Get ratings for these files
  const ratings = await db.userReadingProgress.findMany({
    where: {
      userId,
      fileId: { in: fileIds },
      rating: { not: null },
    },
    select: {
      rating: true,
    },
  });

  if (ratings.length === 0) {
    return { average: null, count: 0, totalIssues };
  }

  const sum = ratings.reduce((acc, r) => acc + (r.rating || 0), 0);
  const average = sum / ratings.length;

  return {
    average: Math.round(average * 10) / 10, // Round to 1 decimal
    count: ratings.length,
    totalIssues,
  };
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Get user data for multiple series at once (for grid views)
 */
export async function getSeriesUserDataBatch(
  userId: string,
  seriesIds: string[]
): Promise<Map<string, UserSeriesData>> {
  const db = getDatabase();

  const data = await db.userSeriesData.findMany({
    where: {
      userId,
      seriesId: { in: seriesIds },
    },
  });

  const map = new Map<string, UserSeriesData>();
  for (const d of data) {
    map.set(d.seriesId, {
      ...d,
      reviewVisibility: d.reviewVisibility as 'private' | 'public',
    });
  }

  return map;
}

/**
 * Get user data for multiple issues at once (for grid views)
 */
export async function getIssuesUserDataBatch(
  userId: string,
  fileIds: string[]
): Promise<Map<string, UserIssueData>> {
  const db = getDatabase();

  const progress = await db.userReadingProgress.findMany({
    where: {
      userId,
      fileId: { in: fileIds },
    },
  });

  const map = new Map<string, UserIssueData>();
  for (const p of progress) {
    map.set(p.fileId, {
      id: p.id,
      userId: p.userId,
      fileId: p.fileId,
      rating: p.rating,
      privateNotes: p.privateNotes,
      publicReview: p.publicReview,
      reviewVisibility: (p.reviewVisibility || 'private') as 'private' | 'public',
      ratedAt: p.ratedAt,
      reviewedAt: p.reviewedAt,
      currentPage: p.currentPage,
      totalPages: p.totalPages,
      completed: p.completed,
      lastReadAt: p.lastReadAt,
    });
  }

  return map;
}

// =============================================================================
// Migration
// =============================================================================

/**
 * Migrate localStorage notes to database
 * This is a one-time migration for existing users
 */
export async function migrateLocalStorageNotes(
  userId: string,
  notes: LocalStorageNote[]
): Promise<MigrationResult> {
  const db = getDatabase();

  const result: MigrationResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
  };

  for (const note of notes) {
    try {
      // Check if file exists
      const file = await db.comicFile.findUnique({
        where: { id: note.fileId },
      });

      if (!file) {
        result.skipped++;
        result.errors.push(`File not found: ${note.fileId}`);
        continue;
      }

      // Build private notes content from title, content, and tags
      let privateNotes = '';
      if (note.title) {
        privateNotes += `# ${note.title}\n\n`;
      }
      if (note.content) {
        privateNotes += note.content;
      }
      if (note.tags && note.tags.length > 0) {
        privateNotes += `\n\n---\nTags: ${note.tags.join(', ')}`;
      }

      // Upsert the reading progress with rating and notes
      await db.userReadingProgress.upsert({
        where: {
          userId_fileId: { userId, fileId: note.fileId },
        },
        create: {
          userId,
          fileId: note.fileId,
          currentPage: 0,
          totalPages: 0,
          completed: false,
          bookmarks: '[]',
          rating: note.rating ?? null,
          privateNotes: privateNotes || null,
          ratedAt: note.rating ? new Date() : null,
          reviewedAt: privateNotes ? new Date() : null,
        },
        update: {
          // Only update if fields are not already set
          rating: note.rating ?? undefined,
          privateNotes: privateNotes || undefined,
          ratedAt: note.rating ? new Date() : undefined,
          reviewedAt: privateNotes ? new Date() : undefined,
        },
      });

      result.migrated++;
    } catch (error) {
      result.errors.push(`Error migrating ${note.fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return result;
}

// =============================================================================
// Public Reviews (for multi-user display)
// =============================================================================

/**
 * Get all public reviews for a series
 */
export async function getSeriesPublicReviews(
  seriesId: string
): Promise<Array<{
  userId: string;
  username: string;
  displayName: string | null;
  rating: number | null;
  publicReview: string | null;
  reviewedAt: Date | null;
}>> {
  const db = getDatabase();

  const reviews = await db.userSeriesData.findMany({
    where: {
      seriesId,
      reviewVisibility: 'public',
      OR: [
        { rating: { not: null } },
        { publicReview: { not: null } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      reviewedAt: 'desc',
    },
  });

  return reviews.map(r => ({
    userId: r.user.id,
    username: r.user.username,
    displayName: r.user.displayName,
    rating: r.rating,
    publicReview: r.publicReview,
    reviewedAt: r.reviewedAt,
  }));
}

/**
 * Get all public reviews for an issue
 */
export async function getIssuePublicReviews(
  fileId: string
): Promise<Array<{
  userId: string;
  username: string;
  displayName: string | null;
  rating: number | null;
  publicReview: string | null;
  reviewedAt: Date | null;
}>> {
  const db = getDatabase();

  const reviews = await db.userReadingProgress.findMany({
    where: {
      fileId,
      reviewVisibility: 'public',
      OR: [
        { rating: { not: null } },
        { publicReview: { not: null } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      reviewedAt: 'desc',
    },
  });

  return reviews.map(r => ({
    userId: r.user.id,
    username: r.user.username,
    displayName: r.user.displayName,
    rating: r.rating,
    publicReview: r.publicReview,
    reviewedAt: r.reviewedAt,
  }));
}

/**
 * Get count of public reviews for a series (Helixio users)
 */
export async function getSeriesPublicReviewCount(seriesId: string): Promise<number> {
  const db = getDatabase();
  return db.userSeriesData.count({
    where: {
      seriesId,
      reviewVisibility: 'public',
      OR: [
        { rating: { not: null } },
        { publicReview: { not: null } },
      ],
    },
  });
}

/**
 * Get count of public reviews for an issue (Helixio users)
 */
export async function getIssuePublicReviewCount(fileId: string): Promise<number> {
  const db = getDatabase();
  return db.userReadingProgress.count({
    where: {
      fileId,
      reviewVisibility: 'public',
      OR: [
        { rating: { not: null } },
        { publicReview: { not: null } },
      ],
    },
  });
}
