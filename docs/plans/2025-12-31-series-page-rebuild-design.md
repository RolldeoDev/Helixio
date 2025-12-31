# Series Page Rebuild Design

**Date:** 2025-12-31
**Status:** Approved
**Scope:** Full rebuild of `/series` page

## Overview

Rebuild the SeriesBrowserPage from scratch to fix layout bugs, improve performance, and enable URL-based filtering for deep links and bookmarkable views.

### Goals

1. **Fix layout bugs** - "Show hidden" toggle causing single-column collapse; general layout shift during data refresh
2. **Improve performance** - Reduce filtering/sorting delay; fix scroll jank at medium card sizes
3. **Enable URL filtering** - Deep links from other pages; bookmarkable/shareable filter states; smart filter preset support

### Non-Goals

- Browser back/forward navigation for filter changes (URL uses `replaceState`, not `pushState`)
- Client-side smart filter evaluation (all filtering server-side)

## Architecture

### State-Driven with URL Snapshot

Filter state is the master. The URL is a reflection, not the driver.

**Page Load:**
1. Parse URL params (if any) → initialize filter state
2. If `?preset=abc` → fetch preset server-side, use as filter
3. Filter state → API request → render grid

**User Interaction:**
1. User changes filter → update filter state
2. Filter state change triggers:
   - API request (immediate)
   - URL update (debounced, as snapshot)

### Component Structure

```
SeriesPage (route component)
├── useSeriesFilters()         ← Filter state + actions (reducer-based)
├── useSeriesData()            ← Data fetching, reacts to filter state
├── useUrlSnapshot()           ← Syncs filter state → URL (debounced)
├── SeriesToolbar              ← Filter controls, sort, view options
├── SeriesVirtualGrid          ← Virtualized grid rendering
│   └── SeriesCard             ← Individual card (simplified)
└── SeriesBulkActions          ← Selection-based actions
```

### State Ownership

| Owner | Manages |
|-------|---------|
| `useSeriesFilters()` | All filter/sort state, preset loading |
| `useSeriesData()` | API data, loading/error states |
| `useUrlSnapshot()` | URL synchronization (read on init, write on change) |
| Local `useState` | Selection, modals, scroll position, UI-only state |

## Filter State Structure

```typescript
type SeriesFilterState = {
  // Core filters
  search: string;
  publisher: string | null;
  type: 'western' | 'manga' | null;
  hasUnread: boolean | null;
  showHidden: boolean;
  libraryId: string | null;  // null = all libraries

  // Sorting
  sortBy: 'name' | 'startYear' | 'updatedAt' | 'issueCount';
  sortOrder: 'asc' | 'desc';

  // Smart filter preset (mutually exclusive with above filters)
  presetId: string | null;

  // View preferences (not sent to API, but persisted to URL)
  cardSize: number;  // 1-10 slider value
};
```

### Mutual Exclusivity Rule

When `presetId` is set:
- Core filters are ignored for API calls
- UI shows "Using preset: [name]" indicator
- User can clear preset to return to manual filtering

When core filters are used:
- `presetId` is null
- Changing any filter clears any previous preset

### useSeriesFilters() Hook API

```typescript
const {
  filters,              // Current filter state
  setFilter,            // (key, value) => update single filter
  setFilters,           // (partial) => update multiple filters
  clearFilters,         // Reset to defaults
  loadPreset,           // (presetId) => fetch and apply preset
  clearPreset,          // Exit preset mode
} = useSeriesFilters(initialFromUrl);
```

## Virtual Grid & Layout Stability

### Layout Stability Strategy

The current bugs happen because:
- Container width gets re-measured during data transitions
- Measurements happen at wrong times (during loading states)
- Multiple things trigger recalculation unpredictably

### New Approach

1. **Measure container once on mount**, store in ref
2. **Only re-measure on:**
   - Window resize (debounced)
   - Card size slider change (user-initiated)
   - Explicit layout recalc request
3. **Never re-measure on:**
   - Data loading/refetch
   - Filter changes
   - Show/hide toggle

### Grid Component Structure

