/**
 * SeriesGrid Component
 *
 * Grid view of series with covers, progress indicators, and filtering.
 * Part of the Series-Centric Architecture UI.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSeriesList,
  getSeriesIssues,
  markAsCompleted,
  markAsIncomplete,
  Series,
  SeriesListOptions,
  SeriesForMerge,
} from '../../services/api.service';
import { SeriesCoverCard, type SeriesMenuItemPreset } from '../SeriesCoverCard';
import { CoverSizeSlider, getCoverWidth } from '../CoverSizeSlider';
import { SeriesSelectModal } from '../SeriesSelectModal';
import { MergeSeriesModal } from '../MergeSeriesModal';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import './SeriesGrid.css';

interface SeriesGridProps {
  options?: SeriesListOptions;
  onSeriesSelect?: (seriesId: string) => void;
}

export function SeriesGrid({ options = {}, onSeriesSelect }: SeriesGridProps) {
  const navigate = useNavigate();
  const { startJob } = useMetadataJob();
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceSeries, setMergeSourceSeries] = useState<Series | null>(null);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Cover size state (1-10 scale) - persisted in localStorage
  const [coverSize, setCoverSize] = useState(() => {
    const saved = localStorage.getItem('helixio-cover-size');
    return saved ? parseInt(saved, 10) : 5;
  });

  // Persist cover size changes
  const handleCoverSizeChange = useCallback((size: number) => {
    setCoverSize(size);
    localStorage.setItem('helixio-cover-size', String(size));
  }, []);

  // Fetch series
  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getSeriesList({
        ...options,
        page,
        limit: options.limit ?? 50,
      });

      setSeries(result.series);
      setTotalPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [options, page]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Reset page when options change
  useEffect(() => {
    setPage(1);
  }, [options.search, options.publisher, options.type, options.genres, options.hasUnread]);

  const handleSeriesClick = useCallback((seriesId: string) => {
    if (onSeriesSelect) {
      onSeriesSelect(seriesId);
    } else {
      navigate(`/series/${seriesId}`);
    }
  }, [navigate, onSeriesSelect]);

  // Handle context menu actions
  const handleMenuAction = useCallback(async (action: SeriesMenuItemPreset | string, seriesId: string) => {
    switch (action) {
      case 'view':
        handleSeriesClick(seriesId);
        break;

      case 'fetchMetadata':
        // Get all issue IDs for this series and start metadata job
        try {
          setOperationMessage('Loading series issues...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          const fileIds = result.issues.map((issue) => issue.id);
          if (fileIds.length > 0) {
            startJob(fileIds);
            setOperationMessage(null);
          } else {
            setOperationMessage('No issues found in this series');
            setTimeout(() => setOperationMessage(null), 2000);
          }
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to fetch issues'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllRead':
        try {
          setOperationMessage('Marking all issues as read...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          await Promise.all(result.issues.map((issue) => markAsCompleted(issue.id)));
          setOperationMessage('All issues marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllUnread':
        try {
          setOperationMessage('Marking all issues as unread...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          await Promise.all(result.issues.map((issue) => markAsIncomplete(issue.id)));
          setOperationMessage('All issues marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'mergeWith':
        // Find the series to use as source
        const sourceSeries = series.find((s) => s.id === seriesId);
        if (sourceSeries) {
          setMergeSourceSeries(sourceSeries);
          setShowSeriesSelectModal(true);
        }
        break;
    }
  }, [handleSeriesClick, startJob, fetchSeries, series]);

  // Helper to convert Series to SeriesForMerge
  const seriesToMergeFormat = useCallback((s: Series): SeriesForMerge => ({
    id: s.id,
    name: s.name,
    publisher: s.publisher,
    startYear: s.startYear,
    endYear: s.endYear,
    issueCount: s.issueCount,
    ownedIssueCount: s._count?.issues ?? 0,
    comicVineId: s.comicVineId,
    metronId: s.metronId,
    coverUrl: s.coverUrl,
    coverHash: s.coverHash,
    coverFileId: s.coverFileId,
    aliases: s.aliases,
    summary: s.summary,
    type: s.type,
    createdAt: String(s.createdAt ?? new Date().toISOString()),
    updatedAt: String(s.updatedAt ?? new Date().toISOString()),
  }), []);

  // Handle series selection for merge
  const handleSeriesSelectedForMerge = useCallback((selectedSeries: Series[]) => {
    if (!mergeSourceSeries) return;

    // Convert source series to SeriesForMerge format
    const sourceSeriesForMerge = seriesToMergeFormat(mergeSourceSeries);

    // Convert selected series to SeriesForMerge format
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    // Combine source series with selected series
    setSelectedMergeSeries([sourceSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  }, [mergeSourceSeries, seriesToMergeFormat]);

  // Handle merge complete
  const handleMergeComplete = useCallback(() => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    setMergeSourceSeries(null);
    // Refresh the series list
    fetchSeries();
  }, [fetchSeries]);

  return (
    <div className="series-grid-container">
      {/* Loading State */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          Loading series...
        </div>
      )}

      {/* Error State */}
      {error && <div className="error-message">{error}</div>}

      {/* Empty State */}
      {!loading && series.length === 0 && (
        <div className="empty-state">
          <h2>No Series Found</h2>
          <p>
            {options.search
              ? `No series matching "${options.search}"`
              : 'No series in your library yet. Scan a library to discover series.'}
          </p>
        </div>
      )}

      {/* Series Grid */}
      {series.length > 0 && (
        <>
          <div className="series-grid-header">
            <span className="series-count">{total} series</span>
            <CoverSizeSlider value={coverSize} onChange={handleCoverSizeChange} />
          </div>

          {/* Operation message */}
          {operationMessage && (
            <div className="series-operation-message">
              {operationMessage}
            </div>
          )}

          <div
            className="series-grid"
            style={{ '--cover-size': `${getCoverWidth(coverSize)}px` } as React.CSSProperties}
          >
            {series.map((s, index) => (
              <SeriesCoverCard
                key={s.id}
                series={s}
                size="medium"
                showYear={true}
                showPublisher={true}
                onClick={handleSeriesClick}
                onMenuAction={handleMenuAction}
                contextMenuEnabled={true}
                animationIndex={index}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="series-grid-pagination">
              <button
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Series Select Modal for Merge */}
      <SeriesSelectModal
        isOpen={showSeriesSelectModal}
        onClose={() => {
          setShowSeriesSelectModal(false);
          setMergeSourceSeries(null);
        }}
        onSelect={handleSeriesSelectedForMerge}
        excludeIds={mergeSourceSeries ? [mergeSourceSeries.id] : []}
        title="Select Series to Merge"
        multiSelect={true}
      />

      {/* Merge Series Modal */}
      {showMergeModal && selectedMergeSeries.length > 0 && (
        <MergeSeriesModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedMergeSeries([]);
            setMergeSourceSeries(null);
          }}
          onMergeComplete={handleMergeComplete}
          initialSeries={selectedMergeSeries}
          initialTargetId={mergeSourceSeries?.id}
        />
      )}

    </div>
  );
}
