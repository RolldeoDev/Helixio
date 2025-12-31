# Series Page Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the `/series` page with stable layouts, better performance, and URL-based filtering for deep links.

**Architecture:** State-driven with URL snapshot. Filter state is master, URL is a reflection. React Query for data fetching with `keepPreviousData: true` to prevent blank states. Virtualized grid with stable layout that only remeasures on user actions (resize, slider), never during data transitions.

**Tech Stack:** React 18, TypeScript, React Query, React Router, CSS Modules

**Design Document:** `docs/plans/2025-12-31-series-page-rebuild-design.md`

---

## Phase 1: Foundation - Filter State & URL Snapshot

### Task 1.1: Create Directory Structure

**Files:**
- Create: `client/src/pages/SeriesPage/index.ts`
- Create: `client/src/pages/SeriesPage/SeriesPage.tsx`
- Create: `client/src/pages/SeriesPage/SeriesPage.css`
- Create: `client/src/pages/SeriesPage/hooks/` (directory)
- Create: `client/src/pages/SeriesPage/components/` (directory)
- Create: `client/src/pages/SeriesPage/utils/` (directory)

**Step 1: Create directories**

```bash
mkdir -p client/src/pages/SeriesPage/hooks
mkdir -p client/src/pages/SeriesPage/components
mkdir -p client/src/pages/SeriesPage/utils
```

**Step 2: Create index.ts**

```typescript
// client/src/pages/SeriesPage/index.ts
export { SeriesPage } from './SeriesPage';
```

**Step 3: Create placeholder SeriesPage.tsx**

```typescript
// client/src/pages/SeriesPage/SeriesPage.tsx
import './SeriesPage.css';

export function SeriesPage() {
  return (
    <div className="series-page">
      <h1>Series Page (Rebuilding)</h1>
    </div>
  );
}
```

**Step 4: Create placeholder CSS**

```css
/* client/src/pages/SeriesPage/SeriesPage.css */
.series-page {
  padding: 1rem;
}
```

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage
git commit -m "feat(series-page): create directory structure for rebuild"
```

---

### Task 1.2: Create filterUtils.ts

**Files:**
- Create: `client/src/pages/SeriesPage/utils/filterUtils.ts`
- Test: `client/src/pages/SeriesPage/utils/__tests__/filterUtils.test.ts`

**Step 1: Write failing tests**

Create `client/src/pages/SeriesPage/utils/__tests__/filterUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SeriesFilterState,
  DEFAULT_FILTERS,
  parseUrlToFilters,
  filtersToUrl,
  filtersToQueryKey,
} from '../filterUtils';