```typescript
function SeriesVirtualGrid({ items, cardSize, isLoading }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useStableGridLayout(containerRef, cardSize);
  //                ^ Only recalcs on resize or cardSize change

  const visibleItems = useVirtualWindow(items, layout, scrollTop);
  //                    ^ Calculates which items to render

  return (
    <div ref={containerRef} style={{ height: layout.totalHeight }}>
      {isLoading && <LoadingOverlay />}

      {visibleItems.map(item => (
        <SeriesCard
          key={item.id}
          style={{ transform: `translate3d(${item.x}px, ${item.y}px, 0)` }}
        />
      ))}
    </div>
  );
}
```

### Key Difference from Current Implementation

Current: ResizeObserver + scroll handler + data changes all trigger layout recalc

New: Layout is "locked" during data transitions. Container dimensions are cached. Only user actions (resize, slider) trigger remeasurement.

## Performance Optimizations

### Filtering/Sorting Response Time

**Optimistic UI + background fetch:**

```
User clicks filter
    ↓
Immediately: Show loading indicator on grid (not full spinner)
    ↓
Keep current items visible but dimmed
    ↓
API returns → swap in new items
```

No blank state. No layout collapse.

**Additional speedups:**
- Debounce search input (300ms) but instant for dropdowns/toggles
- Cancel in-flight requests when filter changes again
- Prefetch publishers list on page load

### Scroll Performance at Medium Sizes

1. **Reduce card complexity during scroll**
   - Add `isScrolling` state to grid
   - Cards render simplified version while scrolling
   - Full render resumes 150ms after scroll stops

2. **Increase overscan strategically**
   - Overscan based on scroll velocity (faster scroll = more buffer)

3. **Card rendering budget**
   - Limit concurrent image loads (max 6 at a time)
   - Prioritize visible viewport over overscan

4. **Memoization boundaries**
   - Card only re-renders if its own data changes
   - Grid item wrapper handles position, card handles content

## URL Snapshot Synchronization

### URL Parameter Schema

```
/series                                    # Default view
/series?search=batman                      # Search
/series?publisher=DC+Comics&sortBy=name    # Filtered + sorted
/series?preset=abc123                      # Smart filter preset
/series?cardSize=5                         # View preference
```

| Param | Type | Default |
|-------|------|---------|
| `search` | string | (empty) |
| `publisher` | string | (empty) |
| `type` | `western` \| `manga` | (empty) |
| `hasUnread` | `true` \| `false` | (empty) |
| `showHidden` | `true` | `false` |
| `libraryId` | string | (empty = all) |
| `sortBy` | string | `name` |
| `sortOrder` | `asc` \| `desc` | `asc` |
| `preset` | string | (empty) |
| `cardSize` | `1`-`10` | `5` |

### useUrlSnapshot() Hook

```typescript
function useUrlSnapshot(filters, setFilters) {
  // On mount only: parse URL → initialize state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.has('preset')) {
      loadPreset(params.get('preset'));
    } else {
      setFilters(parseUrlToFilters(params));
    }
  }, []);

  // On filter change: update URL (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const url = filtersToUrl(filters);
      window.history.replaceState({}, '', url);
    }, 500);
    return () => clearTimeout(timeout);
  }, [filters]);
}
```

Uses `replaceState` not `pushState` - doesn't pollute browser history.

## SeriesCard Component

### Core Principle

Cards are dumb. They receive data, render it, report interactions. No internal state management.

### Props Interface

```typescript
type SeriesCardProps = {
  item: GridItem;
  isSelected: boolean;
  isScrolling: boolean;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onContextMenu: (id: string, event: React.MouseEvent) => void;
  style: React.CSSProperties;
};
```

### Rendering Modes

| Mode | When | What renders |
|------|------|--------------|
| **Scrolling** | `isScrolling=true` | Cover image, title only |
| **Compact** | `cardSize >= 7` | Cover, title, issue count |
| **Full** | `cardSize < 7` | Everything: cover, title, progress ring, badges, hover actions |

### Image Loading Strategy

