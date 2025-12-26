/**
 * Global Search Service
 *
 * Provides unified search across series, issues, and creators for the global search bar.
 * - LRU cache for fast repeated searches
 * - Parallel queries across entity types
 * - Relevance scoring for result ranking
 */

import { getDatabase } from './database.service.js';
import { LRUCache } from './lru-cache.service.js';

// =============================================================================
// Types
// =============================================================================

export interface GlobalSearchResult {
  id: string;
  type: 'series' | 'issue' | 'creator';
  title: string;
  subtitle: string;
  thumbnailId: string | null;
  thumbnailType: 'file' | 'series' | 'none';
  navigationPath: string;
  relevanceScore: number;
  metadata: {
    publisher?: string | null;
    year?: number | null;
    issueNumber?: string | null;
    role?: string | null;
  };
}

export interface GlobalSearchOptions {
  limit?: number;
  types?: ('series' | 'issue' | 'creator')[];
  libraryId?: string;
}

export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  query: string;
  timing: number;
}

// =============================================================================
// Cache
// =============================================================================

// LRU cache for search results (5 minute TTL, 500 entries max)
const searchCache = new LRUCache<GlobalSearchResult[]>({
  maxSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});

// =============================================================================
// Relevance Scoring
// =============================================================================

/**
 * Calculate relevance score using prefix matching and name similarity
 * Higher scores = better matches
 */
function calculateRelevance(
  value: string,
  query: string,
  type: 'series' | 'issue' | 'creator'
): number {
  const valueLower = value.toLowerCase();
  const queryLower = query.toLowerCase();

  // Base score by type priority
  let score = type === 'series' ? 100 : type === 'issue' ? 80 : 60;

  // Exact match bonus
  if (valueLower === queryLower) {
    score += 50;
  }
  // Starts with query bonus
  else if (valueLower.startsWith(queryLower)) {
    score += 30;
  }
  // Contains query
  else if (valueLower.includes(queryLower)) {
    score += 10;
  }

  // Shorter names get a small bonus (more likely to be what user wants)
  const lengthPenalty = Math.min(value.length / 100, 0.2);
  score -= lengthPenalty * 10;

  return score;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search series by name and aliases
 */
async function searchSeries(
  query: string,
  limit: number,
  libraryId?: string
): Promise<GlobalSearchResult[]> {
  const db = getDatabase();
  const queryLower = query.toLowerCase();

  // Build where clause
  const whereClause: Record<string, unknown> = {
    deletedAt: null,
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { aliases: { contains: query, mode: 'insensitive' } },
    ],
  };

  // Filter by library if specified
  if (libraryId) {
    whereClause.issues = { some: { libraryId } };
  }

  const series = await db.series.findMany({
    where: whereClause,
    include: {
      issues: {
        take: 1,
        orderBy: { filename: 'asc' },
        select: { id: true },
      },
    },
    take: limit * 2, // Fetch more to account for filtering
  });

  return series.map((s) => {
    // Determine thumbnail source
    let thumbnailId: string | null = null;
    let thumbnailType: 'file' | 'series' | 'none' = 'none';

    if (s.coverHash) {
      thumbnailId = s.id;
      thumbnailType = 'series';
    } else if (s.coverFileId) {
      thumbnailId = s.coverFileId;
      thumbnailType = 'file';
    } else if (s.issues[0]?.id) {
      thumbnailId = s.issues[0].id;
      thumbnailType = 'file';
    }

    // Build subtitle
    const subtitleParts: string[] = [];
    if (s.publisher) subtitleParts.push(s.publisher);
    if (s.startYear) subtitleParts.push(String(s.startYear));
    const subtitle = subtitleParts.join(' \u2022 ');

    return {
      id: s.id,
      type: 'series' as const,
      title: s.name,
      subtitle,
      thumbnailId,
      thumbnailType,
      navigationPath: `/series/${s.id}`,
      relevanceScore: calculateRelevance(s.name, queryLower, 'series'),
      metadata: {
        publisher: s.publisher,
        year: s.startYear,
      },
    };
  });
}

/**
 * Search issues/files by filename and metadata
 */
