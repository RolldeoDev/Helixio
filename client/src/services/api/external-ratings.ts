/**
 * External Ratings API Service
 *
 * API functions for managing external community/critic ratings.
 */

import { get, post, del, put } from './shared';

// =============================================================================
// Types
// =============================================================================

export type RatingSource =
  | 'comicbookroundup'
  | 'leagueofcomicgeeks'
  | 'comicvine'
  | 'metron'
  | 'anilist';

export type RatingType = 'community' | 'critic';

export interface ExternalRatingDisplay {
  source: RatingSource;
  sourceDisplayName: string;
  ratingType: RatingType;
  value: number;
  displayValue: string;
  voteCount?: number;
  lastSyncedAt: string;
  isStale: boolean;
  confidence: number;
  sourceUrl?: string | null;
}

export interface ExternalRatingsResponse {
  ratings: ExternalRatingDisplay[];
  averages: {
    community: { average: number | null; count: number };
    critic: { average: number | null; count: number };
  };
}

export interface RatingSourceStatus {
  source: RatingSource;
  displayName: string;
  enabled: boolean;
  available: boolean;
  error?: string;
  ratingTypes: RatingType[];
  supportsIssueRatings: boolean;
}

export interface SyncResult {
  seriesId: string;
  seriesName: string;
  success: boolean;
  ratings: Array<{
    source: RatingSource;
    sourceId: string;
    ratingType: RatingType;
    value: number;
    originalValue: number;
    scale: number;
    voteCount?: number;
  }>;
  matchedSources: RatingSource[];
  unmatchedSources: RatingSource[];
  errors?: Array<{ source: RatingSource; error: string }>;
}

export interface SyncJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  unmatchedItems: number;
  errors?: string[];
  unmatchedSeries?: Array<{ id: string; name: string }>;
}

export interface ExternalRatingsSettings {
  enabledSources: RatingSource[];
  syncSchedule: 'daily' | 'weekly' | 'manual';
  syncHour: number;
  ratingTTLDays: number;
  scrapingRateLimit: number;
  minMatchConfidence: number;
}

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

export interface CBRValidationResult {
  valid: boolean;
  error?: string;
  preview?: CBRMatchPreview;
}

export interface CBRMatchResult {
  success: boolean;
  error?: string;
  preview?: CBRMatchPreview;
}

export interface CBRMatchStatus {
  matched: boolean;
  sourceId?: string;
  sourceUrl?: string;
  matchMethod?: string;
  confidence?: number;
  matchedName?: string;
}

export interface CBRResetResult {
  success: boolean;
  researchResult?: SyncResult;
}

// =============================================================================
// Series Rating Functions
// =============================================================================

/**
 * Get external ratings for a series
 */
export async function getSeriesExternalRatings(
  seriesId: string
): Promise<ExternalRatingsResponse> {
  return get<ExternalRatingsResponse>(
    `/external-ratings/series/${seriesId}`
  );
}

/**
 * Manually sync ratings for a series
 */
export async function syncSeriesRatings(
  seriesId: string,
  options?: {
    sources?: RatingSource[];
    forceRefresh?: boolean;
  }
): Promise<SyncResult> {
  return post<SyncResult>(
    `/external-ratings/sync/series/${seriesId}`,
    options || {}
  );
}

/**
 * Delete all external ratings for a series
 */
export async function deleteSeriesExternalRatings(
  seriesId: string
): Promise<void> {
  await del(`/external-ratings/series/${seriesId}`);
}

// =============================================================================
// Issue Rating Functions
// =============================================================================

/**
 * Get external ratings for an issue
 */
export async function getIssueExternalRatings(
  fileId: string
): Promise<{ ratings: ExternalRatingDisplay[] }> {
  return get<{ ratings: ExternalRatingDisplay[] }>(
    `/external-ratings/issues/${fileId}`
  );
}

/**
 * Manually sync ratings for an issue
 */
export async function syncIssueRatings(
  fileId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ success: boolean; ratings: ExternalRatingDisplay[] }> {
  return post<{ success: boolean; ratings: ExternalRatingDisplay[] }>(
    `/external-ratings/sync/issues/${fileId}`,
    options || {}
  );
}

