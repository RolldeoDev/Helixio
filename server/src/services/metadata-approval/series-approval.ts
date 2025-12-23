/**
 * Metadata Approval - Series Approval
 *
 * Handles the series search and approval workflow (Phase 1).
 */

import { createServiceLogger } from '../logger.service.js';
import { searchSeries, type SeriesMatch, type LibraryType } from '../metadata-search.service.js';
import { getSession, setSession } from './session-store.js';
import { prepareFileChanges } from './file-review.js';
import type { ApprovalSession, ProgressCallback } from './types.js';
import type { MetadataSource } from '../metadata-providers/types.js';

const logger = createServiceLogger('metadata-approval-series');

// =============================================================================
// Series Search
// =============================================================================

/**
 * Search for series matches for the current group
 */
export async function searchForCurrentSeries(
  session: ApprovalSession,
  onProgress?: ProgressCallback
): Promise<void> {
  const group = session.seriesGroups[session.currentSeriesIndex];
  if (!group || group.status !== 'pending') return;
  const progress = onProgress || (() => {});

  group.status = 'searching';
  session.updatedAt = new Date();

  try {
    progress(`Querying metadata sources for "${group.displayName}"`);
    const results = await searchSeries(group.query, { limit: 10, libraryType: session.libraryType });
    group.searchResults = results.series;

    // Log each result found
    for (const series of results.series.slice(0, 5)) {
      const confidence = Math.round(series.confidence * 100);
      progress(
        `Match: "${series.name}" (${confidence}%)`,
        series.publisher ? `Publisher: ${series.publisher}` : undefined
      );
    }

    // Auto-select if high confidence match exists
    if (results.series.length > 0 && results.series[0]!.confidence >= 0.8) {
      group.selectedSeries = results.series[0]!;
      progress(
        `Auto-selected: "${results.series[0]!.name}"`,
        `Confidence: ${Math.round(results.series[0]!.confidence * 100)}%`
      );
    }

    group.status = 'pending'; // Back to pending, waiting for user selection
  } catch (error) {
    logger.error({ error }, 'Failed to search for series');
    progress('Search failed', error instanceof Error ? error.message : 'Unknown error');
    group.searchResults = [];
    group.status = 'pending';
  }

  session.updatedAt = new Date();
  setSession(session);
}

/**
 * Re-search with a custom query
 * @param sessionId - The session ID
 * @param query - The search query string
 * @param source - Optional specific source to search (if not provided, searches all configured sources)
 */
export async function searchSeriesCustom(
  sessionId: string,
  query: string,
  source?: MetadataSource
): Promise<SeriesMatch[]> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[session.currentSeriesIndex];
  if (!group) throw new Error('No current series group');

  group.status = 'searching';
  session.updatedAt = new Date();

  try {
    const searchOptions: { limit: number; offset?: number; sources?: MetadataSource[]; libraryType?: LibraryType } = { limit: 15 };
    if (source) {
      searchOptions.sources = [source];
    }
    // Use library type for source prioritization (unless a specific source was requested)
    if (!source && session.libraryType) {
      searchOptions.libraryType = session.libraryType;
    }
    const results = await searchSeries({ series: query }, searchOptions);
    group.searchResults = results.series;
    group.searchPagination = results.pagination;
    group.query.series = query;
    group.displayName = query;
    group.status = 'pending';
    session.updatedAt = new Date();
    setSession(session);
    return results.series;
  } catch (error) {
    group.status = 'pending';
    session.updatedAt = new Date();
    setSession(session);
    throw error;
  }
}

/**
 * Load more search results for the current series group
 * @param sessionId - The session ID
 */
export async function loadMoreSeriesResults(
  sessionId: string
): Promise<SeriesMatch[]> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[session.currentSeriesIndex];
  if (!group) throw new Error('No current series group');

  const pagination = group.searchPagination;
  if (!pagination || !pagination.hasMore) {
    return []; // No more results to load
  }

  group.status = 'searching';
  session.updatedAt = new Date();

  try {
    const newOffset = pagination.offset + pagination.limit;
    const searchOptions: { limit: number; offset: number; sources?: MetadataSource[]; libraryType?: LibraryType } = {
      limit: pagination.limit,
      offset: newOffset,
    };

    // Use library type for source prioritization
    if (session.libraryType) {
      searchOptions.libraryType = session.libraryType;
    }

    const results = await searchSeries({ series: group.query.series || '' }, searchOptions);

    // Append new results to existing
    group.searchResults = [...group.searchResults, ...results.series];
    group.searchPagination = results.pagination;
    group.status = 'pending';
    session.updatedAt = new Date();
    setSession(session);
    return results.series;
  } catch (error) {
    group.status = 'pending';
    session.updatedAt = new Date();
    setSession(session);
    throw error;
  }
}

// =============================================================================
// Series Approval Actions
// =============================================================================