async function searchIssues(
  query: string,
  limit: number,
  libraryId?: string
): Promise<GlobalSearchResult[]> {
  const db = getDatabase();
  const queryLower = query.toLowerCase();

  // Build where clause
  const whereClause: Record<string, unknown> = {
    OR: [
      { filename: { contains: query, mode: 'insensitive' } },
      { metadata: { series: { contains: query, mode: 'insensitive' } } },
      { metadata: { title: { contains: query, mode: 'insensitive' } } },
    ],
  };

  if (libraryId) {
    whereClause.libraryId = libraryId;
  }

  const files = await db.comicFile.findMany({
    where: whereClause,
    include: {
      metadata: true,
      series: { select: { name: true } },
    },
    take: limit * 2,
  });

  return files.map((f) => {
    // Build title from metadata or filename
    let title: string;
    if (f.metadata?.series) {
      title = f.metadata.number
        ? `${f.metadata.series} #${f.metadata.number}`
        : f.metadata.series;
    } else {
      title = f.filename.replace(/\.cb[rz7t]$/i, '');
    }

    // Build subtitle
    const subtitleParts: string[] = [];
    if (f.metadata?.writer) subtitleParts.push(f.metadata.writer.split(',')[0] || '');
    if (f.metadata?.year) subtitleParts.push(String(f.metadata.year));
    const subtitle = subtitleParts.filter(Boolean).join(' \u2022 ');

    return {
      id: f.id,
      type: 'issue' as const,
      title,
      subtitle,
      thumbnailId: f.id,
      thumbnailType: 'file' as const,
      navigationPath: `/issue/${f.id}`,
      relevanceScore: calculateRelevance(title, queryLower, 'issue'),
      metadata: {
        publisher: f.metadata?.publisher,
        year: f.metadata?.year,
        issueNumber: f.metadata?.number,
      },
    };
  });
}

/**
 * Search creators from TagValue table
 */
async function searchCreators(
  query: string,
  limit: number
): Promise<GlobalSearchResult[]> {
  const db = getDatabase();
  const queryLower = query.toLowerCase();

  // Creator field types
  const creatorTypes = [
    'writers',
    'pencillers',
    'inkers',
    'colorists',
    'letterers',
    'coverArtists',
    'editors',
  ];

  const results = await db.tagValue.findMany({
    where: {
      fieldType: { in: creatorTypes },
      valueLower: { contains: queryLower },
    },
    take: limit * 3, // Fetch more to deduplicate
    distinct: ['valueLower'],
    orderBy: { valueLower: 'asc' },
  });

  // Deduplicate by name and aggregate roles
  const creatorMap = new Map<string, { roles: Set<string>; value: string }>();
  for (const r of results) {
    const key = r.valueLower;
    if (!creatorMap.has(key)) {
      creatorMap.set(key, { roles: new Set([r.fieldType]), value: r.value });
    } else {
      creatorMap.get(key)!.roles.add(r.fieldType);
    }
  }

  // Format roles for display
  const formatRole = (role: string): string => {
    const roleMap: Record<string, string> = {
      writers: 'Writer',
      pencillers: 'Penciller',
      inkers: 'Inker',
      colorists: 'Colorist',
      letterers: 'Letterer',
      coverArtists: 'Cover Artist',
      editors: 'Editor',
    };
    return roleMap[role] || role;
  };

  return Array.from(creatorMap.values())
    .slice(0, limit)
    .map((c) => {
      const roles = Array.from(c.roles).map(formatRole);
      const subtitle = roles.slice(0, 2).join(', ') + (roles.length > 2 ? '...' : '');

      return {
        id: `creator:${c.value}`,
        type: 'creator' as const,
        title: c.value,
        subtitle,
        thumbnailId: null,
        thumbnailType: 'none' as const,
        navigationPath: `/stats/creator/${encodeURIComponent(c.value)}`,
        relevanceScore: calculateRelevance(c.value, queryLower, 'creator'),
        metadata: {
          role: roles.join(', '),
        },
      };
    });
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Unified global search across series, issues, and creators
 */
export async function globalSearch(
  query: string,
  options: GlobalSearchOptions = {}
): Promise<GlobalSearchResponse> {
  const startTime = Date.now();
  const { limit = 6, types = ['series', 'issue', 'creator'], libraryId } = options;
  const queryTrimmed = query.trim();

  // Early return for short queries
  if (queryTrimmed.length < 2) {
    return { results: [], query: queryTrimmed, timing: 0 };
  }

  // Check cache
  const cacheKey = `${queryTrimmed.toLowerCase()}:${limit}:${types.join(',')}:${libraryId || 'all'}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return {
      results: cached,
      query: queryTrimmed,
      timing: Date.now() - startTime,
    };
  }

  // Run searches in parallel
  const searchPromises: Promise<GlobalSearchResult[]>[] = [];

  if (types.includes('series')) {
    searchPromises.push(searchSeries(queryTrimmed, limit, libraryId));
  }
  if (types.includes('issue')) {
    searchPromises.push(searchIssues(queryTrimmed, limit, libraryId));
  }
  if (types.includes('creator')) {
    searchPromises.push(searchCreators(queryTrimmed, limit));
  }

  const searchResults = await Promise.all(searchPromises);

  // Merge and sort by relevance
  const allResults: GlobalSearchResult[] = searchResults.flat();
  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Take top results
  const finalResults = allResults.slice(0, limit);

  // Cache results
  searchCache.set(cacheKey, finalResults);

  return {
    results: finalResults,
    query: queryTrimmed,
    timing: Date.now() - startTime,
  };
}

/**
 * Clear the search cache (useful after metadata updates)
 */
export function clearSearchCache(): void {
  searchCache.clear();
}

/**
 * Get cache statistics
 */
export function getSearchCacheStats() {
  return searchCache.getStats();
}
