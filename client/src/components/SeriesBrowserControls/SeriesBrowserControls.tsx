/**
 * SeriesBrowserControls Component
 *
 * Filter and sort controls for the Series Browser page.
 * Includes:
 * - Sort dropdown (name, year, updated, issue count)
 * - Search input (debounced)
 * - Publisher dropdown
 * - Type toggle (All/Western/Manga)
 * - Read status chips
 * - Genre multi-select
 * - Clear All button
 */

import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { type SeriesBrowseOptions } from '../../services/api/series';
import { useSeriesPublishers, useSeriesGenres } from '../../hooks/queries/useSeries';
import './SeriesBrowserControls.css';

// =============================================================================
// Types
// =============================================================================

export interface SeriesBrowserControlsProps {
  options: Omit<SeriesBrowseOptions, 'cursor' | 'limit'>;
  onChange: (options: Omit<SeriesBrowseOptions, 'cursor' | 'limit'>) => void;
  totalCount: number;
}

type SortOption = {
  value: SeriesBrowseOptions['sortBy'];
  label: string;
  defaultOrder: 'asc' | 'desc';
};

const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: 'Name', defaultOrder: 'asc' },
  { value: 'startYear', label: 'Year', defaultOrder: 'desc' },
  { value: 'updatedAt', label: 'Recently Updated', defaultOrder: 'desc' },
  { value: 'issueCount', label: 'Issue Count', defaultOrder: 'desc' },
];

const READ_STATUS_OPTIONS = [
  { value: undefined, label: 'All' },
  { value: 'unread' as const, label: 'Unread' },
  { value: 'reading' as const, label: 'Reading' },
  { value: 'completed' as const, label: 'Completed' },
];

const TYPE_OPTIONS = [
  { value: undefined, label: 'All Types' },
  { value: 'western' as const, label: 'Western' },
  { value: 'manga' as const, label: 'Manga' },
];

// =============================================================================
// Component
// =============================================================================

