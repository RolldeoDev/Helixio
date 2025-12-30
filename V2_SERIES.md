# Objective

  Rebuild the /series page as a high-performance series browser (/series-v2) optimized for 5,000+ series. The old series page is slow; this rebuild uses proven patterns from the Library page.

# Core Principles

  1. Performance First: Virtual rendering, cursor-based pagination, minimal re-renders
  2. Incremental Feature Addition: MVP is grid-only; filters, sorting, selection added later
  3. Pattern Reuse: Leverage existing useVirtualGrid hook and component patterns

# Architecture

## Backend

  - Cursor-based pagination (keyset, not offset) for stable infinite scroll
  - Endpoint: GET /api/series/browse?cursor=&limit=100
  - Returns minimal data: id, name, startYear, publisher, coverHash, coverSource, coverFileId, firstIssueId, firstIssueCoverHash, issueCount, readCount
## Frontend

  - Virtual Grid: Only renders visible items + overscan rows
  - Infinite Query: React Query useInfiniteQuery with cursor pagination
  - Minimal Card Component: Lightweight, memoized, no unnecessary props

## Key Files

  | Purpose               | File                                                                               |
  |-----------------------|------------------------------------------------------------------------------------|
  | Virtual grid hook     | client/src/hooks/useVirtualGrid.ts                                                 |
  | Infinite query hook   | client/src/hooks/queries/useSeriesBrowse.ts                                        |
  | Series card component | client/src/components/MinimalSeriesCard/MinimalSeriesCard.tsx                      |
  | Series card styles    | client/src/components/MinimalSeriesCard/MinimalSeriesCard.css                      |
  | Browser page          | client/src/pages/SeriesBrowserPage.tsx                                             |
  | Browser page styles   | client/src/pages/SeriesBrowserPage.css                                             |
  | API types & client    | client/src/services/api/series.ts (search for SeriesBrowseItem)                    |
  | Backend service       | server/src/services/series/series-crud.service.ts (search for getSeriesBrowseList) |
  | Backend route         | server/src/routes/series.routes.ts (search for /browse)                            |

## Reference Patterns

  | Pattern                       | Reference File                                                            |
  |-------------------------------|---------------------------------------------------------------------------|
  | Working virtual grid usage    | client/src/pages/LibraryPage.tsx                                          |
  | Cover card with full features | client/src/components/CoverCard/CoverCard.tsx                             |
  | Progress ring component       | client/src/components/Progress/ProgressRing.tsx                           |
  | Image caching detection       | client/src/components/SeriesCoverCard/SeriesCoverCard.tsx (lines 283-297) |

# Completed Work

  - Backend cursor-based pagination endpoint
  - Frontend API client and types
  - useSeriesBrowse infinite query hook
  - MinimalSeriesCard component with:
    - Image ref + caching detection (fixes onLoad not firing for cached images)
    - ProgressRing with percentage label (upper right)
    - Info section: Title, Publisher, Year (fixed 56px height)
    - Hover effects: card border/shadow, cover image zoom
    - Memoization comparing id, readCount, coverHash, transform, width, height
  - SeriesBrowserPage with virtual grid and infinite scroll
  - Route registered at /series-v2

# Known Issues & Solutions

  Image Loading Bug: Images must use ref + img.complete check to detect cached images. The onLoad event doesn't reliably fire for cached images. See MinimalSeriesCard.tsx lines 74-90.

  First Card Sizing Bug: Memoization must include style.width and style.height, not just style.transform. The first card at (0,0) has identical transform regardless of size.

# Future Phases (Not Yet Implemented)

  - Phase 2: Sorting (name, year, updated)
  - Phase 3: Filters (publisher, type, genres, read status)
  - Phase 4: Selection and bulk actions
  - Phase 5: Context menus
  - Phase 6: Replace /series route with new implementation

# Performance Techniques Applied

  | Technique               | Implementation                                     |
  |-------------------------|----------------------------------------------------|
  | Cursor pagination       | Keyset pagination for stable results               |
  | Virtual rendering       | useVirtualGrid with RAF-throttled scroll           |
  | Minimal data transfer   | Only fetch fields needed for display               |
  | Image caching detection | Ref + img.complete check                           |
  | Memoization             | Custom areEqual function (6 fields)                |
  | GPU acceleration        | CSS transforms, contain: layout style paint        |
  | Scroll state class      | .scrolling disables animations/hover during scroll |
  | Overscan rows           | 3 extra rows rendered for smooth scroll            |

# Testing

  Run npm run build to verify TypeScript compilation. The page is accessible at /series-v2 in the running app