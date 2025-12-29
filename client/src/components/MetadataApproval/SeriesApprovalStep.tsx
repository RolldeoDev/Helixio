/**
 * SeriesApprovalStep Component
 *
 * Phase 1 of the approval workflow - series selection.
 * Shows one series at a time (wizard-style), allows search refinement,
 * and displays search results with confidence scores.
 *
 * Uses MetadataJobContext for persistent job-based operations instead of
 * the ephemeral session API, ensuring operations survive server restarts.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useMetadataJob, type ExpandedSeriesResult } from '../../contexts/MetadataJobContext';
import {
  type ApprovalSession,
  type SeriesMatch,
  type SeriesGroup,
  type MergedSeriesMetadata,
  type MetadataSource,
} from '../../services/api.service';
import { SeriesDetailDrawer } from './SeriesDetailDrawer';
import { MergedMetadataModal } from './MergedMetadataModal';
import { MatchedFilesModal } from './MatchedFilesModal';
import { useConfirmModal } from '../ConfirmModal';

interface SeriesApprovalStepProps {
  session: ApprovalSession;
  onSessionUpdate: (session: ApprovalSession) => void;
  onComplete: () => void;
}

export function SeriesApprovalStep({
  session,
  onSessionUpdate: _onSessionUpdate, // Now handled by MetadataJobContext
  onComplete: _onComplete, // Now handled by MetadataJobContext
}: SeriesApprovalStepProps) {
  // Get job context methods for persistent operations
  const {
    searchSeries: searchSeriesJob,
    loadMoreSeriesResults: loadMoreSeriesResultsJob,
    approveSeries: approveSeriesJob,
    skipSeries: skipSeriesJob,
    resetSeriesSelection,
    expandResult,
    searchAllSources,
    options: _options,
  } = useMetadataJob();
  void _options; // Reserved for future feature expansion

  // Confirmation modal hook
  const confirm = useConfirmModal();

  // Compute currentGroup from seriesGroups array and currentSeriesIndex
  // The server returns seriesGroups[] and currentSeriesIndex, not currentSeriesGroup directly
  const currentGroup = useMemo((): SeriesGroup | null => {
    // First check if session has currentSeriesGroup (for backward compatibility)
    if (session.currentSeriesGroup) {
      return session.currentSeriesGroup;
    }
    // Otherwise compute from seriesGroups array
    if (session.seriesGroups && session.seriesGroups.length > 0) {
      const index = session.currentSeriesIndex ?? 0;
      const group = session.seriesGroups[index];
      if (group) {
        // Transform to full SeriesGroup format if needed
        return {
          displayName: group.displayName,
          query: group.query || { series: group.displayName },
          fileCount: group.fileCount || group.filenames?.length || 0,
          fileIds: group.fileIds || [],
          filenames: group.filenames || [],
          status: group.status || 'pending',
          searchResults: group.searchResults || [],
          selectedSeries: group.selectedSeries || null,
          issueMatchingSeries: group.issueMatchingSeries || null,
          preApprovedFromSeriesJson: group.preApprovedFromSeriesJson,
          preApprovedFromDatabase: group.preApprovedFromDatabase,
        };
      }
    }
    return null;
  }, [session]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(
    currentGroup?.selectedSeries?.sourceId ?? null
  );
  // For dual selection mode: allows using different series for issue matching
  const [useDifferentForIssues, setUseDifferentForIssues] = useState(false);
  const [issueMatchingSeriesId, setIssueMatchingSeriesId] = useState<string | null>(null);
  // For applying selection to all remaining series
  const [applyToRemaining, setApplyToRemaining] = useState(false);

  const [searchQuery, setSearchQuery] = useState(
    currentGroup?.query.series ?? ''
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Series detail drawer state
  const [drawerSeries, setDrawerSeries] = useState<SeriesMatch | null>(null);
  // Merged metadata modal state (for expand functionality)
  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);
  const [expandedResult, setExpandedResult] = useState<ExpandedSeriesResult | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [_expandingSeriesId, setExpandingSeriesId] = useState<string | null>(null);
  void _expandingSeriesId; // Reserved for showing loading indicator on specific result
  // Source selector state
  const [selectedSource, setSelectedSource] = useState<MetadataSource | 'all'>('all');
  // Load more state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Matched files modal state
  const [isMatchedFilesModalOpen, setIsMatchedFilesModalOpen] = useState(false);

  // Track the last processed series index to avoid resetting user selections on polls
  const lastProcessedIndexRef = useRef<number | null>(null);

  // Reset state when moving to a NEW series (index changes)
  useEffect(() => {
    const currentIndex = session.currentSeriesIndex ?? 0;

    // Only run when we move to a different series
    if (lastProcessedIndexRef.current !== currentIndex) {
      lastProcessedIndexRef.current = currentIndex;

      if (currentGroup) {
        // Reset selections for the new series
        setSelectedSeriesId(currentGroup.selectedSeries?.sourceId ?? null);
        setIssueMatchingSeriesId(currentGroup.issueMatchingSeries?.sourceId ?? null);
        setUseDifferentForIssues(false);
        setApplyToRemaining(false);

        // Update search query from group
        const newQuery = currentGroup.query?.series || currentGroup.displayName || '';
        setSearchQuery(newQuery);

        // Auto-select high-confidence result if nothing selected
        if (!currentGroup.selectedSeries?.sourceId && currentGroup.searchResults?.length > 0) {
          const topResult = currentGroup.searchResults[0];
          if (topResult && topResult.confidence >= 0.8) {
            setSelectedSeriesId(topResult.sourceId);
          }
        }
      }
    }
  }, [session.currentSeriesIndex, currentGroup]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      // Use job context method for persistent search
      // Pass source only if a specific source is selected (not 'all')
      const source = selectedSource === 'all' ? undefined : selectedSource;
      await searchSeriesJob(searchQuery.trim(), source);

      // The context will update the session via polling/state updates
      // For immediate UI feedback, we can optimistically update search query display
      setSelectedSeriesId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchSeriesJob, selectedSource]);

  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true);
    setError(null);

    try {
      await loadMoreSeriesResultsJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more results');
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadMoreSeriesResultsJob]);

  const handleApprove = useCallback(async () => {
    if (!selectedSeriesId) return;

    // If using different series for issues, ensure one is selected
    if (useDifferentForIssues && !issueMatchingSeriesId) {
      setError('Please select a series for issue matching');
      return;
    }

    // Show confirmation dialog when applying to remaining series
    if (applyToRemaining) {
      const remainingCount = (session.seriesGroups?.length ?? 0) - (session.currentSeriesIndex ?? 0) - 1;
      const selectedSeriesName = currentGroup?.searchResults?.find(
        s => s.sourceId === selectedSeriesId
      )?.name ?? 'selected series';

      const confirmed = await confirm({
        title: 'Apply to Remaining Series',
        message: `Apply "${selectedSeriesName}" to ${remainingCount} remaining series groups? This will match all remaining files to this series.`,
        confirmText: 'Apply to All',
        cancelText: 'Cancel',
        variant: 'warning',
      });

      if (!confirmed) return;
    }

    setIsApproving(true);
    setError(null);

    try {
      // Use job context method for persistent approval
      // Pass issueMatchingSeriesId only if different from selectedSeriesId
      const issueSeriesId = useDifferentForIssues ? issueMatchingSeriesId : undefined;
      await approveSeriesJob(selectedSeriesId, issueSeriesId ?? undefined, applyToRemaining);

      // The context will update the session and step state via polling
      // Reset selection for potential next series
      setSelectedSeriesId(null);
      setIssueMatchingSeriesId(null);
      setUseDifferentForIssues(false);
      setApplyToRemaining(false);
      setSearchQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve series');
    } finally {
      setIsApproving(false);
    }
  }, [selectedSeriesId, issueMatchingSeriesId, useDifferentForIssues, applyToRemaining, approveSeriesJob, session.seriesGroups, session.currentSeriesIndex, currentGroup, confirm]);

  const handleSkip = useCallback(async () => {
    setIsApproving(true);
    setError(null);

    try {
      // Use job context method for persistent skip
      await skipSeriesJob();

      // The context will update the session and step state via polling
      // Reset selection for potential next series
      setSelectedSeriesId(null);
      setIssueMatchingSeriesId(null);
      setUseDifferentForIssues(false);
      setSearchQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip series');
    } finally {
      setIsApproving(false);
    }
  }, [skipSeriesJob]);

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  // Handler to navigate to re-select a pre-approved group
  // No confirmation needed - current selection stays visible
  const handleUnlockPreApproved = useCallback(() => {
    const index = session.currentSeriesIndex ?? 0;
    resetSeriesSelection(index);
  }, [session.currentSeriesIndex, resetSeriesSelection]);

  // Handler to expand a single series result (fetch from all sources)
  // Reserved for future "expand to all sources" UI feature
  const _handleExpandResult = useCallback(async (series: SeriesMatch) => {
    setIsExpanding(true);
    setExpandingSeriesId(series.sourceId);
    setError(null);

    try {
      const result = await expandResult(series);
      setExpandedResult(result);
      setIsExpandModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand search');
    } finally {
      setIsExpanding(false);
      setExpandingSeriesId(null);
    }
  }, [expandResult]);
  void _handleExpandResult;

  // Handler to search all sources globally
  // Reserved for future "search all sources" UI feature
  const _handleSearchAllSources = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsExpanding(true);
    setExpandingSeriesId(null);
    setError(null);

    try {
      const result = await searchAllSources(searchQuery.trim());
      if (result) {
        setExpandedResult(result);
        setIsExpandModalOpen(true);
      } else {
        setError('No results found from any source');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search all sources');
    } finally {
      setIsExpanding(false);
    }
  }, [searchQuery, searchAllSources]);
  void _handleSearchAllSources;

  // Handler when user accepts merged data from the modal
  const handleAcceptMerged = useCallback((merged: MergedSeriesMetadata) => {
    // Set as selected series
    setSelectedSeriesId(merged.sourceId);
    setIsExpandModalOpen(false);
    setExpandedResult(null);

    // Note: The merged data will be used when approving - the sourceId and source
    // from the merged result point to the primary contributing source
  }, []);

  if (!currentGroup) {
    // Show detailed diagnostic info when currentGroup is missing
    return (
      <div className="approval-loading">
        <div className="spinner" />
        <p>Loading series data...</p>
        <div className="loading-diagnostics">
          <p className="diagnostic-detail">
            Session Status: {session.status || 'unknown'}
          </p>
          <p className="diagnostic-detail">
            Series Groups: {session.seriesGroups?.length ?? 0}
          </p>
          <p className="diagnostic-detail">
            Current Index: {session.currentSeriesIndex ?? 'N/A'}
          </p>
          {session.seriesGroups?.length === 0 && (
            <p className="diagnostic-warning">
              No series groups found. The initialization may have failed to parse any files.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="series-approval-step">
      <div className="series-info">
        <div className="series-detected">
          <span className="label">Detected Series:</span>
          <span className="value">{currentGroup.displayName}</span>
          {currentGroup.query.year && (
            <span className="year">({currentGroup.query.year})</span>
          )}
        </div>
        <div className="series-files">
          <span className="file-count">{currentGroup.fileCount} files</span>
          <button
            className="file-list-preview-btn"
            onClick={() => setIsMatchedFilesModalOpen(true)}
            title="View all matched files"
          >
            <div className="file-list-preview">
              {currentGroup.filenames.slice(0, 3).map((name, idx) => (
                <span key={idx} className="filename" title={name}>
                  {name}
                </span>
              ))}
              {currentGroup.filenames.length > 3 && (
                <span className="more-files">
                  +{currentGroup.filenames.length - 3} more
                </span>
              )}
            </div>
            <span className="view-all-icon" title="View all files">✎</span>
          </button>
        </div>
      </div>

      {/* Pre-approved banner for auto-matched groups (from series.json or database) */}
      {(currentGroup.preApprovedFromSeriesJson || currentGroup.preApprovedFromDatabase) && (
        <div className="pre-approved-banner">
          <span className="banner-icon">✓</span>
          <span className="banner-text">
            Auto-matched from {currentGroup.preApprovedFromDatabase ? 'library' : 'series.json'}
          </span>
          <button
            className="btn-secondary btn-sm"
            onClick={handleUnlockPreApproved}
            disabled={isSearching || isApproving}
          >
            Change Selection
          </button>
        </div>
      )}

      {/* Banner when returning to review current selection (not pre-approved) */}
      {!currentGroup.preApprovedFromSeriesJson && !currentGroup.preApprovedFromDatabase && currentGroup.selectedSeries && (
        <div className="pre-approved-banner reviewing-selection">
          <span className="banner-icon">↩</span>
          <span className="banner-text">
            Currently matched to: <strong>{currentGroup.selectedSeries.name}</strong>
            {currentGroup.selectedSeries.startYear && ` (${currentGroup.selectedSeries.startYear})`}
          </span>
          <span className="banner-hint">Search below to change, or approve to keep current selection</span>
        </div>
      )}

      <div className="search-bar">
        <select
          className="source-selector"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value as MetadataSource | 'all')}
          disabled={isSearching || isApproving || isExpanding}
        >
          <option value="all">All Sources</option>
          <option value="comicvine">ComicVine</option>
          <option value="metron">Metron</option>
          <option value="gcd">GCD</option>
          <option value="anilist">AniList</option>
          <option value="mal">MAL</option>
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search for series..."
          disabled={isSearching || isApproving || isExpanding}
        />
        <button
          className="btn-secondary"
          onClick={handleSearch}
          disabled={isSearching || isApproving || isExpanding || !searchQuery.trim()}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Toggle options row */}
      <div className="selection-options-row">
        {/* Toggle for dual selection mode */}
        {currentGroup.searchResults.length > 1 && (
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={useDifferentForIssues}
              onChange={(e) => {
                setUseDifferentForIssues(e.target.checked);
                if (!e.target.checked) {
                  setIssueMatchingSeriesId(null);
                }
              }}
              disabled={isApproving}
            />
            <span>Use different series for issue matching</span>
          </label>
        )}
        {/* Toggle for applying to remaining series */}
        {session.seriesGroups && session.seriesGroups.length > (session.currentSeriesIndex ?? 0) + 1 && (
          <label className="toggle-label apply-remaining-toggle">
            <input
              type="checkbox"
              checked={applyToRemaining}
              onChange={(e) => setApplyToRemaining(e.target.checked)}
              disabled={isApproving || !selectedSeriesId}
            />
            <span>
              Apply this series to remaining ({session.seriesGroups.length - (session.currentSeriesIndex ?? 0) - 1} groups)
            </span>
          </label>
        )}
      </div>
      {/* Hints for enabled options */}
      {(useDifferentForIssues || applyToRemaining) && (
        <div className="selection-hints">
          {useDifferentForIssues && (
            <p className="toggle-hint">
              Select one series for metadata (name, publisher, characters) and another for matching issues.
              Useful when TPB/Omnibus series have less metadata than the main issue run.
            </p>
          )}
          {applyToRemaining && (
            <p className="toggle-hint">
              Apply the currently selected series to all remaining series groups. Use this when you know all files belong to the same series.
            </p>
          )}
        </div>
      )}

      <div className="search-results">
        {currentGroup.status === 'searching' ? (
          <div className="loading-results">
            <div className="spinner-small" />
            <span>Searching...</span>
          </div>
        ) : currentGroup.searchResults.length === 0 ? (
          <div className="no-results">
            <p>No series found. Try a different search term.</p>
          </div>
        ) : (
          <div className="results-list">
            {/* Header row when in dual selection mode */}
            {useDifferentForIssues && (
              <div className="results-header">
                <span className="header-spacer" />
                <span className="header-series-info">Series Info</span>
                <span className="header-issue-match">Issue Match</span>
                <span className="header-spacer-right" />
              </div>
            )}
            {currentGroup.searchResults.map((series: SeriesMatch) => {
              const isSelectedForInfo = selectedSeriesId === series.sourceId;
              const isSelectedForIssues = useDifferentForIssues
                ? issueMatchingSeriesId === series.sourceId
                : isSelectedForInfo;

              // Helper to shorten common Metron series types
              const getFormatLabel = (type: string): string => {
                if (type.includes('Ongoing')) return 'Ongoing';
                if (type.includes('Limited')) return 'Limited';
                if (type.includes('Trade Paperback')) return 'TPB';
                if (type.includes('One-Shot')) return '1-Shot';
                if (type.includes('Hardcover')) return 'HC';
                if (type.includes('Annual')) return 'Annual';
                return type;
              };

              // Check if series has rich data to show indicator
              const hasRichData = !!(
                series.characters?.length ||
                series.creators?.length ||
                series.description ||
                series.shortDescription
              );

              return (
                <div
                  key={`${series.source}-${series.sourceId}`}
                  className={`series-result ${isSelectedForInfo || isSelectedForIssues ? 'selected' : ''} ${useDifferentForIssues ? 'dual-mode' : ''}`}
                  onClick={() => {
                    if (isApproving) return;
                    if (!useDifferentForIssues) {
                      setSelectedSeriesId(series.sourceId);
                    }
                  }}
                >
                  <div className="series-result-main">
                    {useDifferentForIssues ? (
                      <>
                        <div className="result-checkboxes">
                          <label
                            className={`checkbox-label series-info-check ${isSelectedForInfo ? 'checked' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="radio"
                              name="series-info"
                              checked={isSelectedForInfo}
                              onChange={() => setSelectedSeriesId(series.sourceId)}
                              disabled={isApproving}
                            />
                            <span className="checkbox-text">Info</span>
                          </label>
                          <label
                            className={`checkbox-label issue-match-check ${isSelectedForIssues ? 'checked' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="radio"
                              name="issue-match"
                              checked={isSelectedForIssues}
                              onChange={() => setIssueMatchingSeriesId(series.sourceId)}
                              disabled={isApproving}
                            />
                            <span className="checkbox-text">Issues</span>
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="result-radio">
                        <input
                          type="radio"
                          name="series"
                          checked={isSelectedForInfo}
                          onChange={() => setSelectedSeriesId(series.sourceId)}
                          disabled={isApproving}
                        />
                      </div>
                    )}
                    <div className="result-info">
                      <div className="result-name">
                        {series.name}
                        {series.startYear && (
                          <span className="result-years">
                            ({series.startYear}
                            {series.endYear && series.endYear !== series.startYear
                              ? `-${series.endYear}`
                              : ''}
                            )
                          </span>
                        )}
                      </div>
                      <div className="result-details">
                        {series.publisher && (
                          <span className="detail publisher">{series.publisher}</span>
                        )}
                        {series.seriesType && (
                          <span className="detail format-badge">
                            {getFormatLabel(series.seriesType)}
                          </span>
                        )}
                        {series.issueCount && (
                          <span className="detail issue-count">
                            {series.issueCount} issues
                          </span>
                        )}
                        <span className="detail source">{series.source}</span>
                      </div>
                    </div>
                    <div className={`result-confidence ${getConfidenceClass(series.confidence)}`}>
                      {formatConfidence(series.confidence)}
                    </div>
                    <div className="result-actions">
                      {/* Details button */}
                      <button
                        className={`details-toggle ${hasRichData ? 'has-data' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerSeries(series);
                        }}
                        title="View series details"
                      >
                        <span className="details-icon">i</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More button for pagination */}
            {currentGroup.searchPagination?.hasMore && (
              <div className="load-more-container">
                <button
                  className="btn-secondary load-more-btn"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore || isSearching || isApproving}
                >
                  {isLoadingMore ? (
                    <>
                      <span className="spinner-tiny" />
                      Loading...
                    </>
                  ) : (
                    <>Load More ({currentGroup.searchPagination.total - currentGroup.searchResults.length} remaining)</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection summary when in dual mode */}
      {useDifferentForIssues && (selectedSeriesId || issueMatchingSeriesId) && (
        <div className="dual-selection-summary">
          {selectedSeriesId && (
            <div className="selection-item">
              <span className="selection-label">Series Info:</span>
              <span className="selection-value">
                {currentGroup.searchResults.find(s => s.sourceId === selectedSeriesId)?.name || 'Unknown'}
              </span>
            </div>
          )}
          {issueMatchingSeriesId && (
            <div className="selection-item">
              <span className="selection-label">Issue Matching:</span>
              <span className="selection-value">
                {currentGroup.searchResults.find(s => s.sourceId === issueMatchingSeriesId)?.name || 'Unknown'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="series-approval-footer">
        <button
          className="btn-ghost"
          onClick={handleSkip}
          disabled={isApproving}
        >
          Skip Series
        </button>
        <button
          className="btn-primary"
          onClick={handleApprove}
          disabled={!selectedSeriesId || (useDifferentForIssues && !issueMatchingSeriesId) || isApproving}
        >
          {isApproving ? 'Processing...' : 'Approve & Continue'}
        </button>
      </div>

      {/* Series Detail Drawer */}
      <SeriesDetailDrawer
        series={drawerSeries}
        isOpen={drawerSeries !== null}
        onClose={() => setDrawerSeries(null)}
        onSelect={(series) => {
          setSelectedSeriesId(series.sourceId);
          setDrawerSeries(null);
        }}
        isSelected={drawerSeries?.sourceId === selectedSeriesId}
      />

      {/* Merged Metadata Modal - shows comparison when expanding */}
      {expandedResult && (
        <MergedMetadataModal
          isOpen={isExpandModalOpen}
          onClose={() => {
            setIsExpandModalOpen(false);
            setExpandedResult(null);
          }}
          onAccept={handleAcceptMerged}
          sourceResults={expandedResult.sourceResults}
          mergedPreview={expandedResult.merged}
          isLoading={false}
        />
      )}

      {/* Matched Files Modal - shows all files in current series group */}
      <MatchedFilesModal
        isOpen={isMatchedFilesModalOpen}
        onClose={() => setIsMatchedFilesModalOpen(false)}
        seriesName={currentGroup?.displayName ?? 'Unknown Series'}
        filenames={currentGroup?.filenames ?? []}
      />
    </div>
  );
}

export default SeriesApprovalStep;
