/**
 * CommunityRatingsModal Component
 *
 * Modal displaying external community and critic ratings.
 * Shows ratings from various sources (ComicBookRoundup, etc.) with sync functionality.
 * Supports both series-level and issue-level ratings.
 */

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  useSeriesExternalRatings,
  useSyncSeriesRatings,
  useIssueExternalRatings,
  useSyncIssueRatings,
  useSyncSeriesIssueRatings,
  useSyncJobStatus,
  useCancelSyncJob,
  useValidateCbrUrl,
  useSaveManualCbrMatch,
  useResetCbrMatch,
  type ExternalRatingDisplay,
  type CBRMatchPreview,
} from '../../hooks/queries/useExternalRatings';
import { toStarRating, formatStarRating } from '../../utils/ratings';
import { RatingStars } from '../RatingStars';
import { RatingBadge } from '../RatingBadge';
import './CommunityRatingsModal.css';

// =============================================================================
// Types
// =============================================================================

export interface CommunityRatingsModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Series ID to show ratings for (mutually exclusive with fileId) */
  seriesId?: string;
  /** File/Issue ID to show ratings for (mutually exclusive with seriesId) */
  fileId?: string;
  /** Series name for display (used with seriesId) */
  seriesName?: string;
  /** Issue name for display (used with fileId) */
  issueName?: string;
  /** Number of issues in the series (for fetch warning threshold) */
  issueCount?: number;
  /** Callback when modal is closed */
  onClose: () => void;
}

// =============================================================================
// Helper Components
// =============================================================================

interface RatingRowProps {
  rating: ExternalRatingDisplay;
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'comicbookroundup':
      return 'CBR';
    case 'leagueofcomicgeeks':
      return 'LOCG';
    case 'comicvine':
      return 'CV';
    case 'metron':
      return 'M';
    case 'anilist':
      return 'AL';
    default:
      return source.substring(0, 2).toUpperCase();
  }
}

