/**
 * SeriesGrid Component
 *
 * Grid view of series with covers, progress indicators, and filtering.
 * Part of the Series-Centric Architecture UI.
 *
 * Performance optimizations:
 * - Virtualized grid rendering (only renders visible items)
 * - Scroll state detection (disables animations during rapid scroll)
 * - CSS containment on individual cards
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { CoverSizeSlider } from '../CoverSizeSlider';
import { SeriesSelectModal } from '../SeriesSelectModal';
import { MergeSeriesModal } from '../MergeSeriesModal';
import { NavigationSidebar } from '../NavigationSidebar';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import './SeriesGrid.css';

interface SeriesGridProps {
  options?: SeriesListOptions;
  onSeriesSelect?: (seriesId: string) => void;
}

// =============================================================================
// SeriesGridContent - Virtualized grid rendering with scroll optimization
// =============================================================================

interface SeriesGridContentProps {
  series: Series[];
  total: number;
  coverSize: number;
  onCoverSizeChange: (size: number) => void;
  operationMessage: string | null;
  onSeriesClick: (seriesId: string) => void;
  onMenuAction: (action: SeriesMenuItemPreset | string, seriesId: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function SeriesGridContent({
  series,
  total,
  coverSize,
  onCoverSizeChange,
  operationMessage,
  onSeriesClick,
  onMenuAction,
  sortBy = 'name',
  sortOrder = 'asc',
}: SeriesGridContentProps) {
  const gap = 16;

  // Virtualization with dynamic sizing that maximizes cover space
  // Uses sliderValue to calculate optimal columns and item width based on container width
  const { virtualItems, totalHeight, containerRef, isScrolling, scrollTo, visibleRange } = useVirtualGrid(series, {
    sliderValue: coverSize,
    gap,
    overscan: 3, // Render 3 extra rows for smooth scrolling
    aspectRatio: 1.5,
    infoHeight: 60,
    minCoverWidth: 80,
    maxCoverWidth: 350,
  });

  // Create value extractor for navigation sidebar based on sort field
  const getItemValue = useMemo(() => {
    return (item: Series) => {
      switch (sortBy) {
        case 'name':
          return item.name;
        case 'publisher':
          return item.publisher;
        case 'startYear':
          return item.startYear;
        case 'updatedAt':
          return item.updatedAt;
        case 'createdAt':
          return item.createdAt;
        case 'issueCount':
          return item._count?.issues ?? item.issueCount;
        default:
          return item.name;
      }
    };
  }, [sortBy]);

  return (
    <>
      <div className="series-grid-header">
        <span className="series-count">{total} series</span>
        <CoverSizeSlider value={coverSize} onChange={onCoverSizeChange} />
      </div>

      {/* Operation message */}
      {operationMessage && (
        <div className="series-operation-message">
          {operationMessage}
        </div>
      )}

      {/* Grid content wrapper with sidebar */}
      <div className="series-grid-content-wrapper">
        {/* Virtualized Series Grid */}
        <div
          ref={containerRef}
          className={`series-grid-scroll-container ${isScrolling ? 'scrolling' : ''}`}
        >
          <div
            className="series-grid-virtual"
            style={{ height: totalHeight, position: 'relative' }}
          >
            {virtualItems.map(({ item, style }) => (
              <div key={item.id} style={style} className="series-grid-item">
                <SeriesCoverCard
                  series={item}
                  size="medium"
                  showYear={true}
                  showPublisher={true}
                  onClick={onSeriesClick}
                  onMenuAction={onMenuAction}
                  contextMenuEnabled={true}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Sidebar - positioned fixed to right edge */}
        <NavigationSidebar
          items={series}
          sortField={sortBy}
          sortOrder={sortOrder}
          onNavigate={scrollTo}
          visibleRange={visibleRange}
          getItemValue={getItemValue}
        />
      </div>
    </>
  );
}

// =============================================================================
// Main SeriesGrid Component
// =============================================================================

export function SeriesGrid({ options = {}, onSeriesSelect }: SeriesGridProps) {
  const navigate = useNavigate();
  const { startJob } = useMetadataJob();
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Fetch all series (no pagination - infinite scroll with navigation sidebar)
  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getSeriesList({
        ...options,
        all: true,  // Fetch all series for infinite scroll
      });

      setSeries(result.series);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

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
        <SeriesGridContent
          series={series}
          total={total}
          coverSize={coverSize}
          onCoverSizeChange={handleCoverSizeChange}
          operationMessage={operationMessage}
          onSeriesClick={handleSeriesClick}
          onMenuAction={handleMenuAction}
          sortBy={options.sortBy}
          sortOrder={options.sortOrder}
        />
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
