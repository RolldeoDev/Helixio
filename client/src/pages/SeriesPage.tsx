/**
 * SeriesPage Component
 *
 * Main page for browsing all series in the library.
 * Part of the Series-Centric Architecture UI.
 *
 * Features:
 * - Promoted collections section at the top
 * - Series grid with filters and search
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SeriesGrid } from '../components/SeriesGrid';
import { CollectionCoverCard, type PromotedCollectionData } from '../components/CollectionCoverCard';
import {
  getSeriesPublishers,
  getSeriesGenres,
  getPromotedCollections,
  SeriesListOptions,
  PromotedCollection,
} from '../services/api.service';
import { useApp } from '../contexts/AppContext';
import './SeriesPage.css';

export function SeriesPage() {
  const navigate = useNavigate();
  const { libraries, selectedLibrary, isAllLibraries, selectLibrary } = useApp();

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

  // Promoted collections state
  const [promotedCollections, setPromotedCollections] = useState<PromotedCollection[]>([]);
  const [showPromotedCollections, setShowPromotedCollections] = useState(true);

  // Fetch filter options and promoted collections
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pubResult, genreResult, collectionsResult] = await Promise.all([
          getSeriesPublishers(),
          getSeriesGenres(),
          getPromotedCollections(),
        ]);
        setPublishers(pubResult.publishers);
        setGenres(genreResult.genres);
        setPromotedCollections(collectionsResult.collections);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    fetchData();
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
    ...(libraryId && { libraryId }),
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

      {/* Promoted Collections Section */}
      {promotedCollections.length > 0 && showPromotedCollections && !hasActiveFilters && (
        <div className="series-promoted-collections">
          <div className="series-promoted-header">
            <h2>Collections</h2>
            <button
              className="series-promoted-toggle"
              onClick={() => setShowPromotedCollections(false)}
              aria-label="Hide collections"
            >
              Hide
            </button>
          </div>
          <div className="series-promoted-grid">
            {promotedCollections.map((collection) => {
              // Convert PromotedCollection to PromotedCollectionData
              const collectionData: PromotedCollectionData = {
                id: collection.id,
                name: collection.name,
                description: collection.description,
                isPromoted: collection.isPromoted,
                coverType: collection.coverType,
                coverSeriesId: collection.coverSeriesId,
                coverFileId: collection.coverFileId,
                coverHash: collection.coverHash,
                derivedPublisher: collection.derivedPublisher,
                derivedStartYear: collection.derivedStartYear,
                derivedEndYear: collection.derivedEndYear,
                derivedGenres: collection.derivedGenres,
                derivedIssueCount: collection.derivedIssueCount,
                derivedReadCount: collection.derivedReadCount,
                overridePublisher: collection.overridePublisher,
                overrideStartYear: collection.overrideStartYear,
                overrideEndYear: collection.overrideEndYear,
                overrideGenres: collection.overrideGenres,
                totalIssues: collection.totalIssues,
                readIssues: collection.readIssues,
                seriesCovers: collection.seriesCovers.map((s) => ({
                  id: s.id,
                  name: s.name,
                  coverHash: s.coverHash,
                  coverFileId: s.coverFileId,
                  firstIssueId: s.firstIssueId,
                  coverSource: s.coverSource,
                })),
              };

              return (
                <CollectionCoverCard
                  key={collection.id}
                  collection={collectionData}
                  size="medium"
                  onClick={(id) => navigate(`/collections/${id}`)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Show collapsed collections indicator */}
      {promotedCollections.length > 0 && !showPromotedCollections && !hasActiveFilters && (
        <button
          className="series-promoted-show-btn"
          onClick={() => setShowPromotedCollections(true)}
        >
          Show {promotedCollections.length} Collection{promotedCollections.length !== 1 ? 's' : ''}
        </button>
      )}

      {/* Series Grid */}
      <SeriesGrid options={options} />
    </div>
  );
}