```typescript
const imageQueue = new ConcurrencyQueue(6);

function useCardImage(coverUrl: string, isVisible: boolean) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    return imageQueue.add(coverUrl, () => setLoaded(true));
  }, [coverUrl, isVisible]);

  return loaded;
}
```

### Memoization

```typescript
export const SeriesCard = memo(SeriesCardInner, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.updatedAt === next.item.updatedAt &&
    prev.isSelected === next.isSelected &&
    prev.isScrolling === next.isScrolling &&
    prev.style.transform === next.style.transform
  );
});
```

### Context Menu

Card stays dumb - just reports clicks:

```typescript
onContextMenu={(e) => {
  e.preventDefault();
  onContextMenu(item.id, e);
}}
```

Parent handles menu rendering and action execution.

## Selection & Bulk Actions

### Selection State

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const selection = {
  ids: selectedIds,
  count: selectedIds.size,
  has: (id: string) => selectedIds.has(id),
  toggle: (id: string) => { /* add or remove */ },
  selectRange: (fromId: string, toId: string, allIds: string[]) => { /* shift+click */ },
  clear: () => setSelectedIds(new Set()),
  selectAll: (allIds: string[]) => setSelectedIds(new Set(allIds)),
};
```

### Click Handling

| Click Type | Behavior |
|------------|----------|
| Click card | Navigate to series |
| Ctrl/Cmd + Click | Toggle selection |
| Shift + Click | Select range from last selected |
| Checkbox click | Toggle selection (no navigation) |
| Right-click | Select if not selected, show context menu |

### Bulk Action Bar

Appears when `selection.count > 0`. Sticky at bottom of viewport.

**Action Execution Pattern:**
1. Call API with `selectedIds` array
2. Show loading state on bar (not full page)
3. On success: clear selection, show toast, refresh data
4. On error: show toast, keep selection (user can retry)

## SeriesToolbar

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Search box]    [Publisher ▼] [Type ▼] [Unread ▼] [Sort ▼]  ⚙️ │
│                                                                 │
│ Active: "DC Comics" ✕  |  "Has Unread" ✕  |  Clear all         │
└─────────────────────────────────────────────────────────────────┘
```

### Preset Mode

When preset is active:

```
┌─────────────────────────────────────────────────────┐
│  📋 Using preset: "DC Unread"  [Clear]    [⚙️ Size] │
└─────────────────────────────────────────────────────┘
```

No filter dropdowns shown - preset controls everything.

### Search Behavior

- Debounced (300ms) before triggering API
- Shows spinner in input while searching
- Escape key clears search

## Data Fetching

### useSeriesData() Hook

```typescript
const {
  items,          // GridItem[]
  total,          // Total count
  isLoading,      // Initial load
  isFetching,     // Background refetch
  error,          // Error state
  refetch,        // Manual refetch trigger
} = useSeriesData(filters);
```

### Loading vs Fetching

| State | `isLoading` | `isFetching` | UI Behavior |
|-------|-------------|--------------|-------------|
| Initial load | `true` | `true` | Full skeleton grid |
| Has data, idle | `false` | `false` | Normal render |
| Has data, refetching | `false` | `true` | Dim current items, no layout change |

### Implementation

```typescript
function useSeriesData(filters: SeriesFilterState) {
  return useQuery({
    queryKey: ['series', 'grid', filtersToQueryKey(filters)],
    queryFn: ({ signal }) => fetchSeriesGrid(filters, signal),
    staleTime: 30_000,
    keepPreviousData: true,   // Keep showing old data while fetching
    refetchOnWindowFocus: false,
  });
}
```

`keepPreviousData: true` prevents blank states during filter changes.

## Error Handling & Loading States

### State Machine

```
                    ┌─────────────┐
      (mount)──────▶│   LOADING   │ Full skeleton grid
                    └──────┬──────┘
                           │ success
                           ▼
                    ┌─────────────┐
         ┌─────────│    READY    │ Normal render
         │         └──────┬──────┘
         │                │ filter change
         │                ▼
         │         ┌─────────────┐
         │         │  FETCHING   │ Dimmed grid, no layout change
         │         └──────┬──────┘
         │                │ success
         │                ▼
         │         (back to READY)
         │
         │ error
         ▼
   ┌─────────────┐
   │    ERROR    │ Error message + retry button
   └─────────────┘
```