describe('filterUtils', () => {
  describe('DEFAULT_FILTERS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_FILTERS.search).toBe('');
      expect(DEFAULT_FILTERS.publisher).toBeNull();
      expect(DEFAULT_FILTERS.type).toBeNull();
      expect(DEFAULT_FILTERS.hasUnread).toBeNull();
      expect(DEFAULT_FILTERS.showHidden).toBe(false);
      expect(DEFAULT_FILTERS.libraryId).toBeNull();
      expect(DEFAULT_FILTERS.sortBy).toBe('name');
      expect(DEFAULT_FILTERS.sortOrder).toBe('asc');
      expect(DEFAULT_FILTERS.presetId).toBeNull();
      expect(DEFAULT_FILTERS.cardSize).toBe(5);
    });
  });

  describe('parseUrlToFilters', () => {
    it('should return defaults for empty params', () => {
      const params = new URLSearchParams('');
      const result = parseUrlToFilters(params);
      expect(result).toEqual(DEFAULT_FILTERS);
    });

    it('should parse search parameter', () => {
      const params = new URLSearchParams('?search=batman');
      const result = parseUrlToFilters(params);
      expect(result.search).toBe('batman');
    });

    it('should parse publisher parameter', () => {
      const params = new URLSearchParams('?publisher=DC+Comics');
      const result = parseUrlToFilters(params);
      expect(result.publisher).toBe('DC Comics');
    });

    it('should parse type parameter', () => {
      const params = new URLSearchParams('?type=manga');
      const result = parseUrlToFilters(params);
      expect(result.type).toBe('manga');
    });

    it('should parse hasUnread parameter', () => {
      const params = new URLSearchParams('?hasUnread=true');
      const result = parseUrlToFilters(params);
      expect(result.hasUnread).toBe(true);
    });

    it('should parse showHidden parameter', () => {
      const params = new URLSearchParams('?showHidden=true');
      const result = parseUrlToFilters(params);
      expect(result.showHidden).toBe(true);
    });

    it('should parse sorting parameters', () => {
      const params = new URLSearchParams('?sortBy=startYear&sortOrder=desc');
      const result = parseUrlToFilters(params);
      expect(result.sortBy).toBe('startYear');
      expect(result.sortOrder).toBe('desc');
    });

    it('should parse preset parameter', () => {
      const params = new URLSearchParams('?preset=abc123');
      const result = parseUrlToFilters(params);
      expect(result.presetId).toBe('abc123');
    });

    it('should parse cardSize parameter', () => {
      const params = new URLSearchParams('?cardSize=7');
      const result = parseUrlToFilters(params);
      expect(result.cardSize).toBe(7);
    });

    it('should clamp cardSize to valid range', () => {
      expect(parseUrlToFilters(new URLSearchParams('?cardSize=0')).cardSize).toBe(1);
      expect(parseUrlToFilters(new URLSearchParams('?cardSize=15')).cardSize).toBe(10);
    });
  });

  describe('filtersToUrl', () => {
    it('should return /series for default filters', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).toBe('/series');
    });

    it('should include search in URL', () => {
      const filters = { ...DEFAULT_FILTERS, search: 'batman' };
      const result = filtersToUrl(filters);
      expect(result).toContain('search=batman');
    });

    it('should encode publisher with spaces', () => {
      const filters = { ...DEFAULT_FILTERS, publisher: 'DC Comics' };
      const result = filtersToUrl(filters);
      expect(result).toContain('publisher=DC+Comics');
    });

    it('should include preset when set', () => {
      const filters = { ...DEFAULT_FILTERS, presetId: 'abc123' };
      const result = filtersToUrl(filters);
      expect(result).toContain('preset=abc123');
    });

    it('should not include default sortBy/sortOrder', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).not.toContain('sortBy');
      expect(result).not.toContain('sortOrder');
    });

    it('should include non-default sorting', () => {
      const filters = { ...DEFAULT_FILTERS, sortBy: 'startYear' as const, sortOrder: 'desc' as const };
      const result = filtersToUrl(filters);
      expect(result).toContain('sortBy=startYear');
      expect(result).toContain('sortOrder=desc');
    });

    it('should not include default cardSize', () => {
      const result = filtersToUrl(DEFAULT_FILTERS);
      expect(result).not.toContain('cardSize');
    });

    it('should include non-default cardSize', () => {
      const filters = { ...DEFAULT_FILTERS, cardSize: 7 };
      const result = filtersToUrl(filters);
      expect(result).toContain('cardSize=7');
    });
  });

  describe('filtersToQueryKey', () => {
    it('should create stable query key for same filters', () => {
      const filters1 = { ...DEFAULT_FILTERS, search: 'batman' };
      const filters2 = { ...DEFAULT_FILTERS, search: 'batman' };
      expect(filtersToQueryKey(filters1)).toEqual(filtersToQueryKey(filters2));
    });

    it('should create different keys for different filters', () => {
      const filters1 = { ...DEFAULT_FILTERS, search: 'batman' };
      const filters2 = { ...DEFAULT_FILTERS, search: 'superman' };
      expect(filtersToQueryKey(filters1)).not.toEqual(filtersToQueryKey(filters2));
    });

    it('should not include cardSize in query key (view-only)', () => {
      const filters1 = { ...DEFAULT_FILTERS, cardSize: 5 };
      const filters2 = { ...DEFAULT_FILTERS, cardSize: 10 };
      expect(filtersToQueryKey(filters1)).toEqual(filtersToQueryKey(filters2));
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd client && npx vitest run src/pages/SeriesPage/utils/__tests__/filterUtils.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement filterUtils.ts**

Create `client/src/pages/SeriesPage/utils/filterUtils.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

```bash
cd client && npx vitest run src/pages/SeriesPage/utils/__tests__/filterUtils.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage/utils
git commit -m "feat(series-page): add filterUtils with URL parsing and serialization"
```

---

### Task 1.3: Create useSeriesFilters Hook

**Files:**
- Create: `client/src/pages/SeriesPage/hooks/useSeriesFilters.ts`
- Test: `client/src/pages/SeriesPage/hooks/__tests__/useSeriesFilters.test.ts`

**Step 1: Write failing tests**

Create `client/src/pages/SeriesPage/hooks/__tests__/useSeriesFilters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSeriesFilters } from '../useSeriesFilters';
import { DEFAULT_FILTERS } from '../../utils/filterUtils';

describe('useSeriesFilters', () => {
  it('should initialize with default filters when no initial provided', () => {
    const { result } = renderHook(() => useSeriesFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('should initialize with provided initial filters', () => {
    const initial = { ...DEFAULT_FILTERS, search: 'batman' };
    const { result } = renderHook(() => useSeriesFilters(initial));
    expect(result.current.filters.search).toBe('batman');
  });

  it('should update single filter with setFilter', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setFilter('search', 'spider');
    });

    expect(result.current.filters.search).toBe('spider');
  });

  it('should update multiple filters with setFilters', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setFilters({ search: 'batman', publisher: 'DC' });
    });

    expect(result.current.filters.search).toBe('batman');
    expect(result.current.filters.publisher).toBe('DC');
  });

  it('should clear all filters with clearFilters', () => {
    const initial = { ...DEFAULT_FILTERS, search: 'batman', publisher: 'DC' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('should clear presetId when setting a core filter', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.setFilter('publisher', 'Marvel');
    });

    expect(result.current.filters.presetId).toBeNull();
    expect(result.current.filters.publisher).toBe('Marvel');
  });

  it('should not clear presetId when changing cardSize', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.setFilter('cardSize', 8);
    });

    expect(result.current.filters.presetId).toBe('abc123');
    expect(result.current.filters.cardSize).toBe(8);
  });

  it('should set presetId with setPreset', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setPreset('xyz789');
    });

    expect(result.current.filters.presetId).toBe('xyz789');
  });

  it('should clear presetId with clearPreset', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.clearPreset();
    });

    expect(result.current.filters.presetId).toBeNull();
  });

  it('should report hasActiveFilters correctly', () => {
    const { result } = renderHook(() => useSeriesFilters());

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.setFilter('search', 'batman');
    });

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('should report isUsingPreset correctly', () => {
    const { result } = renderHook(() => useSeriesFilters());

    expect(result.current.isUsingPreset).toBe(false);

    act(() => {
      result.current.setPreset('abc123');
    });

    expect(result.current.isUsingPreset).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useSeriesFilters.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement useSeriesFilters.ts**

Create `client/src/pages/SeriesPage/hooks/useSeriesFilters.ts`:

```typescript
/**
 * useSeriesFilters Hook
 *
 * Manages filter state with reducer pattern.
 * Handles preset vs. manual filter mutual exclusivity.
 */

import { useReducer, useCallback, useMemo } from 'react';
import { SeriesFilterState, DEFAULT_FILTERS } from '../utils/filterUtils';

// =============================================================================
// Types
// =============================================================================

type FilterKey = keyof SeriesFilterState;

type FilterAction =
  | { type: 'SET_FILTER'; key: FilterKey; value: SeriesFilterState[FilterKey] }
  | { type: 'SET_FILTERS'; payload: Partial<SeriesFilterState> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_PRESET'; presetId: string }
  | { type: 'CLEAR_PRESET' };

export interface UseSeriesFiltersReturn {
  filters: SeriesFilterState;
  setFilter: <K extends FilterKey>(key: K, value: SeriesFilterState[K]) => void;
  setFilters: (partial: Partial<SeriesFilterState>) => void;
  clearFilters: () => void;
  setPreset: (presetId: string) => void;
  clearPreset: () => void;
  hasActiveFilters: boolean;
  isUsingPreset: boolean;
}

// =============================================================================
// Reducer
// =============================================================================

// Keys that don't affect data fetching (view-only)
const VIEW_ONLY_KEYS: FilterKey[] = ['cardSize'];

// Keys that should clear preset when changed
function shouldClearPreset(key: FilterKey): boolean {
  return !VIEW_ONLY_KEYS.includes(key) && key !== 'presetId';
}

function filterReducer(state: SeriesFilterState, action: FilterAction): SeriesFilterState {
  switch (action.type) {
    case 'SET_FILTER': {
      const newState = { ...state, [action.key]: action.value };
      // Clear preset if setting a filter that affects data
      if (shouldClearPreset(action.key) && state.presetId) {
        newState.presetId = null;
      }
      return newState;
    }

    case 'SET_FILTERS': {
      const newState = { ...state, ...action.payload };
      // Clear preset if any data-affecting filter is set
      const hasDataFilter = Object.keys(action.payload).some(
        (key) => shouldClearPreset(key as FilterKey)
      );
      if (hasDataFilter && state.presetId) {
        newState.presetId = null;
      }
      return newState;
    }

    case 'CLEAR_FILTERS':
      return { ...DEFAULT_FILTERS };

    case 'SET_PRESET':
      return { ...state, presetId: action.presetId };

    case 'CLEAR_PRESET':
      return { ...state, presetId: null };

    default:
      return state;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useSeriesFilters(
  initialFilters: SeriesFilterState = DEFAULT_FILTERS
): UseSeriesFiltersReturn {
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);

  const setFilter = useCallback(<K extends FilterKey>(key: K, value: SeriesFilterState[K]) => {
    dispatch({ type: 'SET_FILTER', key, value });
  }, []);

  const setFilters = useCallback((partial: Partial<SeriesFilterState>) => {
    dispatch({ type: 'SET_FILTERS', payload: partial });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTERS' });
  }, []);

  const setPreset = useCallback((presetId: string) => {
    dispatch({ type: 'SET_PRESET', presetId });
  }, []);

  const clearPreset = useCallback(() => {
    dispatch({ type: 'CLEAR_PRESET' });
  }, []);

  const hasActiveFilters = useMemo(() => {
    if (filters.presetId) return true;
    if (filters.search) return true;
    if (filters.publisher) return true;
    if (filters.type) return true;
    if (filters.hasUnread !== null) return true;
    if (filters.showHidden) return true;
    return false;
  }, [filters]);

  const isUsingPreset = filters.presetId !== null;

  return {
    filters,
    setFilter,
    setFilters,
    clearFilters,
    setPreset,
    clearPreset,
    hasActiveFilters,
    isUsingPreset,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useSeriesFilters.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage/hooks
git commit -m "feat(series-page): add useSeriesFilters hook with reducer pattern"
```

---

### Task 1.4: Create useUrlSnapshot Hook

**Files:**
- Create: `client/src/pages/SeriesPage/hooks/useUrlSnapshot.ts`
- Test: `client/src/pages/SeriesPage/hooks/__tests__/useUrlSnapshot.test.ts`

**Step 1: Write failing tests**

Create `client/src/pages/SeriesPage/hooks/__tests__/useUrlSnapshot.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useUrlSnapshot } from '../useUrlSnapshot';
import { DEFAULT_FILTERS, SeriesFilterState } from '../../utils/filterUtils';
import { ReactNode } from 'react';

// Wrapper for router context
const wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('useUrlSnapshot', () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  beforeEach(() => {
    // Reset URL before each test
    window.history.replaceState({}, '', '/series');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return default filters when URL has no params', () => {
    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });
    expect(result.current.initialFilters).toEqual(DEFAULT_FILTERS);
  });

  it('should parse filters from URL on init', () => {
    window.history.replaceState({}, '', '/series?search=batman&publisher=DC');

    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    expect(result.current.initialFilters.search).toBe('batman');
    expect(result.current.initialFilters.publisher).toBe('DC');
  });

  it('should update URL when filters change', async () => {
    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    const newFilters: SeriesFilterState = {
      ...DEFAULT_FILTERS,
      search: 'spider-man',
    };

    act(() => {
      result.current.syncToUrl(newFilters);
    });

    // Wait for debounce
    await waitFor(
      () => {
        expect(window.location.search).toContain('search=spider-man');
      },
      { timeout: 1000 }
    );
  });

  it('should detect preset in URL', () => {
    window.history.replaceState({}, '', '/series?preset=abc123');

    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    expect(result.current.initialFilters.presetId).toBe('abc123');
    expect(result.current.hasPresetInUrl).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useUrlSnapshot.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement useUrlSnapshot.ts**

Create `client/src/pages/SeriesPage/hooks/useUrlSnapshot.ts`:

```typescript
/**
 * useUrlSnapshot Hook
 *
 * Handles URL ↔ filter state synchronization.
 * - Reads URL params on mount to get initial state
 * - Writes filter state to URL (debounced) when it changes
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeriesFilterState, parseUrlToFilters, filtersToUrl } from '../utils/filterUtils';

export interface UseUrlSnapshotReturn {
  /** Initial filters parsed from URL on mount */
  initialFilters: SeriesFilterState;
  /** Whether URL contains a preset parameter */
  hasPresetInUrl: boolean;
  /** Sync current filters to URL (debounced) */
  syncToUrl: (filters: SeriesFilterState) => void;
}

const URL_SYNC_DEBOUNCE = 500;

export function useUrlSnapshot(): UseUrlSnapshotReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Parse initial filters from URL (only on mount)
  const initialFilters = useMemo(() => {
    return parseUrlToFilters(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only read on mount

  const hasPresetInUrl = initialFilters.presetId !== null;

  // Sync filters to URL (debounced)
  const syncToUrl = useCallback(
    (filters: SeriesFilterState) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        const url = filtersToUrl(filters);
        const newParams = new URLSearchParams(url.split('?')[1] || '');

        // Use replaceState to avoid polluting history
        window.history.replaceState({}, '', url);
      }, URL_SYNC_DEBOUNCE);
    },
    []
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    initialFilters,
    hasPresetInUrl,
    syncToUrl,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useUrlSnapshot.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage/hooks/useUrlSnapshot.ts
git add client/src/pages/SeriesPage/hooks/__tests__/useUrlSnapshot.test.ts
git commit -m "feat(series-page): add useUrlSnapshot hook for URL sync"
```

---

## Phase 2: Data Fetching

### Task 2.1: Create useSeriesData Hook

**Files:**
- Create: `client/src/pages/SeriesPage/hooks/useSeriesData.ts`
- Test: `client/src/pages/SeriesPage/hooks/__tests__/useSeriesData.test.ts`

**Step 1: Write failing tests**

Create `client/src/pages/SeriesPage/hooks/__tests__/useSeriesData.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSeriesData } from '../useSeriesData';
import { DEFAULT_FILTERS } from '../../utils/filterUtils';
import { ReactNode } from 'react';

// Mock the API
vi.mock('../../../../services/api/series', () => ({
  getUnifiedGridItems: vi.fn().mockResolvedValue({
    items: [
      { itemType: 'series', id: '1', name: 'Batman' },
      { itemType: 'series', id: '2', name: 'Superman' },
    ],
    pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useSeriesData', () => {
  it('should fetch data based on filters', async () => {
    const { result } = renderHook(() => useSeriesData(DEFAULT_FILTERS), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.total).toBe(2);
  });

  it('should provide refetch function', async () => {
    const { result } = renderHook(() => useSeriesData(DEFAULT_FILTERS), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useSeriesData.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement useSeriesData.ts**

Create `client/src/pages/SeriesPage/hooks/useSeriesData.ts`:

```typescript
/**
 * useSeriesData Hook
 *
 * Fetches series grid data based on filter state.
 * Uses React Query with keepPreviousData for smooth transitions.
 */

import { useQuery } from '@tanstack/react-query';
import { getUnifiedGridItems, GridItem, UnifiedGridOptions } from '../../../services/api/series';
import { SeriesFilterState, filtersToQueryKey } from '../utils/filterUtils';

export interface UseSeriesDataReturn {
  items: GridItem[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Convert filter state to API options.
 */
function filtersToApiOptions(filters: SeriesFilterState): UnifiedGridOptions {
  // If using preset, only include preset ID and sorting
  if (filters.presetId) {
    return {
      all: true,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      preset: filters.presetId,
      includePromotedCollections: true,
    };
  }

  // Manual filter mode
  return {
    all: true,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    search: filters.search || undefined,
    publisher: filters.publisher || undefined,
    type: filters.type || undefined,
    hasUnread: filters.hasUnread ?? undefined,
    includeHidden: filters.showHidden,
    libraryId: filters.libraryId || undefined,
    includePromotedCollections: true,
  };
}

export function useSeriesData(filters: SeriesFilterState): UseSeriesDataReturn {
  const queryKey = ['series', 'grid', filtersToQueryKey(filters)];

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: ({ signal }) => getUnifiedGridItems(filtersToApiOptions(filters)),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    refetchOnWindowFocus: false,
  });

  return {
    items: data?.items ?? [],
    total: data?.pagination.total ?? 0,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd client && npx vitest run src/pages/SeriesPage/hooks/__tests__/useSeriesData.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage/hooks/useSeriesData.ts
git add client/src/pages/SeriesPage/hooks/__tests__/useSeriesData.test.ts
git commit -m "feat(series-page): add useSeriesData hook with React Query"
```

---

## Phase 3: Grid Layout (Stable, No Jitter)

### Task 3.1: Create gridCalculations.ts

**Files:**
- Create: `client/src/pages/SeriesPage/utils/gridCalculations.ts`
- Test: `client/src/pages/SeriesPage/utils/__tests__/gridCalculations.test.ts`

**Step 1: Write failing tests**

Create `client/src/pages/SeriesPage/utils/__tests__/gridCalculations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculateGridLayout,
  calculateVisibleRange,
  GridLayout,
} from '../gridCalculations';

describe('gridCalculations', () => {
  describe('calculateGridLayout', () => {
    it('should calculate correct column count for container width', () => {
      // 1200px container, cardSize 5 (medium)
      const layout = calculateGridLayout(1200, 5);
      expect(layout.columns).toBeGreaterThan(0);
      expect(layout.columns).toBeLessThanOrEqual(14);
    });

    it('should calculate item dimensions', () => {
      const layout = calculateGridLayout(1200, 5);
      expect(layout.itemWidth).toBeGreaterThan(0);
      expect(layout.itemHeight).toBeGreaterThan(0);
      // Aspect ratio should be approximately 1.5
      const aspectRatio = (layout.itemHeight - 60) / layout.itemWidth;
      expect(aspectRatio).toBeCloseTo(1.5, 1);
    });

    it('should increase columns with smaller card size', () => {
      const smallCards = calculateGridLayout(1200, 3);
      const largeCards = calculateGridLayout(1200, 7);
      expect(smallCards.columns).toBeGreaterThan(largeCards.columns);
    });

    it('should respect minimum gap', () => {
      const layout = calculateGridLayout(1200, 5);
      expect(layout.gap).toBeGreaterThanOrEqual(12);
    });

    it('should calculate total height for given item count', () => {
      const layout = calculateGridLayout(1200, 5);
      const totalHeight = layout.getTotalHeight(100);
      expect(totalHeight).toBeGreaterThan(0);
    });

    it('should handle edge case of 0 items', () => {
      const layout = calculateGridLayout(1200, 5);
      const totalHeight = layout.getTotalHeight(0);
      expect(totalHeight).toBe(0);
    });
  });

  describe('calculateVisibleRange', () => {
    const mockLayout: GridLayout = {
      columns: 5,
      itemWidth: 200,
      itemHeight: 360,
      gap: 16,
      containerWidth: 1200,
      getTotalHeight: (count: number) => Math.ceil(count / 5) * 376,
      getItemPosition: (index: number) => ({
        x: (index % 5) * 216,
        y: Math.floor(index / 5) * 376,
      }),
    };

    it('should calculate visible range based on scroll position', () => {
      const range = calculateVisibleRange(0, 800, mockLayout, 100);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeGreaterThan(0);
    });

    it('should include overscan rows', () => {
      const rangeWithOverscan = calculateVisibleRange(0, 800, mockLayout, 100, 2);
      const rangeWithoutOverscan = calculateVisibleRange(0, 800, mockLayout, 100, 0);
      expect(rangeWithOverscan.endIndex).toBeGreaterThan(rangeWithoutOverscan.endIndex);
    });

    it('should clamp to valid range', () => {
      const range = calculateVisibleRange(10000, 800, mockLayout, 10);
      expect(range.startIndex).toBeGreaterThanOrEqual(0);
      expect(range.endIndex).toBeLessThanOrEqual(10);
    });

    it('should handle empty list', () => {
      const range = calculateVisibleRange(0, 800, mockLayout, 0);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd client && npx vitest run src/pages/SeriesPage/utils/__tests__/gridCalculations.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement gridCalculations.ts**

Create `client/src/pages/SeriesPage/utils/gridCalculations.ts`:

```typescript
/**
 * Grid Calculations
 *
 * Pure functions for calculating grid layout.
 * No side effects, no state - just math.
 */

// =============================================================================
// Types
// =============================================================================

export interface GridLayout {
  columns: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  containerWidth: number;
  getTotalHeight: (itemCount: number) => number;
  getItemPosition: (index: number) => { x: number; y: number };
}

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 14;
const MIN_GAP = 12;
const ASPECT_RATIO = 1.5; // Cover aspect ratio (height = width * 1.5)
const INFO_HEIGHT = 60; // Height of title/meta section below cover

// Card size slider maps to min card width
// Size 1 = smallest cards (most columns), Size 10 = largest cards (fewest columns)
const CARD_SIZE_TO_MIN_WIDTH: Record<number, number> = {
  1: 80,
  2: 100,
  3: 120,
  4: 140,
  5: 160,
  6: 180,
  7: 200,
  8: 240,
  9: 280,
  10: 320,
};

// =============================================================================
// Layout Calculation
// =============================================================================

/**
 * Calculate grid layout based on container width and card size preference.
 * This is the single source of truth for all layout calculations.
 */
export function calculateGridLayout(containerWidth: number, cardSize: number): GridLayout {
  // Get minimum card width from size preference
  const minCardWidth = CARD_SIZE_TO_MIN_WIDTH[cardSize] ?? 160;

  // Calculate how many columns fit
  // columns = floor((containerWidth + gap) / (minCardWidth + gap))
  const gap = MIN_GAP;
  let columns = Math.floor((containerWidth + gap) / (minCardWidth + gap));

  // Clamp to valid range
  columns = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, columns));

  // Calculate actual item width to fill container
  // itemWidth = (containerWidth - (columns - 1) * gap) / columns
  const itemWidth = (containerWidth - (columns - 1) * gap) / columns;

  // Calculate item height (cover + info section)
  const coverHeight = itemWidth * ASPECT_RATIO;
  const itemHeight = coverHeight + INFO_HEIGHT;

  // Row height includes gap
  const rowHeight = itemHeight + gap;

  return {
    columns,
    itemWidth,
    itemHeight,
    gap,
    containerWidth,

    getTotalHeight(itemCount: number): number {
      if (itemCount === 0) return 0;
      const rows = Math.ceil(itemCount / columns);
      // Last row doesn't need gap after it
      return rows * itemHeight + (rows - 1) * gap;
    },

    getItemPosition(index: number): { x: number; y: number } {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: col * (itemWidth + gap),
        y: row * (itemHeight + gap),
      };
    },
  };
}

// =============================================================================
// Visible Range Calculation
// =============================================================================

/**
 * Calculate which items are visible based on scroll position.
 * Includes overscan rows for smooth scrolling.
 */
export function calculateVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  layout: GridLayout,
  itemCount: number,
  overscanRows: number = 2
): VisibleRange {
  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const { columns, itemHeight, gap } = layout;
  const rowHeight = itemHeight + gap;

  // Calculate visible row range
  const firstVisibleRow = Math.floor(scrollTop / rowHeight);
  const lastVisibleRow = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  // Add overscan
  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = lastVisibleRow + overscanRows;

  // Convert to indices
  const startIndex = startRow * columns;
  const endIndex = Math.min((endRow + 1) * columns, itemCount);

  return { startIndex, endIndex };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd client && npx vitest run src/pages/SeriesPage/utils/__tests__/gridCalculations.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/pages/SeriesPage/utils/gridCalculations.ts
git add client/src/pages/SeriesPage/utils/__tests__/gridCalculations.test.ts
git commit -m "feat(series-page): add pure grid calculation functions"
```

---

### Task 3.2: Create useStableGridLayout Hook

**Files:**
- Create: `client/src/pages/SeriesPage/hooks/useStableGridLayout.ts`

**Step 1: Implement useStableGridLayout.ts**

Create `client/src/pages/SeriesPage/hooks/useStableGridLayout.ts`:

```typescript
/**
 * useStableGridLayout Hook
 *
 * Calculates grid layout with stability guarantees.
 * Only recalculates on:
 * - Window resize (debounced)
 * - Card size change (user-initiated)
 *
 * NEVER recalculates on:
 * - Data loading/refetch
 * - Filter changes
 * - Show/hide toggle
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { calculateGridLayout, GridLayout } from '../utils/gridCalculations';

interface UseStableGridLayoutOptions {
  cardSize: number;
  resizeDebounce?: number;
}

export function useStableGridLayout(
  containerRef: RefObject<HTMLElement>,
  options: UseStableGridLayoutOptions
): GridLayout | null {
  const { cardSize, resizeDebounce = 150 } = options;

  // Store layout in state
  const [layout, setLayout] = useState<GridLayout | null>(null);

  // Track container width in ref (doesn't trigger re-renders)
  const containerWidthRef = useRef<number>(0);

  // Measure and update layout
  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;

    // Only update if width actually changed
    if (width !== containerWidthRef.current) {
      containerWidthRef.current = width;
      setLayout(calculateGridLayout(width, cardSize));
    }
  }, [containerRef, cardSize]);

  // Initial measurement
  useEffect(() => {
    updateLayout();
  }, [updateLayout]);

  // Recalculate when card size changes
  useEffect(() => {
    if (containerWidthRef.current > 0) {
      setLayout(calculateGridLayout(containerWidthRef.current, cardSize));
    }
  }, [cardSize]);

  // Listen for window resize (debounced)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateLayout, resizeDebounce);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [updateLayout, resizeDebounce]);

  return layout;
}
```

**Step 2: Commit**

```bash
git add client/src/pages/SeriesPage/hooks/useStableGridLayout.ts
git commit -m "feat(series-page): add useStableGridLayout hook with resize handling"
```

---

### Task 3.3: Create useVirtualWindow Hook

**Files:**
- Create: `client/src/pages/SeriesPage/hooks/useVirtualWindow.ts`

**Step 1: Implement useVirtualWindow.ts**

Create `client/src/pages/SeriesPage/hooks/useVirtualWindow.ts`:

```typescript
/**
 * useVirtualWindow Hook
 *
 * Handles scroll-based virtualization.
 * Returns which items to render based on scroll position.
 */

import { useState, useEffect, useCallback, RefObject } from 'react';
import { calculateVisibleRange, GridLayout, VisibleRange } from '../utils/gridCalculations';

interface VirtualItem<T> {
  data: T;
  index: number;
  style: React.CSSProperties;
}

interface UseVirtualWindowOptions {
  overscanRows?: number;
  scrollThrottle?: number;
}

interface UseVirtualWindowReturn<T> {
  visibleItems: VirtualItem<T>[];
  totalHeight: number;
  isScrolling: boolean;
}

const DEFAULT_OVERSCAN = 2;
const SCROLL_THROTTLE = 16; // ~60fps
const SCROLL_END_DELAY = 150;

export function useVirtualWindow<T extends { id: string }>(
  containerRef: RefObject<HTMLElement>,
  items: T[],
  layout: GridLayout | null,
  options: UseVirtualWindowOptions = {}
): UseVirtualWindowReturn<T> {
  const { overscanRows = DEFAULT_OVERSCAN, scrollThrottle = SCROLL_THROTTLE } = options;

  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ startIndex: 0, endIndex: 0 });
  const [isScrolling, setIsScrolling] = useState(false);

  // Calculate visible range on scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const newRange = calculateVisibleRange(
      scrollTop,
      viewportHeight,
      layout,
      items.length,
      overscanRows
    );

    setVisibleRange((prev) => {
      // Only update if range actually changed
      if (prev.startIndex === newRange.startIndex && prev.endIndex === newRange.endIndex) {
        return prev;
      }
      return newRange;
    });
  }, [containerRef, layout, items.length, overscanRows]);

  // Set up scroll listener with throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;
    let rafId: number;
    let scrollEndTimeout: ReturnType<typeof setTimeout>;

    const onScroll = () => {
      const now = Date.now();
      setIsScrolling(true);

      // Clear previous scroll end timeout
      clearTimeout(scrollEndTimeout);

      // Throttle updates
      if (now - lastScrollTime >= scrollThrottle) {
        lastScrollTime = now;
        rafId = requestAnimationFrame(handleScroll);
      }

      // Set scroll end timeout
      scrollEndTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, SCROLL_END_DELAY);
    };

    container.addEventListener('scroll', onScroll, { passive: true });

    // Initial calculation
    handleScroll();

    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
      clearTimeout(scrollEndTimeout);
    };
  }, [containerRef, handleScroll, scrollThrottle]);

  // Recalculate when layout changes
  useEffect(() => {
    handleScroll();
  }, [layout, handleScroll]);

  // Build visible items array
  const visibleItems: VirtualItem<T>[] = [];

  if (layout) {
    for (let i = visibleRange.startIndex; i < visibleRange.endIndex && i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      const position = layout.getItemPosition(i);

      visibleItems.push({
        data: item,
        index: i,
        style: {
          position: 'absolute',
          width: layout.itemWidth,
          height: layout.itemHeight,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        },
      });
    }
  }

  const totalHeight = layout?.getTotalHeight(items.length) ?? 0;

  return {
    visibleItems,
    totalHeight,
    isScrolling,
  };
}
```

**Step 2: Commit**

```bash
git add client/src/pages/SeriesPage/hooks/useVirtualWindow.ts
git commit -m "feat(series-page): add useVirtualWindow hook for virtualization"
```

---

## Summary: Remaining Tasks

This plan covers the foundation phases (1-3). The remaining phases are:

- **Phase 4:** SeriesCard component (simplified, memoized)
- **Phase 5:** SeriesVirtualGrid component (assembles the grid)
- **Phase 6:** SeriesToolbar component (filter controls)
- **Phase 7:** Selection + BulkActionBar
- **Phase 8:** SeriesContextMenu
- **Phase 9:** Preset integration (server-side)
- **Phase 10:** Polish (loading states, empty states, route switching)

Each phase follows the same pattern: failing test → implementation → passing test → commit.

---

## Execution Notes

1. **Run tests frequently:** After each step, verify tests pass before moving on
2. **Commit after each task:** Small, focused commits make review easier
3. **Keep old page running:** Don't touch SeriesBrowserPage until new page is ready
4. **Switch routes last:** Only update App.tsx routes when all features work