/**
 * Start a background job to sync ratings for all issues in a series
 */
export async function syncSeriesIssueRatings(
  seriesId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ jobId: string }> {
  return post<{ jobId: string }>(
    `/external-ratings/sync/series/${seriesId}/issues`,
    options || {}
  );
}

// =============================================================================
// Library Sync Functions
// =============================================================================

/**
 * Start a background sync job for all series in a library
 */
export async function syncLibraryRatings(
  libraryId: string,
  options?: {
    sources?: RatingSource[];
    forceRefresh?: boolean;
  }
): Promise<{ jobId: string }> {
  return post<{ jobId: string }>(
    `/external-ratings/sync/library/${libraryId}`,
    options || {}
  );
}

/**
 * Trigger a scheduled sync job
 */
export async function triggerScheduledSync(options?: {
  sources?: RatingSource[];
  forceRefresh?: boolean;
}): Promise<{ jobId: string }> {
  return post<{ jobId: string }>(
    '/external-ratings/sync/scheduled',
    options || {}
  );
}

// =============================================================================
// Job Management Functions
// =============================================================================

/**
 * Get list of sync jobs
 */
export async function getSyncJobs(options?: {
  status?: string;
  limit?: number;
}): Promise<{ jobs: SyncJobStatus[] }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return get<{ jobs: SyncJobStatus[] }>(
    `/external-ratings/jobs${query ? `?${query}` : ''}`
  );
}

/**
 * Get status of a specific sync job
 */
export async function getSyncJobStatus(jobId: string): Promise<SyncJobStatus> {
  return get<SyncJobStatus>(`/external-ratings/jobs/${jobId}`);
}

/**
 * Cancel a running sync job
 */
export async function cancelSyncJob(
  jobId: string
): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(
    `/external-ratings/jobs/${jobId}/cancel`
  );
}

// =============================================================================
// Source Management Functions
// =============================================================================

/**
 * Get all rating sources and their status
 */
export async function getRatingSources(): Promise<{
  sources: RatingSourceStatus[];
}> {
  return get<{ sources: RatingSourceStatus[] }>(
    '/external-ratings/sources'
  );
}

// =============================================================================
// Settings Functions
// =============================================================================

/**
 * Get external ratings settings
 */
export async function getExternalRatingsSettings(): Promise<ExternalRatingsSettings> {
  return get<ExternalRatingsSettings>('/external-ratings/settings');
}

/**
 * Update external ratings settings
 */
export async function updateExternalRatingsSettings(
  settings: Partial<ExternalRatingsSettings>
): Promise<ExternalRatingsSettings> {
  return put<ExternalRatingsSettings>(
    '/external-ratings/settings',
    settings
  );
}

// =============================================================================
// Manual CBR Match Functions
// =============================================================================

/**
 * Validate a CBR URL and return preview data (does NOT save)
 */
export async function validateCbrUrl(
  url: string
): Promise<CBRValidationResult> {
  return post<CBRValidationResult>('/external-ratings/cbr/validate', { url });
}

/**
 * Apply a manual CBR match: validate, fetch ratings, and save
 */
export async function saveManualCbrMatch(
  seriesId: string,
  url: string
): Promise<CBRMatchResult> {
  return post<CBRMatchResult>(
    `/external-ratings/cbr/match/${seriesId}`,
    { url }
  );
}

/**
 * Get current CBR match status for a series
 */
export async function getCbrMatchStatus(
  seriesId: string
): Promise<CBRMatchStatus> {
  return get<CBRMatchStatus>(`/external-ratings/cbr/status/${seriesId}`);
}

/**
 * Reset CBR match for a series
 * @param reSearch - If true, re-run automatic search after clearing
 */
export async function resetCbrMatch(
  seriesId: string,
  reSearch: boolean
): Promise<CBRResetResult> {
  return del<CBRResetResult>(
    `/external-ratings/cbr/match/${seriesId}?reSearch=${reSearch}`
  );
}