export const SeriesBrowserControls = memo(function SeriesBrowserControls({
  options,
  onChange,
  totalCount,
}: SeriesBrowserControlsProps) {
  const [searchValue, setSearchValue] = useState(options.search || '');
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const genreDropdownRef = useRef<HTMLDivElement>(null);

  // Refs for stable callback references (fixes search focus issue + performance)
  const optionsRef = useRef(options);
  const onChangeRef = useRef(onChange);

  // Refs for focus preservation - safety net to restore focus after re-renders
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasSearchFocused = useRef(false);

  // Keep refs in sync with props
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Focus preservation handlers
  const handleSearchFocus = useCallback(() => {
    wasSearchFocused.current = true;
  }, []);

  const handleSearchBlur = useCallback(() => {
    wasSearchFocused.current = false;
  }, []);

  // Restore focus after any render if input was previously focused
  useEffect(() => {
    if (wasSearchFocused.current && searchInputRef.current) {
      // Use requestAnimationFrame to ensure DOM is stable before focusing
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  });

  // Fetch publishers and genres for dropdowns
  const { data: publishers = [], isLoading: publishersLoading } = useSeriesPublishers();
  const { data: genres = [], isLoading: genresLoading } = useSeriesGenres();

  // Debounce search input - only depends on searchValue for stable behavior
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== (optionsRef.current.search || '')) {
        onChangeRef.current({ ...optionsRef.current, search: searchValue || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Close genre dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handlers - use refs for stable references
  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const sortBy = e.target.value as SeriesBrowseOptions['sortBy'];
    const sortOption = SORT_OPTIONS.find(o => o.value === sortBy);
    onChangeRef.current({
      ...optionsRef.current,
      sortBy,
      sortOrder: sortOption?.defaultOrder || 'asc',
    });
  }, []);

  const handleSortOrderToggle = useCallback(() => {
    onChangeRef.current({
      ...optionsRef.current,
      sortOrder: optionsRef.current.sortOrder === 'asc' ? 'desc' : 'asc',
    });
  }, []);

  const handlePublisherChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const publisher = e.target.value || undefined;
    onChangeRef.current({ ...optionsRef.current, publisher });
  }, []);

  const handleTypeChange = useCallback((type: SeriesBrowseOptions['type']) => {
    onChangeRef.current({ ...optionsRef.current, type });
  }, []);

  const handleReadStatusChange = useCallback((readStatus: SeriesBrowseOptions['readStatus']) => {
    onChangeRef.current({ ...optionsRef.current, readStatus });
  }, []);

  const handleGenreToggle = useCallback((genre: string) => {
    const currentGenres = optionsRef.current.genres || [];
    const newGenres = currentGenres.includes(genre)
      ? currentGenres.filter(g => g !== genre)
      : [...currentGenres, genre];
    onChangeRef.current({ ...optionsRef.current, genres: newGenres.length > 0 ? newGenres : undefined });
  }, []);

  const handleClearAll = useCallback(() => {
    setSearchValue('');
    onChangeRef.current({
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      options.search ||
      options.publisher ||
      options.type ||
      options.readStatus ||
      (options.genres && options.genres.length > 0)
    );
  }, [options.search, options.publisher, options.type, options.readStatus, options.genres]);

  const selectedGenreCount = options.genres?.length || 0;

  // Normalize type for comparison (handles missing vs undefined)
  const currentType = options.type ?? undefined;
  const currentReadStatus = options.readStatus ?? undefined;

  return (
    <div className="series-browser-controls">
      {/* Search */}
      <div className="series-browser-controls__search">
        <svg className="series-browser-controls__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          className="series-browser-controls__search-input"
          placeholder="Search series..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
        />
        {searchValue && (
          <button
            type="button"
            className="series-browser-controls__search-clear"
            onClick={() => setSearchValue('')}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Sort */}
      <div className="series-browser-controls__sort">
        <select
          className="series-browser-controls__sort-select"
          value={options.sortBy || 'name'}
          onChange={handleSortChange}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="series-browser-controls__sort-order"
          onClick={handleSortOrderToggle}
          title={options.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          aria-label={options.sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
        >
          {options.sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Publisher */}
      <select
        className="series-browser-controls__publisher"
        value={options.publisher || ''}
        onChange={handlePublisherChange}
        aria-label="Filter by publisher"
        disabled={publishersLoading}
      >
        <option value="">
          {publishersLoading ? 'Loading...' : 'All Publishers'}
        </option>
        {publishers.map(pub => (
          <option key={pub} value={pub}>{pub}</option>
        ))}
      </select>

      {/* Type Toggle */}
      <div className="series-browser-controls__type-toggle">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value ?? 'all'}
            type="button"
            className={`series-browser-controls__type-btn ${currentType === opt.value ? 'active' : ''}`}
            onClick={() => handleTypeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Read Status Chips */}
      <div className="series-browser-controls__read-status">
        {READ_STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value ?? 'all'}
            type="button"
            className={`series-browser-controls__status-chip ${currentReadStatus === opt.value ? 'active' : ''}`}
            onClick={() => handleReadStatusChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Genre Multi-select */}
      <div className="series-browser-controls__genre-dropdown" ref={genreDropdownRef}>
        <button
          type="button"
          className={`series-browser-controls__genre-btn ${selectedGenreCount > 0 ? 'active' : ''}`}
          onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
          disabled={genresLoading}
        >
          {genresLoading ? 'Loading...' : `Genres${selectedGenreCount > 0 ? ` (${selectedGenreCount})` : ''}`}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points={isGenreDropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>
        {isGenreDropdownOpen && (
          <div className="series-browser-controls__genre-menu">
            {genres.length === 0 ? (
              <div className="series-browser-controls__genre-empty">No genres available</div>
            ) : (
              genres.map(genre => (
                <label key={genre} className="series-browser-controls__genre-item">
                  <input
                    type="checkbox"
                    checked={options.genres?.includes(genre) || false}
                    onChange={() => handleGenreToggle(genre)}
                  />
                  <span>{genre}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Clear All */}
      {hasActiveFilters && (
        <button
          type="button"
          className="series-browser-controls__clear"
          onClick={handleClearAll}
        >
          Clear All
        </button>
      )}

      {/* Count Display */}
      <div className="series-browser-controls__count">
        {totalCount.toLocaleString()} series
      </div>
    </div>
  );
});
