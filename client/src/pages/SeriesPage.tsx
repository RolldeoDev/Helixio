/**
 * SeriesPage Component
 *
 * Main page for browsing all series in the library.
 * Part of the Series-Centric Architecture UI.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SeriesGrid } from '../components/SeriesGrid';
import {
  getSeriesPublishers,
  getSeriesGenres,
  SeriesListOptions,
} from '../services/api.service';
import './SeriesPage.css';

export function SeriesPage() {
  const navigate = useNavigate();

  // Filter state
  const [search, setSearch] = useState('');
  const [publisher, setPublisher] = useState<string>('');
  const [type, setType] = useState<'western' | 'manga' | ''>('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [hasUnread, setHasUnread] = useState<boolean | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SeriesListOptions['sortBy']>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Available filter values
  const [publishers, setPublishers] = useState<string[]>([]);
  const [_genres, setGenres] = useState<string[]>([]);

  // Fetch filter options
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [pubResult, genreResult] = await Promise.all([
          getSeriesPublishers(),
          getSeriesGenres(),
        ]);
        setPublishers(pubResult.publishers);
        setGenres(genreResult.genres);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  // Build options for SeriesGrid
  const options: SeriesListOptions = {
    sortBy,
    sortOrder,
    ...(search && { search }),
    ...(publisher && { publisher }),
    ...(type && { type }),
    ...(selectedGenres.length > 0 && { genres: selectedGenres }),
    ...(hasUnread !== undefined && { hasUnread }),
  };

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
  };

  const hasActiveFilters = search || publisher || type || selectedGenres.length > 0 || hasUnread !== undefined;

  return (
    <div className="series-page">
      <div className="series-page-header">
        <div className="series-page-title-row">
          <h1>Series</h1>
          <button
            className="find-duplicates-btn"
            onClick={() => navigate('/series/duplicates')}
          >
            Find Duplicates
          </button>
        </div>

        {/* Search */}
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
      </div>

      {/* Filters */}
      <div className="series-filters">
        <div className="filter-group">
          <label htmlFor="sort-select">Sort by</label>
          <select
            id="sort-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-') as [SeriesListOptions['sortBy'], 'asc' | 'desc'];
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
            }}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="startYear-desc">Year (Newest)</option>
            <option value="startYear-asc">Year (Oldest)</option>
            <option value="updatedAt-desc">Recently Updated</option>
            <option value="issueCount-desc">Most Issues</option>
            <option value="issueCount-asc">Fewest Issues</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="publisher-select">Publisher</label>
          <select
            id="publisher-select"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
          >
            <option value="">All Publishers</option>
            {publishers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="type-select">Type</label>
          <select
            id="type-select"
            value={type}
            onChange={(e) => setType(e.target.value as 'western' | 'manga' | '')}
          >
            <option value="">All Types</option>
            <option value="western">Western Comics</option>
            <option value="manga">Manga</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="unread-select">Reading Status</label>
          <select
            id="unread-select"
            value={hasUnread === undefined ? '' : hasUnread ? 'unread' : 'complete'}
            onChange={(e) => {
              if (e.target.value === '') {
                setHasUnread(undefined);
              } else {
                setHasUnread(e.target.value === 'unread');
              }
            }}
          >
            <option value="">All Series</option>
            <option value="unread">Has Unread</option>
            <option value="complete">Complete</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="clear-filters-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Series Grid */}
      <SeriesGrid options={options} />
    </div>
  );
}