function formatLastSynced(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Compute averages from a list of ratings (used for issue ratings which don't have pre-computed averages)
 */
function computeAverages(ratings: ExternalRatingDisplay[]): {
  community: { average: number | null; count: number };
  critic: { average: number | null; count: number };
} {
  const communityRatings = ratings.filter((r) => r.ratingType === 'community');
  const criticRatings = ratings.filter((r) => r.ratingType === 'critic');

  const computeAvg = (arr: ExternalRatingDisplay[]) => {
    if (arr.length === 0) return { average: null, count: 0 };
    const sum = arr.reduce((acc, r) => acc + r.value, 0);
    return { average: sum / arr.length, count: arr.length };
  };

  return {
    community: computeAvg(communityRatings),
    critic: computeAvg(criticRatings),
  };
}

function RatingRow({ rating }: RatingRowProps) {
  return (
    <div className={`ratings-modal__rating-row ${rating.isStale ? 'stale' : ''}`}>
      <div className="ratings-modal__source">
        <span className="ratings-modal__source-icon">{getSourceIcon(rating.source)}</span>
        <span className="ratings-modal__source-name">{rating.sourceDisplayName}</span>
        {rating.sourceUrl && (
          <a
            href={rating.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ratings-modal__source-link"
            title={`View on ${rating.sourceDisplayName}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        )}
        <span className={`ratings-modal__type-badge ${rating.ratingType}`}>
          {rating.ratingType === 'critic' ? 'Critic' : 'User'}
        </span>
      </div>
      <div className="ratings-modal__value">
        <RatingBadge value={rating.value} size="small" />
        <div className="ratings-modal__stars">
          <RatingStars value={toStarRating(rating.value)} readonly size="small" showEmpty />
        </div>
        <span className="ratings-modal__number">{formatStarRating(rating.value)}/5</span>
        {rating.voteCount !== undefined && rating.voteCount > 0 && (
          <span className="ratings-modal__vote-count">
            ({rating.voteCount.toLocaleString()})
          </span>
        )}
      </div>
      <div className="ratings-modal__meta">
        <span
          className="ratings-modal__last-synced"
          title={`Last synced: ${new Date(rating.lastSyncedAt).toLocaleString()}`}
        >
          {formatLastSynced(rating.lastSyncedAt)}
        </span>
        {rating.isStale && (
          <span className="ratings-modal__stale-indicator" title="Rating data may be outdated">
            Stale
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CommunityRatingsModal({
  isOpen,
  seriesId,
  fileId,
  seriesName,
  issueName,
  issueCount,
  onClose,
}: CommunityRatingsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // State for issue ratings job
  const [issueJobId, setIssueJobId] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // State for manual CBR match
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [matchPreview, setMatchPreview] = useState<CBRMatchPreview | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Determine mode and display name
  const isSeriesMode = !!seriesId;
  const displayName = isSeriesMode ? seriesName : issueName;

  // Use the appropriate hooks based on mode
  const seriesQuery = useSeriesExternalRatings(seriesId);
  const issueQuery = useIssueExternalRatings(fileId);
  const seriesSyncMutation = useSyncSeriesRatings();
  const issueSyncMutation = useSyncIssueRatings();

  // Hooks for issue ratings sync
  const syncIssuesMutation = useSyncSeriesIssueRatings();
  const cancelJobMutation = useCancelSyncJob();

  // Hooks for manual CBR match
  const validateUrlMutation = useValidateCbrUrl();
  const saveMatchMutation = useSaveManualCbrMatch();
  const resetMatchMutation = useResetCbrMatch();

  // Poll job status every 3 seconds when active
  const { data: jobStatus } = useSyncJobStatus(issueJobId || undefined, {
    refetchInterval: issueJobId ? 3000 : undefined,
  });

  // Select the active query and mutation based on mode
  const activeQuery = isSeriesMode ? seriesQuery : issueQuery;
  const { data: rawData, isLoading, isError, error } = activeQuery;
  const syncMutation = isSeriesMode ? seriesSyncMutation : issueSyncMutation;

  // Normalize the data - compute averages for issue ratings
  const data = useMemo(() => {
    if (!rawData) return null;

    // Series data already has averages
    if (isSeriesMode && 'averages' in rawData) {
      return rawData as {
        ratings: ExternalRatingDisplay[];
        averages: { community: { average: number | null; count: number }; critic: { average: number | null; count: number } };
      };
    }

    // Issue data needs computed averages
    const ratings = 'ratings' in rawData ? rawData.ratings : [];
    return {
      ratings,
      averages: computeAverages(ratings),
    };
  }, [rawData, isSeriesMode]);

  // Check if ComicBookRoundup is matched for this series
  const hasCbrMatch = useMemo(() => {
    if (!data?.ratings) return false;
    return data.ratings.some((r) => r.source === 'comicbookroundup');
  }, [data]);

  // Get CBR rating info for match status display
  const cbrRatingInfo = useMemo(() => {
    if (!data?.ratings) return null;
    const cbrRating = data.ratings.find((r) => r.source === 'comicbookroundup');
    if (!cbrRating?.sourceUrl) return null;

    // Extract sourceId from URL
    const match = cbrRating.sourceUrl.match(/\/reviews\/(.+)$/);
    const sourceId = match?.[1] || null;

    return {
      sourceUrl: cbrRating.sourceUrl,
      sourceId,
      matchMethod: undefined as string | undefined, // Could be fetched from backend if needed
    };
  }, [data]);

  // Job is active if status is pending or processing
  const isJobActive = jobStatus && ['pending', 'processing'].includes(jobStatus.status);

  // Refresh ratings when job completes
  useEffect(() => {
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      activeQuery.refetch();
      // Clear job ID after a delay so user can see completion state
      const timer = setTimeout(() => setIssueJobId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [jobStatus?.status, activeQuery]);

  // Handle starting the fetch issue ratings job
  const handleFetchIssueRatings = useCallback(() => {
    // Show warning for series with many issues (threshold: 20)
    if (issueCount && issueCount > 20 && !showConfirmation) {
      setShowConfirmation(true);
      return;
    }

    if (seriesId) {
      syncIssuesMutation.mutate(
        { seriesId, forceRefresh: true },
        {
          onSuccess: (result) => {
            setIssueJobId(result.jobId);
            setShowConfirmation(false);
          },
        }
      );
    }
  }, [seriesId, issueCount, showConfirmation, syncIssuesMutation]);

  // Handle canceling the job
  const handleCancelJob = useCallback(() => {
    if (issueJobId) {
      cancelJobMutation.mutate(issueJobId);
    }
  }, [issueJobId, cancelJobMutation]);

  // Handle validating manual CBR URL
  const handleValidateUrl = useCallback(() => {
    if (!manualUrl.trim()) return;

    validateUrlMutation.mutate(
      { url: manualUrl },
      {
        onSuccess: (result) => {
          if (result.valid && result.preview) {
            setMatchPreview(result.preview);
          } else {
            setMatchPreview(null);
          }
        },
        onError: () => {
          setMatchPreview(null);
        },
      }
    );
  }, [manualUrl, validateUrlMutation]);

  // Handle applying manual CBR match
  const handleApplyMatch = useCallback(() => {
    if (!seriesId || !manualUrl.trim()) return;

    saveMatchMutation.mutate(
      { seriesId, url: manualUrl },
      {
        onSuccess: () => {
          setShowManualMatch(false);
          setManualUrl('');
          setMatchPreview(null);
          activeQuery.refetch();
        },
      }
    );
  }, [seriesId, manualUrl, saveMatchMutation, activeQuery]);

  // Handle resetting CBR match
  const handleResetMatch = useCallback(
    (reSearch: boolean) => {
      if (!seriesId) return;

      resetMatchMutation.mutate(
        { seriesId, reSearch },
        {
          onSuccess: () => {
            setShowResetDialog(false);
            activeQuery.refetch();
          },
        }
      );
    },
    [seriesId, resetMatchMutation, activeQuery]
  );

  // Cancel manual match UI
  const handleCancelManualMatch = useCallback(() => {
    setShowManualMatch(false);
    setManualUrl('');
    setMatchPreview(null);
    validateUrlMutation.reset();
  }, [validateUrlMutation]);

  // Focus management
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSync = () => {
    if (isSeriesMode && seriesId) {
      seriesSyncMutation.mutate({
        seriesId,
        forceRefresh: true,
      });
    } else if (fileId) {
      issueSyncMutation.mutate({
        fileId,
        forceRefresh: true,
      });
    }
  };

  if (!isOpen) return null;

  // Group ratings by type
  const criticRatings = data?.ratings.filter((r) => r.ratingType === 'critic') || [];
  const communityRatings = data?.ratings.filter((r) => r.ratingType === 'community') || [];
  const hasRatings = (data?.ratings.length || 0) > 0;

  const modal = (
    <div className="ratings-modal__overlay" onClick={handleBackdropClick}>
      <div
        className="ratings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ratings-modal-title"
      >
        {/* Header */}
        <div className="ratings-modal__header">
          <div className="ratings-modal__header-content">
            <h2 id="ratings-modal-title">Community Ratings</h2>
            {displayName && <span className="ratings-modal__series-name">{displayName}</span>}

            {/* CBR Match Status - only in series mode */}
            {isSeriesMode && (
              <div className={`ratings-modal__match-status ${hasCbrMatch ? 'matched' : 'no-match'}`}>
                <span className="ratings-modal__match-label">CBR:</span>
                {hasCbrMatch && cbrRatingInfo ? (
                  <>
                    <a
                      href={cbrRatingInfo.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ratings-modal__match-link"
                      title={cbrRatingInfo.sourceId || 'View on ComicBookRoundup'}
                    >
                      {cbrRatingInfo.sourceId || 'Matched'}
                    </a>
                    <button
                      type="button"
                      className="ratings-modal__edit-match-btn"
                      onClick={() => setShowManualMatch(true)}
                      title="Edit match"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ratings-modal__reset-match-btn"
                      onClick={() => setShowResetDialog(true)}
                      title="Reset match"
                    >
                      Reset
                    </button>
                  </>
                ) : (
                  <>
                    <span className="ratings-modal__no-match-text">No match</span>
                    <button
                      type="button"
                      className="ratings-modal__manual-match-btn"
                      onClick={() => setShowManualMatch(true)}
                    >
                      Match manually
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="ratings-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="ratings-modal__body">
          {isLoading && (
            <div className="ratings-modal__loading">
              <span className="ratings-modal__spinner" />
              Loading ratings...
            </div>
          )}

          {isError && (
            <div className="ratings-modal__error">
              Failed to load ratings: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {!isLoading && !hasRatings && !isError && (
            <div className="ratings-modal__empty">
              <p>No external ratings found for this {isSeriesMode ? 'series' : 'issue'}.</p>
              <p className="ratings-modal__empty-hint">
                Click the button below to search for ratings from external sources.
              </p>
            </div>
          )}

          {/* Manual Match Section - only in series mode */}
          {isSeriesMode && showManualMatch && (
            <div className="ratings-modal__manual-match-section">
              <h3 className="ratings-modal__manual-match-title">Manual CBR Match</h3>
              <p className="ratings-modal__manual-match-hint">
                Paste a ComicBookRoundup series page URL to manually match this series.
              </p>

              <div className="ratings-modal__manual-input-row">
                <input
                  type="text"
                  className="ratings-modal__manual-input"
                  placeholder="https://comicbookroundup.com/comic-books/reviews/..."
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  disabled={validateUrlMutation.isPending || saveMatchMutation.isPending}
                />
                <button
                  type="button"
                  className="ratings-modal__validate-btn"
                  onClick={handleValidateUrl}
                  disabled={!manualUrl.trim() || validateUrlMutation.isPending || saveMatchMutation.isPending}
                >
                  {validateUrlMutation.isPending ? 'Validating...' : 'Validate'}
                </button>
              </div>

              {/* Validation Error */}
              {validateUrlMutation.data && !validateUrlMutation.data.valid && (
                <div className="ratings-modal__validation-error">
                  {validateUrlMutation.data.error || 'Validation failed'}
                </div>
              )}

              {/* Preview */}
              {matchPreview && (
                <div className="ratings-modal__match-preview">
                  <h4 className="ratings-modal__preview-title">Preview</h4>
                  <div className="ratings-modal__preview-grid">
                    <div className="ratings-modal__preview-row">
                      <span className="ratings-modal__preview-label">Series:</span>
                      <span className="ratings-modal__preview-value">{matchPreview.seriesName}</span>
                    </div>
                    <div className="ratings-modal__preview-row">
                      <span className="ratings-modal__preview-label">Publisher:</span>
                      <span className="ratings-modal__preview-value">{matchPreview.publisher}</span>
                    </div>
                    {matchPreview.criticRating && (
                      <div className="ratings-modal__preview-row">
                        <span className="ratings-modal__preview-label">Critic Rating:</span>
                        <span className="ratings-modal__preview-value">
                          <RatingBadge value={matchPreview.criticRating.value} size="small" />
                          <span className="ratings-modal__preview-count">({matchPreview.criticRating.count} reviews)</span>
                        </span>
                      </div>
                    )}
                    {matchPreview.communityRating && (
                      <div className="ratings-modal__preview-row">
                        <span className="ratings-modal__preview-label">User Rating:</span>
                        <span className="ratings-modal__preview-value">
                          <RatingBadge value={matchPreview.communityRating.value} size="small" />
                          <span className="ratings-modal__preview-count">({matchPreview.communityRating.count} votes)</span>
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ratings-modal__apply-match-btn"
                    onClick={handleApplyMatch}
                    disabled={saveMatchMutation.isPending}
                  >
                    {saveMatchMutation.isPending ? 'Applying...' : 'Apply Match'}
                  </button>
                </div>
              )}

              <button
                type="button"
                className="ratings-modal__cancel-manual-btn"
                onClick={handleCancelManualMatch}
                disabled={saveMatchMutation.isPending}
              >
                Cancel
              </button>
            </div>
          )}

          {!isLoading && hasRatings && (
            <>
              {/* Critic Ratings Section */}
              {criticRatings.length > 0 && (
                <div className="ratings-modal__section">
                  <h3 className="ratings-modal__section-title">Critic Reviews</h3>
                  <div className="ratings-modal__list">
                    {criticRatings.map((rating) => (
                      <RatingRow
                        key={`${rating.source}-${rating.ratingType}`}
                        rating={rating}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Community Ratings Section */}
              {communityRatings.length > 0 && (
                <div className="ratings-modal__section">
                  <h3 className="ratings-modal__section-title">User Ratings</h3>
                  <div className="ratings-modal__list">
                    {communityRatings.map((rating) => (
                      <RatingRow
                        key={`${rating.source}-${rating.ratingType}`}
                        rating={rating}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Averages */}
              {data &&
                (data.averages.critic.average !== null ||
                  data.averages.community.average !== null) && (
                  <div className="ratings-modal__averages">
                    {data.averages.critic.average !== null && (
                      <div className="ratings-modal__average-item">
                        <span className="ratings-modal__average-label">Avg. Critic</span>
                        <RatingBadge value={data.averages.critic.average} />
                        <span className="ratings-modal__average-count">
                          ({data.averages.critic.count} source
                          {data.averages.critic.count !== 1 ? 's' : ''})
                        </span>
                      </div>
                    )}
                    {data.averages.community.average !== null && (
                      <div className="ratings-modal__average-item">
                        <span className="ratings-modal__average-label">Avg. User</span>
                        <RatingBadge value={data.averages.community.average} />
                        <span className="ratings-modal__average-count">
                          ({data.averages.community.count} source
                          {data.averages.community.count !== 1 ? 's' : ''})
                        </span>
                      </div>
                    )}
                  </div>
                )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ratings-modal__footer">
          <div className="ratings-modal__footer-actions">
            <button
              type="button"
              className="ratings-modal__sync-btn"
              onClick={handleSync}
              disabled={syncMutation.isPending || isJobActive}
            >
              {syncMutation.isPending
                ? 'Syncing...'
                : hasRatings
                  ? 'Refresh Ratings'
                  : 'Search for Ratings'}
            </button>

            {/* Fetch Issue Ratings - only in series mode when CBR matched */}
            {isSeriesMode && hasCbrMatch && !isJobActive && !showConfirmation && (
              <button
                type="button"
                className="ratings-modal__fetch-issues-btn"
                onClick={handleFetchIssueRatings}
                disabled={syncIssuesMutation.isPending}
              >
                {syncIssuesMutation.isPending ? 'Starting...' : 'Fetch Issue Ratings'}
              </button>
            )}
          </div>

          {/* Confirmation dialog for large series */}
          {showConfirmation && (
            <div className="ratings-modal__confirmation">
              <span className="ratings-modal__confirmation-text">
                This series has {issueCount} issues. Fetching ratings may take several minutes.
              </span>
              <div className="ratings-modal__confirmation-actions">
                <button
                  type="button"
                  className="ratings-modal__confirm-btn"
                  onClick={handleFetchIssueRatings}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="ratings-modal__cancel-btn"
                  onClick={() => setShowConfirmation(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Reset CBR match dialog */}
          {showResetDialog && (
            <div className="ratings-modal__confirmation ratings-modal__reset-dialog">
              <span className="ratings-modal__confirmation-text">
                Reset CBR match for this series?
              </span>
              <div className="ratings-modal__confirmation-actions">
                <button
                  type="button"
                  className="ratings-modal__confirm-btn"
                  onClick={() => handleResetMatch(false)}
                  disabled={resetMatchMutation.isPending}
                >
                  {resetMatchMutation.isPending ? 'Clearing...' : 'Clear Only'}
                </button>
                <button
                  type="button"
                  className="ratings-modal__confirm-btn ratings-modal__research-btn"
                  onClick={() => handleResetMatch(true)}
                  disabled={resetMatchMutation.isPending}
                >
                  {resetMatchMutation.isPending ? 'Searching...' : 'Clear & Re-search'}
                </button>
                <button
                  type="button"
                  className="ratings-modal__cancel-btn"
                  onClick={() => setShowResetDialog(false)}
                  disabled={resetMatchMutation.isPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Progress indicator when job is running */}
          {isJobActive && jobStatus && (
            <div className="ratings-modal__job-progress">
              <div className="ratings-modal__progress-info">
                <span className="ratings-modal__progress-text">
                  Fetching issue ratings: {jobStatus.processedItems}/{jobStatus.totalItems}
                </span>
                <span className="ratings-modal__progress-detail">
                  ({jobStatus.successItems} found, {jobStatus.unmatchedItems} unavailable)
                </span>
              </div>
              <div className="ratings-modal__progress-bar">
                <div
                  className="ratings-modal__progress-fill"
                  style={{
                    width: `${jobStatus.totalItems > 0 ? (jobStatus.processedItems / jobStatus.totalItems) * 100 : 0}%`,
                  }}
                />
              </div>
              <button
                type="button"
                className="ratings-modal__cancel-job-btn"
                onClick={handleCancelJob}
                disabled={cancelJobMutation.isPending}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Status messages */}
          <div className="ratings-modal__footer-status">
            {syncMutation.isSuccess && !isJobActive && !jobStatus && (
              <span className="ratings-modal__sync-success">Updated!</span>
            )}
            {syncMutation.isError && (
              <span className="ratings-modal__sync-error">
                Sync failed:{' '}
                {syncMutation.error instanceof Error ? syncMutation.error.message : 'Unknown error'}
              </span>
            )}
            {jobStatus?.status === 'completed' && (
              <span className="ratings-modal__job-success">
                Fetched ratings for {jobStatus.successItems} issues!
              </span>
            )}
            {jobStatus?.status === 'failed' && (
              <span className="ratings-modal__job-error">
                Job failed: {jobStatus.errors?.[0] || 'Unknown error'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default CommunityRatingsModal;
