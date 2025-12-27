/**
 * SeriesPage Component
 *
 * Main page for browsing all series in the library.
 * Part of the Series-Centric Architecture UI.
 *
 * Features:
 * - Promoted collections section at the top
 * - Series grid with filters and search
 * - Multi-select with bulk actions
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SeriesGrid } from '../components/SeriesGrid';
import { BulkSeriesActionBar } from '../components/BulkSeriesActionBar';
import { BatchSeriesMetadataModal } from '../components/BatchSeriesMetadataModal';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import {
  getSeriesPublishers,
  getSeriesGenres,
  getSeriesIssues,
  bulkToggleFavorite,
  bulkToggleWantToRead,
  bulkMarkSeriesRead,
  bulkMarkSeriesUnread,
  SeriesListOptions,
} from '../services/api.service';
import { useApp } from '../contexts/AppContext';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { useToast } from '../contexts/ToastContext';
import './SeriesPage.css';

export function SeriesPage() {
  const {
    libraries,
    selectedLibrary,
    isAllLibraries,
    selectLibrary,
    selectedSeries,
    selectSeries,
    selectSeriesRange,
    clearSeriesSelection,
  } = useApp();
  const { startJob } = useMetadataJob();
  const { addToast } = useToast();

  // Filter state
  const [search, setSearch] = useState('');
  const [publisher, setPublisher] = useState<string>('');
  const [type, setType] = useState<'western' | 'manga' | ''>('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [hasUnread, setHasUnread] = useState<boolean | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SeriesListOptions['sortBy']>('name');

  // Derive libraryId from AppContext for API calls
  const libraryId = isAllLibraries ? '' : (selectedLibrary?.id || '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Available filter values
  const [publishers, setPublishers] = useState<string[]>([]);
  const [_genres, setGenres] = useState<string[]>([]);

  // Modal states for bulk actions
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  // Track all series IDs for range selection
  const allSeriesIdsRef = useRef<string[]>([]);
  // Track last selected series ID locally for stable callback
  const lastSelectedRef = useRef<string | null>(null);

  // Fetch filter options
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pubResult, genreResult] = await Promise.all([
          getSeriesPublishers(),
          getSeriesGenres(),
        ]);
        setPublishers(pubResult.publishers);
        setGenres(genreResult.genres);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    fetchData();
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    clearSeriesSelection();
  }, [search, publisher, type, selectedGenres, hasUnread, libraryId, sortBy, sortOrder, clearSeriesSelection]);

  // Clear selection on unmount
  useEffect(() => {
    return () => {
      clearSeriesSelection();
    };
  }, [clearSeriesSelection]);

  // Handle series selection with shift support
  // Uses refs to avoid re-creating callback on every selection change (performance critical)
  const handleSelectionChange = useCallback((seriesId: string, selected: boolean, shiftKey?: boolean) => {
    if (shiftKey && allSeriesIdsRef.current.length > 0 && lastSelectedRef.current) {
      // Range selection - select all between last selected and current
      selectSeriesRange(allSeriesIdsRef.current, lastSelectedRef.current, seriesId);
    } else {
      selectSeries(seriesId, selected);
    }
    // Update last selected ref for next shift+click
    lastSelectedRef.current = seriesId;
  }, [selectSeries, selectSeriesRange]);

  // Bulk action handlers
  const handleToggleFavorite = useCallback(async (action: 'add' | 'remove') => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkToggleFavorite(Array.from(selectedSeries), action);
      clearSeriesSelection();
      addToast('success', action === 'add'
        ? `Added ${count} series to Favorites`
        : `Removed ${count} series from Favorites`
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      addToast('error', 'Failed to update favorites');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast]);

  const handleToggleWantToRead = useCallback(async (action: 'add' | 'remove') => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkToggleWantToRead(Array.from(selectedSeries), action);
      clearSeriesSelection();
      addToast('success', action === 'add'
        ? `Added ${count} series to Want to Read`
        : `Removed ${count} series from Want to Read`
      );
    } catch (err) {
      console.error('Failed to toggle want to read:', err);
      addToast('error', 'Failed to update Want to Read');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast]);

  const handleMarkRead = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkMarkSeriesRead(Array.from(selectedSeries));
      clearSeriesSelection();
      addToast('success', `Marked all issues in ${count} series as read`);
    } catch (err) {
      console.error('Failed to mark as read:', err);
      addToast('error', 'Failed to mark as read');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast]);

  const handleMarkUnread = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkMarkSeriesUnread(Array.from(selectedSeries));
      clearSeriesSelection();
      addToast('success', `Marked all issues in ${count} series as unread`);
    } catch (err) {
      console.error('Failed to mark as unread:', err);
      addToast('error', 'Failed to mark as unread');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast]);

  const handleFetchMetadata = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      // Get all issues from all selected series
      const allFileIds: string[] = [];
      for (const seriesId of selectedSeries) {
        const result = await getSeriesIssues(seriesId, { limit: 1000 });
        allFileIds.push(...result.issues.map((issue) => issue.id));
      }
      if (allFileIds.length > 0) {
        startJob(allFileIds);
        addToast('info', `Started metadata fetch for ${allFileIds.length} issues from ${count} series`);
      }
      clearSeriesSelection();
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
      addToast('error', 'Failed to start metadata fetch');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, startJob, clearSeriesSelection, addToast]);

  const handleBatchEditComplete = useCallback((updatedCount: number) => {
    clearSeriesSelection();
    addToast('success', `Updated ${updatedCount} series`);
  }, [clearSeriesSelection, addToast]);

  // Build options for SeriesGrid - memoized to prevent unnecessary refetches
  const options: SeriesListOptions = useMemo(() => ({
    sortBy,
    sortOrder,
    ...(search && { search }),
    ...(publisher && { publisher }),
    ...(type && { type }),
    ...(selectedGenres.length > 0 && { genres: selectedGenres }),
    ...(hasUnread !== undefined && { hasUnread }),
    ...(libraryId && { libraryId }),
  }), [sortBy, sortOrder, search, publisher, type, selectedGenres, hasUnread, libraryId]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setPublisher('');
    setType('');
    setSelectedGenres([]);
    setHasUnread(undefined);
    // Select "All Libraries" when clearing filters
    selectLibrary('all');
  };

  const hasActiveFilters = search || publisher || type || selectedGenres.length > 0 || hasUnread !== undefined || libraryId;

  return (
    <div className="series-page">
      <div className="series-page-header">
        <h1>Series</h1>

        {/* Search and Filters */}
        <div className="series-search-filters">
          <div className="series-search">
            <input
              type="text"
              placeholder="Search series..."
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              className="search-input"
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                &times;
              </button>
            )}
          </div>

          <select
            id="sort-select"
            className="filter-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-') as [SeriesListOptions['sortBy'], 'asc' | 'desc'];
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
            }}
            title="Sort by"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="startYear-desc">Year (Newest)</option>
            <option value="startYear-asc">Year (Oldest)</option>
            <option value="updatedAt-desc">Recently Updated</option>
            <option value="issueCount-desc">Most Issues</option>
            <option value="issueCount-asc">Fewest Issues</option>
          </select>

          <select
            id="library-select"
            className="filter-select"
            value={libraryId}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                selectLibrary('all');
              } else {
                const lib = libraries.find(l => l.id === value);
                if (lib) selectLibrary(lib);
              }
            }}
            title="Library"
          >
            <option value="">All Libraries</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>

          <select
            id="publisher-select"
            className="filter-select"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            title="Publisher"
          >
            <option value="">All Publishers</option>
            {publishers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            id="type-select"
            className="filter-select"
            value={type}
            onChange={(e) => setType(e.target.value as 'western' | 'manga' | '')}
            title="Type"
          >
            <option value="">All Types</option>
            <option value="western">Western</option>
            <option value="manga">Manga</option>
          </select>

          <select
            id="unread-select"
            className="filter-select"
            value={hasUnread === undefined ? '' : hasUnread ? 'unread' : 'complete'}
            onChange={(e) => {
              if (e.target.value === '') {
                setHasUnread(undefined);
              } else {
                setHasUnread(e.target.value === 'unread');
              }
            }}
            title="Reading Status"
          >
            <option value="">All Status</option>
            <option value="unread">Has Unread</option>
            <option value="complete">Complete</option>
          </select>

          {hasActiveFilters && (
            <button className="clear-filters-btn" onClick={clearFilters} title="Clear all filters">
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Series Grid (with integrated promoted collections) */}
      <SeriesGrid
        options={options}
        selectable={true}
        selectedSeries={selectedSeries}
        onSelectionChange={handleSelectionChange}
        useUnifiedGrid={true}
      />

      {/* Bulk Action Bar */}
      {selectedSeries.size > 0 && (
        <BulkSeriesActionBar
          selectedCount={selectedSeries.size}
          selectedSeriesIds={Array.from(selectedSeries)}
          onClearSelection={clearSeriesSelection}
          onAddToCollection={() => setShowCollectionPicker(true)}
          onToggleFavorite={handleToggleFavorite}
          onToggleWantToRead={handleToggleWantToRead}
          onMarkRead={handleMarkRead}
          onMarkUnread={handleMarkUnread}
          onFetchMetadata={handleFetchMetadata}
          onBatchEdit={() => setShowBatchEditModal(true)}
          isLoading={isBulkLoading}
        />
      )}

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={showCollectionPicker}
        onClose={() => setShowCollectionPicker(false)}
        seriesIds={Array.from(selectedSeries)}
      />

      {/* Batch Edit Modal */}
      <BatchSeriesMetadataModal
        isOpen={showBatchEditModal}
        onClose={() => setShowBatchEditModal(false)}
        seriesIds={Array.from(selectedSeries)}
        onComplete={handleBatchEditComplete}
      />
    </div>
  );
}
