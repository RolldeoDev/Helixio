/**
 * API User Data Module
 *
 * User ratings, reviews, and notes for series and issues.
 */

import { get, put, del, post } from './shared';

// =============================================================================
// Types
// =============================================================================

export interface UserSeriesData {
  rating: number | null;
  privateNotes: string | null;
  publicReview: string | null;
  reviewVisibility: 'private' | 'public';
  ratedAt: string | null;
  reviewedAt: string | null;
}

export interface UserIssueData {
  rating: number | null;
  privateNotes: string | null;
  publicReview: string | null;
  reviewVisibility: 'private' | 'public';
  ratedAt: string | null;
  reviewedAt: string | null;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  lastReadAt: string | null;
}

export interface SeriesRatingStats {
  average: number | null;
  count: number;
  totalIssues: number;
}

export interface UpdateUserDataInput {
  rating?: number | null;
  privateNotes?: string | null;
  publicReview?: string | null;
  reviewVisibility?: 'private' | 'public';
}

export interface PublicReview {
  userId: string;
  username: string;
  displayName: string | null;
  rating: number | null;
  publicReview: string | null;
  reviewedAt: string | null;
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
// Series User Data
// =============================================================================

/**
 * Get user's data for a series
 */
export async function getSeriesUserData(seriesId: string): Promise<{
  data: UserSeriesData;
  ratingStats: SeriesRatingStats;
}> {
  return get(`/user-data/series/${seriesId}`);
}

/**
 * Update user's data for a series
 */
export async function updateSeriesUserData(
  seriesId: string,
  input: UpdateUserDataInput
): Promise<{
  data: UserSeriesData;
  ratingStats: SeriesRatingStats;
}> {
  return put(`/user-data/series/${seriesId}`, input);
}

/**
 * Delete user's data for a series
 */
export async function deleteSeriesUserData(seriesId: string): Promise<void> {
  await del(`/user-data/series/${seriesId}`);
}

/**
 * Get average rating from issues in a series
 */
export async function getSeriesAverageRating(seriesId: string): Promise<SeriesRatingStats> {
  return get(`/user-data/series/${seriesId}/average`);
}

/**
 * Get public reviews for a series
 */
export async function getSeriesPublicReviews(seriesId: string): Promise<{ reviews: PublicReview[] }> {
  return get(`/user-data/series/${seriesId}/reviews`);
}

// =============================================================================
// Issue User Data
// =============================================================================

/**
 * Get user's data for an issue
 */
export async function getIssueUserData(fileId: string): Promise<{
  data: UserIssueData;
}> {
  return get(`/user-data/issues/${fileId}`);
}

/**
 * Update user's data for an issue
 */
export async function updateIssueUserData(
  fileId: string,
  input: UpdateUserDataInput
): Promise<{
  data: UserIssueData;
}> {
  return put(`/user-data/issues/${fileId}`, input);
}

/**
 * Delete user's rating/review for an issue (keeps reading progress)
 */
export async function deleteIssueUserData(fileId: string): Promise<void> {
  await del(`/user-data/issues/${fileId}`);
}

/**
 * Get public reviews for an issue
 */
export async function getIssuePublicReviews(fileId: string): Promise<{ reviews: PublicReview[] }> {
  return get(`/user-data/issues/${fileId}/reviews`);
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Get user data for multiple series at once
 */
export async function getSeriesUserDataBatch(
  seriesIds: string[]
): Promise<{ data: Record<string, UserSeriesData> }> {
  return post(`/user-data/series/batch`, { seriesIds });
}

/**
 * Get user data for multiple issues at once
 */
export async function getIssuesUserDataBatch(
  fileIds: string[]
): Promise<{ data: Record<string, UserIssueData> }> {
  return post(`/user-data/issues/batch`, { fileIds });
}

// =============================================================================
// Migration
// =============================================================================

/**
 * Migrate localStorage notes to database
 */
export async function migrateLocalStorageNotes(
  notes: LocalStorageNote[]
): Promise<MigrationResult> {
  return post(`/user-data/migrate-notes`, { notes });
}
