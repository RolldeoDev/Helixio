/**
 * External Reviews API Client
 *
 * API client for fetching and syncing external reviews from
 * AniList, MyAnimeList, and Comic Book Roundup.
 */

import { get, post, del } from './shared';

// =============================================================================
// Types
// =============================================================================

export type ReviewSource = 'anilist' | 'myanimelist' | 'comicbookroundup';

export interface ExternalReview {
  id: string;
  source: ReviewSource;
  sourceDisplayName: string;
  sourceUrl?: string;
  author: {
    name: string;
    avatarUrl?: string;
    profileUrl?: string;
  };
  text: string;
  summary?: string;
  rating?: number;
  displayRating?: string;
  hasSpoilers: boolean;
  reviewType: 'user' | 'critic';
  likes?: number;
  reviewDate?: string;
  lastSyncedAt: string;
  isStale: boolean;
  confidence: number;
}

export interface UserReview {
  userId: string;
  username: string;
  displayName: string | null;
  rating: number | null;
  publicReview: string | null;
  reviewedAt: string | null;
}

export interface SeriesReviewsResponse {
  externalReviews: ExternalReview[];
  userReviews: UserReview[];
  counts: {
    external: number;
    user: number;
    bySource: Record<ReviewSource, number>;
  };
}

export interface IssueReviewsResponse {
  externalReviews: ExternalReview[];
  userReviews: UserReview[];
  counts: {
    external: number;
    user: number;
  };
}

export interface ReviewSyncOptions {
  sources?: ReviewSource[];
  forceRefresh?: boolean;
  reviewLimit?: number;
  skipSpoilers?: boolean;
}

export interface ReviewSyncResult {
  seriesId: string;
  seriesName: string;
  success: boolean;
  reviewCount: number;
  matchedSources: ReviewSource[];
  unmatchedSources: ReviewSource[];
  errors?: Array<{
    source: ReviewSource;
    error: string;
  }>;
}

export interface IssueSyncResult {
  fileId: string;
  success: boolean;
  reviewCount: number;
  matchedSources: ReviewSource[];
  unmatchedSources: ReviewSource[];
  lastSyncedAt: string;
  errors?: Array<{
    source: ReviewSource;
    error: string;
  }>;
}

export interface ReviewSourceStatus {
  source: ReviewSource;
  displayName: string;
  enabled: boolean;
  available: boolean;
  error?: string;
  supportsIssueReviews: boolean;
}

export interface ReviewSyncJobStatus {
  id: string;
  type: 'series' | 'library' | 'scheduled';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  seriesId: string | null;
  libraryId: string | null;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  unmatchedItems: number;
  sources: ReviewSource[];
  forceRefresh: boolean;
  reviewLimit: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// =============================================================================
// Series Reviews
// =============================================================================

/**
 * Get all reviews for a series (external + user)
 */
export async function getSeriesReviews(
  seriesId: string,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
    includeUserReviews?: boolean;
  } = {}
): Promise<SeriesReviewsResponse> {
  const params = new URLSearchParams();
  if (options.source) params.set('source', options.source);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.skipSpoilers) params.set('skipSpoilers', 'true');
  if (options.includeUserReviews !== false) params.set('includeUserReviews', 'true');

  const query = params.toString();
  return get(`/external-reviews/series/${seriesId}${query ? `?${query}` : ''}`);
}

/**
 * Sync external reviews for a series
 */
export async function syncSeriesReviews(
  seriesId: string,
  options: ReviewSyncOptions = {}
): Promise<ReviewSyncResult> {
  return post(`/external-reviews/sync/series/${seriesId}`, options);
}

/**
 * Delete all external reviews for a series
 */
export async function deleteSeriesReviews(seriesId: string): Promise<{ success: boolean }> {
  return del(`/external-reviews/series/${seriesId}`);
}

// =============================================================================
// Issue Reviews
// =============================================================================

/**
 * Get all reviews for an issue (external + user)
 */
export async function getIssueReviews(
  fileId: string,
  options: {
    source?: ReviewSource;
    limit?: number;
    skipSpoilers?: boolean;
    includeUserReviews?: boolean;
  } = {}
): Promise<IssueReviewsResponse> {
  const params = new URLSearchParams();
  if (options.source) params.set('source', options.source);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.skipSpoilers) params.set('skipSpoilers', 'true');
  if (options.includeUserReviews !== false) params.set('includeUserReviews', 'true');

  const query = params.toString();
  return get(`/external-reviews/issues/${fileId}${query ? `?${query}` : ''}`);
}

/**
 * Sync external reviews for an issue
 */
export async function syncIssueReviews(
  fileId: string,
  options: {
    forceRefresh?: boolean;
    reviewLimit?: number;
    skipSpoilers?: boolean;
  } = {}
): Promise<IssueSyncResult> {
  return post(`/external-reviews/sync/issues/${fileId}`, options);
}

/**
 * Delete all external reviews for an issue
 */
export async function deleteIssueReviews(fileId: string): Promise<{ success: boolean }> {
  return del(`/external-reviews/issues/${fileId}`);
}

// =============================================================================
// Library Sync
// =============================================================================

/**
 * Queue a background job to sync reviews for all series in a library
 */
export async function syncLibraryReviews(
  libraryId: string,
  options: ReviewSyncOptions = {}
): Promise<{ jobId: string; message: string }> {
  return post(`/external-reviews/sync/library/${libraryId}`, options);
}

// =============================================================================
// Job Management
// =============================================================================

/**
 * Get list of recent review sync jobs
 */
export async function getReviewSyncJobs(
  options: { status?: string; limit?: number } = {}
): Promise<{ jobs: ReviewSyncJobStatus[] }> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return get(`/external-reviews/jobs${query ? `?${query}` : ''}`);
}

/**
 * Get status of a specific review sync job
 */
export async function getReviewSyncJobStatus(jobId: string): Promise<ReviewSyncJobStatus> {
  return get(`/external-reviews/jobs/${jobId}`);
}

/**
 * Cancel a running review sync job
 */
export async function cancelReviewSyncJob(jobId: string): Promise<{ success: boolean }> {
  return post(`/external-reviews/jobs/${jobId}/cancel`, {});
}

// =============================================================================
// Sources
// =============================================================================

/**
 * Get available review sources and their status
 */
export async function getReviewSources(): Promise<{ sources: ReviewSourceStatus[] }> {
  return get('/external-reviews/sources');
}