### Fetching State CSS

```css
.series-grid.is-fetching {
  opacity: 0.6;
  pointer-events: none;
}
```

Current items stay visible, just dimmed. No spinners, no layout changes.

## Smart Filter Preset Integration

**All filtering happens server-side.** The client stays thin.

### API Contract

```
GET /api/series/grid?preset=abc123&sortBy=name&sortOrder=asc
```

When `preset` param is present:
- Server loads preset by ID
- Server builds database query from preset conditions
- Server ignores other filter params (mutual exclusivity)
- Returns filtered + sorted results

### Server-Side Implementation

```typescript
if (query.preset) {
  const preset = await prisma.smartFilterPreset.findUnique({
    where: { id: query.preset }
  });

  const whereClause = buildWhereFromConditions(preset.conditions, preset.logic);

  return prisma.series.findMany({
    where: whereClause,
    orderBy: { [sortBy]: sortOrder },
  });
}
```

### Condition → SQL Translation

| Condition | SQL |
|-----------|-----|
| `publisher equals "DC"` | `WHERE publisher = 'DC'` |
| `startYear greater_than 2020` | `WHERE startYear > 2020` |
| `name contains "Batman"` | `WHERE name LIKE '%Batman%'` |
| `genres is_empty` | `WHERE genres IS NULL OR genres = ''` |
| Multiple conditions (AND) | Combine with `AND` |
| Multiple conditions (OR) | Combine with `OR` |

### Client Implementation

```typescript
function useSeriesData(filters) {
  const params = filters.presetId
    ? { preset: filters.presetId, sortBy, sortOrder }
    : { search, publisher, type, ... };

  return useQuery({
    queryKey: ['series', 'grid', params],
    queryFn: () => fetchSeriesGrid(params),
  });
}
```

Client doesn't know or care about preset conditions - just passes the ID.

## File Structure

```
client/src/pages/SeriesPage/
├── SeriesPage.tsx              # Main page component
├── index.ts                    # Export
├── hooks/
│   ├── useSeriesFilters.ts     # Filter state management
│   ├── useSeriesData.ts        # Data fetching
│   ├── useUrlSnapshot.ts       # URL synchronization
│   ├── useStableGridLayout.ts  # Layout calculations
│   └── useVirtualWindow.ts     # Virtualization logic
├── components/
│   ├── SeriesToolbar.tsx       # Filter controls
│   ├── SeriesVirtualGrid.tsx   # Grid container
│   ├── SeriesCard.tsx          # Individual card
│   ├── SeriesContextMenu.tsx   # Right-click menu
│   ├── BulkActionBar.tsx       # Selection actions
│   ├── SkeletonCard.tsx        # Loading placeholder
│   └── EmptyState.tsx          # No results view
└── utils/
    ├── filterUtils.ts          # Filter parsing/serialization
    └── gridCalculations.ts     # Pure layout math functions
```

## Implementation Order

| Phase | What | Why First |
|-------|------|-----------|
| 1 | `useSeriesFilters` + `useUrlSnapshot` | Foundation - everything depends on filter state |
| 2 | `useSeriesData` | Connect filters to API |
| 3 | `useStableGridLayout` + `useVirtualWindow` | Core rendering without layout bugs |
| 4 | `SeriesCard` (simplified) | Render actual content |
| 5 | `SeriesVirtualGrid` | Assemble the grid |
| 6 | `SeriesToolbar` | User can now filter |
| 7 | Selection + `BulkActionBar` | Multi-select actions |
| 8 | `SeriesContextMenu` | Right-click actions |
| 9 | Preset integration | URL preset loading |
| 10 | Polish: loading states, empty states, transitions | Final touches |

### Migration Strategy

Build as `SeriesPage` in new directory. Current `SeriesBrowserPage` stays untouched until new page is ready. Switch routes when complete.
