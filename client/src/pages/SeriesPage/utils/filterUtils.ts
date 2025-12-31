/**
 * Filter Utilities
 *
 * URL parsing, serialization, and filter state management.
 */

// =============================================================================
// Types
// =============================================================================

export type SortByOption = 'name' | 'startYear' | 'updatedAt' | 'issueCount';
export type SortOrder = 'asc' | 'desc';
export type SeriesType = 'western' | 'manga';

export interface SeriesFilterState {
  // Core filters
  search: string;
  publisher: string | null;
  type: SeriesType | null;
  hasUnread: boolean | null;
  showHidden: boolean;
  libraryId: string | null;

  // Sorting
  sortBy: SortByOption;
  sortOrder: SortOrder;

  // Smart filter preset (mutually exclusive with core filters)
  presetId: string | null;

  // View preferences (not sent to API)
  cardSize: number;
}

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_FILTERS: SeriesFilterState = {
  search: '',
  publisher: null,
  type: null,
  hasUnread: null,
  showHidden: false,
  libraryId: null,
  sortBy: 'name',
  sortOrder: 'asc',
  presetId: null,
  cardSize: 5,
};

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Parse URL search params into filter state.
 * Returns defaults for missing/invalid params.
 */
export function parseUrlToFilters(params: URLSearchParams): SeriesFilterState {
  const getString = (key: string): string | null => params.get(key) || null;
  const getBoolean = (key: string): boolean | null => {
    const val = params.get(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  };
  const getNumber = (key: string, min: number, max: number, defaultVal: number): number => {
    const val = params.get(key);
    if (!val) return defaultVal;
    const num = parseInt(val, 10);
    if (isNaN(num)) return defaultVal;
    return Math.max(min, Math.min(max, num));
  };

  const type = getString('type');
  const sortBy = getString('sortBy');
  const sortOrder = getString('sortOrder');

  return {
    search: getString('search') || '',
    publisher: getString('publisher'),
    type: type === 'western' || type === 'manga' ? type : null,
    hasUnread: getBoolean('hasUnread'),
    showHidden: getBoolean('showHidden') ?? false,
    libraryId: getString('libraryId'),
    sortBy: isValidSortBy(sortBy) ? sortBy : 'name',
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'asc',
    presetId: getString('preset'),
    cardSize: getNumber('cardSize', 1, 10, 5),
  };
}

function isValidSortBy(value: string | null): value is SortByOption {
  return value === 'name' || value === 'startYear' || value === 'updatedAt' || value === 'issueCount';
}

// =============================================================================
// URL Serialization
// =============================================================================

/**
 * Convert filter state to URL string.
 * Only includes non-default values.
 */
export function filtersToUrl(filters: SeriesFilterState): string {
  const params = new URLSearchParams();

  // Preset takes precedence - if set, only include preset and view prefs
  if (filters.presetId) {
    params.set('preset', filters.presetId);
  } else {
    // Core filters (only if non-default)
    if (filters.search) params.set('search', filters.search);
    if (filters.publisher) params.set('publisher', filters.publisher);
    if (filters.type) params.set('type', filters.type);
    if (filters.hasUnread !== null) params.set('hasUnread', String(filters.hasUnread));
    if (filters.showHidden) params.set('showHidden', 'true');
    if (filters.libraryId) params.set('libraryId', filters.libraryId);
  }

  // Sorting (only if non-default)
  if (filters.sortBy !== 'name') params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== 'asc') params.set('sortOrder', filters.sortOrder);

  // View preferences (only if non-default)
  if (filters.cardSize !== 5) params.set('cardSize', String(filters.cardSize));

  const queryString = params.toString();
  return queryString ? `/series?${queryString}` : '/series';
}

// =============================================================================
// Query Key Generation
// =============================================================================

/**
 * Generate a stable query key for React Query.
 * Excludes view-only preferences (cardSize) that don't affect data.
 */
export function filtersToQueryKey(filters: SeriesFilterState): Record<string, unknown> {
  if (filters.presetId) {
    return {
      preset: filters.presetId,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    };
  }

  return {
    search: filters.search,
    publisher: filters.publisher,
    type: filters.type,
    hasUnread: filters.hasUnread,
    showHidden: filters.showHidden,
    libraryId: filters.libraryId,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };
}