/**
 * Approve the selected series and advance to the next
 */
export async function approveSeries(
  sessionId: string,
  selectedSeriesId: string,
  issueMatchingSeriesId?: string,
  onProgress?: ProgressCallback
): Promise<{ hasMore: boolean; nextIndex: number }> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[session.currentSeriesIndex];
  if (!group) throw new Error('No current series group');

  // Find and set the selected series (for series-level metadata)
  const selected = group.searchResults.find((s) => s.sourceId === selectedSeriesId);
  if (!selected) throw new Error('Selected series not found in results');

  group.selectedSeries = selected;

  // Find and set the issue matching series (for issue lookup)
  // If not provided, use the same series for both purposes
  if (issueMatchingSeriesId && issueMatchingSeriesId !== selectedSeriesId) {
    const issueMatching = group.searchResults.find((s) => s.sourceId === issueMatchingSeriesId);
    if (!issueMatching) throw new Error('Issue matching series not found in results');
    group.issueMatchingSeries = issueMatching;
  } else {
    group.issueMatchingSeries = null; // Will fall back to selectedSeries
  }

  group.status = 'approved';
  session.updatedAt = new Date();

  // Note: We intentionally do NOT pre-warm the cache here.
  // Issue fetching is deferred to prepareFileChanges() which only runs after
  // all series are approved. This avoids fetching issues for series that
  // the user might not end up selecting (during search/re-selection).

  // Move to next series
  session.currentSeriesIndex++;

  // Check if there are more series to approve
  const hasMore = session.currentSeriesIndex < session.seriesGroups.length;

  if (hasMore) {
    // Search for next series
    await searchForCurrentSeries(session);
  } else {
    // All series approved, move to file review phase
    session.status = 'fetching_issues';
    await prepareFileChanges(session, onProgress);
    session.status = 'file_review';
  }

  session.updatedAt = new Date();
  setSession(session);

  return {
    hasMore,
    nextIndex: session.currentSeriesIndex,
  };
}

/**
 * Skip the current series and advance to the next
 */
export async function skipSeries(
  sessionId: string,
  onProgress?: ProgressCallback
): Promise<{ hasMore: boolean; nextIndex: number }> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[session.currentSeriesIndex];
  if (!group) throw new Error('No current series group');

  group.status = 'skipped';
  session.currentSeriesIndex++;
  session.updatedAt = new Date();

  const hasMore = session.currentSeriesIndex < session.seriesGroups.length;

  if (hasMore) {
    await searchForCurrentSeries(session);
  } else {
    // Move to file review phase
    session.status = 'fetching_issues';
    await prepareFileChanges(session, onProgress);
    session.status = 'file_review';
  }

  setSession(session);

  return {
    hasMore,
    nextIndex: session.currentSeriesIndex,
  };
}

/**
 * Navigate back to a series group for re-selection without clearing current selection.
 * Used when user wants to review/change a series selection from file review.
 * Keeps the current selection intact so user can see what was matched.
 */
export async function navigateToSeriesGroup(
  sessionId: string,
  seriesGroupIndex: number
): Promise<ApprovalSession> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[seriesGroupIndex];
  if (!group) throw new Error('Series group not found');

  // Keep the current selection intact but set status to pending for UI
  // This allows user to see current match and search for alternatives
  group.status = 'pending';

  // Clear file changes for files in this group (they'll be regenerated on re-approval)
  session.fileChanges = session.fileChanges.filter(
    (fc) => !group.fileIds.includes(fc.fileId)
  );

  // Move session back to series_approval state
  session.status = 'series_approval';
  session.currentSeriesIndex = seriesGroupIndex;

  // Search for this series to populate search results (keeps selectedSeries intact)
  await searchForCurrentSeries(session);

  session.updatedAt = new Date();
  setSession(session);

  return session;
}

/**
 * Reset a series group to allow re-selection (clears current selection).
 * Used when user explicitly wants to clear and search fresh.
 */
export async function resetSeriesGroup(
  sessionId: string,
  seriesGroupIndex: number
): Promise<ApprovalSession> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const group = session.seriesGroups[seriesGroupIndex];
  if (!group) throw new Error('Series group not found');

  // Reset the group to pending state and clear selection
  group.status = 'pending';
  group.selectedSeries = null;
  group.issueMatchingSeries = null;
  group.preApprovedFromSeriesJson = false; // Clear pre-approval flag
  group.preApprovedFromDatabase = false; // Clear database pre-approval flag

  // Clear file changes for files in this group
  session.fileChanges = session.fileChanges.filter(
    (fc) => !group.fileIds.includes(fc.fileId)
  );

  // Move session back to series_approval state
  session.status = 'series_approval';
  session.currentSeriesIndex = seriesGroupIndex;

  // Re-search for this series
  await searchForCurrentSeries(session);

  session.updatedAt = new Date();
  setSession(session);

  return session;
}
