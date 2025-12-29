/**
 * Metadata Search Service
 *
 * Unified service for searching comic metadata across multiple sources.
 * Implements the search strategy: ComicVine first, Metron as fallback.
 * Includes confidence scoring for matching results.
 */

import { getMetadataSettings, hasApiKey } from './config.service.js';
import * as comicVine from './comicvine.service.js';
import * as metron from './metron.service.js';
import { isMetronAvailable, getSeriesName } from './metron.service.js';
import * as anilist from './anilist.service.js';
import * as jikan from './jikan.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { logError } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export type MetadataSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';

/** Library content type */
export type LibraryType = 'western' | 'manga';

/**
 * Check if a metadata source is available (configured with credentials if needed).
 * ComicVine requires API key, Metron requires username/password.
 * AniList and MAL are free public APIs and always available.
 */
export function isSourceAvailable(source: MetadataSource): boolean {
  switch (source) {
    case 'anilist':
    case 'mal':
      // Free public APIs - always available
      return true;
    case 'metron':
      // Requires credentials
      return isMetronAvailable();
    case 'comicvine':
      // Requires API key
      return hasApiKey('comicVine');
    case 'gcd':
      // GCD doesn't require auth but isn't implemented yet, return false
      return false;
    default:
      return false;
  }
}

/**
 * Get prioritized sources based on library type.
 * Manga libraries use only AniList/MAL (manga-specific sources).
 * Western libraries use ComicVine/Metron (western-comic sources).
 * Unconfigured sources are automatically filtered out.
 */
export function getSourcesForLibraryType(libraryType: LibraryType): MetadataSource[] {
  if (libraryType === 'manga') {
    // For manga libraries, ONLY use manga-specific sources (AniList/MAL).
    // ComicVine, Metron, and GCD are western comic databases and don't have manga data.
    const mangaSources: MetadataSource[] = ['anilist', 'mal'];
    return mangaSources.filter(isSourceAvailable);
  }

  // For western comics, prioritize ComicVine/Metron
  const settings = getMetadataSettings();
  const enabledSources = settings.enabledSources || ['comicvine', 'metron'];
  const westernSources: MetadataSource[] = ['comicvine', 'metron', 'gcd'];

  // Only include configured and enabled western sources
  return westernSources
    .filter((s) => enabledSources.includes(s))
    .filter(isSourceAvailable);
}

export interface SearchQuery {
  /** Series/volume name */
  series?: string;
  /** Issue number */
  issueNumber?: string;
  /** Publisher name */
  publisher?: string;
  /** Year of publication */
  year?: number;
  /** Writer name */
  writer?: string;
}

/** Credit entry with optional count and extended fields */
export interface SeriesCredit {
  id: number;
  name: string;
  count?: number;
  // Extended fields (populated by AniList)
  alternativeNames?: string[];  // Pen names, aliases
  nativeName?: string;          // Name in native language
  profileUrl?: string;          // Link to source profile page
  imageUrl?: string;            // Portrait/avatar image
}

export interface SeriesMatch {
  source: MetadataSource;
  sourceId: string;
  name: string;
  startYear?: number;
  endYear?: number;
  publisher?: string;
  issueCount?: number;
  description?: string;
  coverUrl?: string;
  confidence: number;
  url?: string;

  // Extended fields for expanded series info
  aliases?: string[];
  shortDescription?: string; // deck from ComicVine
  seriesType?: string; // from Metron: "Ongoing Series", "Limited Series", etc.
  volume?: number; // volume number from Metron
  firstIssueNumber?: string;
  lastIssueNumber?: string;
  imageUrls?: {
    thumb?: string;
    small?: string;
    medium?: string;
  };

  // Rich series data from ComicVine
  characters?: SeriesCredit[]; // Characters appearing in the series
  creators?: SeriesCredit[]; // Writers, artists, etc.
  locations?: SeriesCredit[]; // Locations featured
  objects?: SeriesCredit[]; // Notable objects/items
}

export interface IssueMatch {
  source: MetadataSource;
  sourceId: string;
  seriesId: string;
  seriesName: string;
  number: string;
  title?: string;
  coverDate?: string;
  publisher?: string;
  coverUrl?: string;
  confidence: number;
  url?: string;
}

export interface SearchResults {
  series: SeriesMatch[];
  issues: IssueMatch[];
  query: SearchQuery;
  sources: {
    comicVine: { searched: boolean; available: boolean; error?: string };
    metron: { searched: boolean; available: boolean; error?: string };
    anilist: { searched: boolean; available: boolean; error?: string };
    mal: { searched: boolean; available: boolean; error?: string };
  };
  /** Pagination metadata (only populated for ComicVine searches) */
  pagination?: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

export interface ApplyMetadataResult {
  success: boolean;
  source: MetadataSource;
  sourceId: string;
  metadata: Record<string, string | number | undefined>;
  error?: string;
}

// =============================================================================
// Confidence Scoring
// =============================================================================

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0.0;

  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1.0;
  if (aLower.length === 0 || bLower.length === 0) return 0.0;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const lengthRatio = Math.min(aLower.length, bLower.length) / Math.max(aLower.length, bLower.length);
    return 0.7 + 0.3 * lengthRatio;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aLower.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower[i - 1] === aLower[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  const distance = matrix[bLower.length]![aLower.length]!;
  const maxLength = Math.max(aLower.length, bLower.length);
  return 1 - distance / maxLength;
}

/**
 * Calculate confidence score for a series match
 */
function calculateSeriesConfidence(
  query: SearchQuery,
  result: { name: string; startYear?: number; publisher?: string }
): number {
  let confidence = 0;
  let factors = 0;

  // Name similarity (most important)
  if (query.series) {
    confidence += stringSimilarity(query.series, result.name) * 0.6;
    factors += 0.6;
  }

  // Year match
  if (query.year && result.startYear) {
    if (result.startYear === query.year) {
      confidence += 0.25;
    } else if (Math.abs(result.startYear - query.year) <= 1) {
      confidence += 0.15;
    } else if (Math.abs(result.startYear - query.year) <= 3) {
      confidence += 0.05;
    }
    factors += 0.25;
  }

  // Publisher match
  if (query.publisher && result.publisher) {
    confidence += stringSimilarity(query.publisher, result.publisher) * 0.15;
    factors += 0.15;
  }

  // Normalize if we didn't have all factors
  if (factors > 0 && factors < 1) {
    confidence = confidence / factors;
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Calculate confidence score for an issue match
 */
function calculateIssueConfidence(
  query: SearchQuery,
  result: { seriesName: string; number: string; coverDate?: string; publisher?: string }
): number {
  let confidence = 0;
  let factors = 0;

  // Series name similarity
  if (query.series) {
    confidence += stringSimilarity(query.series, result.seriesName) * 0.4;
    factors += 0.4;
  }

  // Issue number match (exact)
  if (query.issueNumber) {
    const queryNum = query.issueNumber.replace(/^#/, '').trim();
    const resultNum = result.number.replace(/^#/, '').trim();

    if (queryNum === resultNum) {
      confidence += 0.35;
    } else if (parseInt(queryNum) === parseInt(resultNum)) {
      confidence += 0.25;
    }
    factors += 0.35;
  }

  // Year match
  if (query.year && result.coverDate) {
    const resultYear = new Date(result.coverDate).getFullYear();
    if (resultYear === query.year) {
      confidence += 0.15;
    } else if (Math.abs(resultYear - query.year) <= 1) {
      confidence += 0.08;
    }
    factors += 0.15;
  }

  // Publisher match
  if (query.publisher && result.publisher) {
    confidence += stringSimilarity(query.publisher, result.publisher) * 0.1;
    factors += 0.1;
  }

  // Normalize if we didn't have all factors
  if (factors > 0 && factors < 1) {
    confidence = confidence / factors;
  }

  return Math.min(1, Math.max(0, confidence));
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search for series across all sources
 *
 * Searches sources in parallel for faster results.
 * When libraryType is provided, sources are automatically prioritized.
 */
export async function searchSeries(
  query: SearchQuery,
  options: { limit?: number; offset?: number; sources?: MetadataSource[]; sessionId?: string; libraryType?: LibraryType } = {}
): Promise<SearchResults> {
  const settings = getMetadataSettings();
  const limit = options.limit || 10;
  const offset = options.offset || 0;
  const sessionId = options.sessionId;

  // Determine which sources to search
  // If libraryType is provided, use type-aware source selection
  let sources: MetadataSource[];
  if (options.sources) {
    sources = options.sources;
  } else if (options.libraryType) {
    sources = getSourcesForLibraryType(options.libraryType);
  } else {
    sources = [settings.primarySource as MetadataSource, settings.primarySource === 'comicvine' ? 'metron' : 'comicvine'];
  }
  const uniqueSources = Array.from(new Set(sources));

  const results: SearchResults = {
    series: [],
    issues: [],
    query,
    sources: {
      comicVine: { searched: false, available: false },
      metron: { searched: false, available: false },
      anilist: { searched: false, available: false },
      mal: { searched: false, available: false },
    },
  };

  if (!query.series) {
    return results;
  }

  // Log searching step
  if (sessionId) {
    MetadataFetchLogger.log(sessionId, 'info', 'searching', `Searching for series: "${query.series}"`, {
      sources: uniqueSources,
      query,
    });
  }

  // Build search promises for parallel execution
  const searchPromises: Promise<void>[] = [];

  if (uniqueSources.includes('comicvine')) {
    searchPromises.push(
      (async () => {
        try {
          results.sources.comicVine.searched = true;
          const cvResults = await comicVine.searchVolumes(query.series!, { limit, offset, sessionId });
          results.sources.comicVine.available = true;

          // Store pagination info from ComicVine
          results.pagination = {
            total: cvResults.total,
            offset: cvResults.offset,
            limit: cvResults.limit,
            hasMore: cvResults.offset + cvResults.results.length < cvResults.total,
          };

          for (const vol of cvResults.results) {
            const match: SeriesMatch = {
              source: 'comicvine',
              sourceId: String(vol.id),
              name: vol.name,
              startYear: vol.start_year ? parseInt(vol.start_year, 10) : undefined,
              publisher: vol.publisher?.name,
              issueCount: vol.count_of_issues,
              description: vol.description?.replace(/<[^>]*>/g, '').substring(0, 500),
              coverUrl: vol.image?.medium_url || vol.image?.small_url,
              confidence: 0,
              url: vol.site_detail_url,
              // Extended fields
              aliases: vol.aliases?.split('\n').filter(Boolean),
              shortDescription: vol.deck,
              firstIssueNumber: vol.first_issue?.issue_number,
              lastIssueNumber: vol.last_issue?.issue_number,
              imageUrls: vol.image
                ? {
                    thumb: vol.image.thumb_url,
                    small: vol.image.small_url,
                    medium: vol.image.medium_url,
                  }
                : undefined,
              // Rich series data from ComicVine
              characters: vol.characters?.slice(0, 20),
              creators: vol.people?.slice(0, 20),
              locations: vol.locations?.slice(0, 10),
              objects: vol.objects?.slice(0, 10),
            };
            match.confidence = calculateSeriesConfidence(query, match);
            results.series.push(match);
          }
        } catch (err) {
          results.sources.comicVine.error = err instanceof Error ? err.message : String(err);
        }
      })()
    );
  }

  if (uniqueSources.includes('metron')) {
    searchPromises.push(
      (async () => {
        try {
          // Check if Metron credentials are configured
          if (!isMetronAvailable()) {
            results.sources.metron.searched = false;
            results.sources.metron.error = 'Metron credentials not configured. Add metronUsername and metronPassword in settings.';
            return;
          }

          results.sources.metron.searched = true;
          const metronResults = await metron.searchSeries(query.series!, {
            publisher: query.publisher,
            year: query.year,
            sessionId,
          });
          results.sources.metron.available = true;

          for (const series of metronResults.results) {
            const match: SeriesMatch = {
              source: 'metron',
              sourceId: String(series.id),
              name: getSeriesName(series),
              startYear: series.year_began,
              endYear: series.year_end,
              publisher: series.publisher?.name,
              issueCount: series.issue_count,
              description: series.desc?.substring(0, 500),
              coverUrl: series.image,
              confidence: 0,
              url: series.resource_url,
              // Extended fields
              seriesType: series.series_type?.name,
              volume: series.volume,
              imageUrls: series.image
                ? {
                    thumb: series.image,
                    small: series.image,
                    medium: series.image,
                  }
                : undefined,
            };
            match.confidence = calculateSeriesConfidence(query, match);
            results.series.push(match);
          }
        } catch (err) {
          logError('metadata-search', err instanceof Error ? err : new Error(String(err)), { action: 'search-series', source: 'metron' });
          results.sources.metron.error = err instanceof Error ? err.message : String(err);
        }
      })()
    );
  }

  if (uniqueSources.includes('anilist')) {
    searchPromises.push(
      (async () => {
        try {
          results.sources.anilist.searched = true;
          const anilistResults = await anilist.searchManga(query.series!, {
            limit,
            page: Math.floor(offset / limit) + 1,
            sessionId,
          });
          results.sources.anilist.available = true;

          for (const manga of anilistResults.results) {
            // Build aliases from all title variants
            const aliases: string[] = [];
            const preferredTitle = anilist.getPreferredTitle(manga);
            if (manga.title.romaji && manga.title.romaji !== preferredTitle) {
              aliases.push(manga.title.romaji);
            }
            if (manga.title.english && manga.title.english !== preferredTitle) {
              aliases.push(manga.title.english);
            }
            if (manga.title.native) {
              aliases.push(manga.title.native);
            }
            if (manga.synonyms) {
              aliases.push(...manga.synonyms);
            }

            const match: SeriesMatch = {
              source: 'anilist',
              sourceId: String(manga.id),
              name: preferredTitle,
              startYear: anilist.fuzzyDateToYear(manga.startDate) ?? undefined,
              endYear: anilist.fuzzyDateToYear(manga.endDate) ?? undefined,
              publisher: undefined, // AniList doesn't have publisher
              issueCount: manga.chapters || manga.volumes || undefined,
              description: manga.description?.replace(/<[^>]*>/g, '').substring(0, 500),
              coverUrl: manga.coverImage.large || manga.coverImage.medium,
              confidence: 0,
              url: manga.siteUrl,
              aliases: aliases.length > 0 ? aliases : undefined,
              seriesType: anilist.formatToSeriesType(manga.format),
              imageUrls: {
                thumb: manga.coverImage.medium,
                small: manga.coverImage.medium,
                medium: manga.coverImage.large,
              },
            };
            match.confidence = calculateSeriesConfidence(query, match);
            results.series.push(match);
          }
        } catch (err) {
          logError('metadata-search', err instanceof Error ? err : new Error(String(err)), { action: 'search-series', source: 'anilist' });
          results.sources.anilist.error = err instanceof Error ? err.message : String(err);
        }
      })()
    );
  }

  if (uniqueSources.includes('mal')) {
    searchPromises.push(
      (async () => {
        try {
          results.sources.mal.searched = true;
          const malResults = await jikan.searchManga(query.series!, {
            limit,
            page: Math.floor(offset / limit) + 1,
            sessionId,
          });
          results.sources.mal.available = true;

          for (const manga of malResults.results) {
            // Build aliases from all title variants
            const aliases: string[] = [];
            const preferredTitle = jikan.getPreferredTitle(manga);
            if (manga.title && manga.title !== preferredTitle) {
              aliases.push(manga.title);
            }
            if (manga.title_english && manga.title_english !== preferredTitle) {
              aliases.push(manga.title_english);
            }
            if (manga.title_japanese) {
              aliases.push(manga.title_japanese);
            }
            if (manga.title_synonyms) {
              aliases.push(...manga.title_synonyms);
            }

            const match: SeriesMatch = {
              source: 'mal',
              sourceId: String(manga.mal_id),
              name: preferredTitle,
              startYear: jikan.getStartYear(manga) ?? undefined,
              endYear: jikan.getEndYear(manga) ?? undefined,
              publisher: manga.serializations?.[0]?.name, // Use first serialization as publisher
              issueCount: manga.chapters || manga.volumes || undefined,
              description: manga.synopsis?.substring(0, 500),
              coverUrl: manga.images.jpg.large_image_url || manga.images.jpg.image_url,
              confidence: 0,
              url: manga.url,
              aliases: aliases.length > 0 ? aliases : undefined,
              seriesType: jikan.typeToSeriesType(manga.type),
              imageUrls: {
                thumb: manga.images.jpg.small_image_url,
                small: manga.images.jpg.image_url,
                medium: manga.images.jpg.large_image_url,
              },
            };
            match.confidence = calculateSeriesConfidence(query, match);
            results.series.push(match);
          }
        } catch (err) {
          logError('metadata-search', err instanceof Error ? err : new Error(String(err)), { action: 'search-series', source: 'mal' });
          results.sources.mal.error = err instanceof Error ? err.message : String(err);
        }
      })()
    );
  }

  // Wait for all searches to complete in parallel
  await Promise.all(searchPromises);

  // Log scoring step
  if (sessionId && results.series.length > 0) {
    const topMatch = results.series.reduce((a, b) => (a.confidence > b.confidence ? a : b));
    MetadataFetchLogger.logScoring(sessionId, results.series.length, topMatch.confidence, topMatch.source);
  }

  // Sort results - for manga libraries, prioritize manga sources (AniList/MAL) first
  const mangaSources: MetadataSource[] = ['anilist', 'mal'];
  if (options.libraryType === 'manga') {
    // For manga: sort manga sources first (by confidence), then other sources (by confidence)
    const mangaResults = results.series.filter(s => mangaSources.includes(s.source));
    const otherResults = results.series.filter(s => !mangaSources.includes(s.source));
    mangaResults.sort((a, b) => b.confidence - a.confidence);
    otherResults.sort((a, b) => b.confidence - a.confidence);
    results.series = [...mangaResults, ...otherResults];
  } else {
    // For western: sort by confidence (highest first)
    results.series.sort((a, b) => b.confidence - a.confidence);
  }

  // Limit results
  results.series = results.series.slice(0, limit);

  // Log organizing step
  if (sessionId) {
    MetadataFetchLogger.logOrganizing(sessionId, results.series.length, 0, results.series.length);
  }

  return results;
}

/**
 * Search for issues across all sources
 */
export async function searchIssues(
  query: SearchQuery,
  options: { limit?: number; sources?: MetadataSource[]; seriesId?: { source: MetadataSource; id: string }; sessionId?: string } = {}
): Promise<SearchResults> {
  const settings = getMetadataSettings();
  const limit = options.limit || 10;
  const sessionId = options.sessionId;

  // Determine which sources to search
  const sources = options.sources || [settings.primarySource, settings.primarySource === 'comicvine' ? 'metron' : 'comicvine'];
  const uniqueSources = Array.from(new Set(sources));

  const results: SearchResults = {
    series: [],
    issues: [],
    query,
    sources: {
      comicVine: { searched: false, available: false },
      metron: { searched: false, available: false },
      anilist: { searched: false, available: false },
      mal: { searched: false, available: false },
    },
  };

  // Note: AniList and MAL don't provide per-chapter/issue metadata.
  // For manga, chapters are parsed from filenames instead.

  // Log searching step
  if (sessionId) {
    MetadataFetchLogger.log(sessionId, 'info', 'searching', `Searching for issues: "${query.series || ''}" #${query.issueNumber || 'any'}`, {
      sources: uniqueSources,
      query,
      withinSeries: options.seriesId,
    });
  }

  // Search each source
  for (const source of uniqueSources) {
    // If we have a specific series ID, only search that source
    if (options.seriesId && options.seriesId.source !== source) {
      continue;
    }

    if (source === 'comicvine') {
      try {
        results.sources.comicVine.searched = true;

        if (options.seriesId?.source === 'comicvine') {
          // Search within specific series
          const volumeId = parseInt(options.seriesId.id, 10);
          const cvResults = await comicVine.getVolumeIssues(volumeId, { limit, sessionId });
          results.sources.comicVine.available = true;

          for (const issue of cvResults.results) {
            // Filter by issue number if specified
            if (query.issueNumber) {
              const queryNum = query.issueNumber.replace(/^#/, '').trim();
              const issueNum = issue.issue_number?.replace(/^#/, '').trim();
              if (queryNum !== issueNum && parseInt(queryNum) !== parseInt(issueNum || '')) {
                continue;
              }
            }

            const match: IssueMatch = {
              source: 'comicvine',
              sourceId: String(issue.id),
              seriesId: String(issue.volume?.id || options.seriesId.id),
              seriesName: issue.volume?.name || '',
              number: issue.issue_number,
              title: issue.name,
              coverDate: issue.cover_date,
              coverUrl: issue.image?.medium_url || issue.image?.small_url,
              confidence: 0,
              url: issue.site_detail_url,
            };
            match.confidence = calculateIssueConfidence(query, match);
            results.issues.push(match);
          }
        } else if (query.series) {
          // General search
          const searchQuery = query.issueNumber ? `${query.series} ${query.issueNumber}` : query.series;
          const cvResults = await comicVine.searchIssues(searchQuery, { limit, sessionId });
          results.sources.comicVine.available = true;

          for (const result of cvResults.results) {
            // Need to fetch full issue details
            const issueId = result.id;
            const issue = await comicVine.getIssue(issueId, sessionId);

            if (issue) {
              const match: IssueMatch = {
                source: 'comicvine',
                sourceId: String(issue.id),
                seriesId: String(issue.volume?.id || 0),
                seriesName: issue.volume?.name || '',
                number: issue.issue_number,
                title: issue.name,
                coverDate: issue.cover_date,
                coverUrl: issue.image?.medium_url || issue.image?.small_url,
                confidence: 0,
                url: issue.site_detail_url,
              };
              match.confidence = calculateIssueConfidence(query, match);
              results.issues.push(match);
            }
          }
        }
      } catch (err) {
        results.sources.comicVine.error = err instanceof Error ? err.message : String(err);
      }
    }

    if (source === 'metron') {
      try {
        // Check if Metron credentials are configured
        if (!isMetronAvailable()) {
          results.sources.metron.searched = false;
          results.sources.metron.error = 'Metron credentials not configured. Add metronUsername and metronPassword in settings.';
          continue;
        }

        results.sources.metron.searched = true;

        const searchOptions: {
          seriesName?: string;
          seriesId?: number;
          number?: string;
          sessionId?: string;
        } = { sessionId };

        if (options.seriesId?.source === 'metron') {
          searchOptions.seriesId = parseInt(options.seriesId.id, 10);
        } else if (query.series) {
          searchOptions.seriesName = query.series;
        }

        if (query.issueNumber) {
          searchOptions.number = query.issueNumber.replace(/^#/, '').trim();
        }

        const metronResults = await metron.searchIssues(searchOptions);
        results.sources.metron.available = true;

        for (const issue of metronResults.results) {
          const match: IssueMatch = {
            source: 'metron',
            sourceId: String(issue.id),
            seriesId: String(issue.series?.id || 0),
            seriesName: issue.series?.name || '',
            number: issue.number,
            title: issue.title,
            coverDate: issue.cover_date,
            publisher: issue.publisher?.name,
            coverUrl: issue.image,
            confidence: 0,
            url: issue.resource_url,
          };
          match.confidence = calculateIssueConfidence(query, match);
          results.issues.push(match);
        }
      } catch (err) {
        results.sources.metron.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // Log scoring step
  if (sessionId && results.issues.length > 0) {
    const topMatch = results.issues.reduce((a, b) => (a.confidence > b.confidence ? a : b));
    MetadataFetchLogger.logScoring(sessionId, results.issues.length, topMatch.confidence, topMatch.source);
  }

  // Sort by confidence (highest first)
  results.issues.sort((a, b) => b.confidence - a.confidence);

  // Limit results
  results.issues = results.issues.slice(0, limit);

  // Log organizing step
  if (sessionId) {
    MetadataFetchLogger.logOrganizing(sessionId, results.issues.length, results.issues.length, 0);
  }

  return results;
}

/**
 * Combined search for both series and issues
 */
export async function search(
  query: SearchQuery,
  options: { limit?: number; sources?: MetadataSource[]; sessionId?: string } = {}
): Promise<SearchResults> {
  const seriesResults = await searchSeries(query, options);
  const issueResults = await searchIssues(query, options);

  return {
    series: seriesResults.series,
    issues: issueResults.issues,
    query,
    sources: {
      comicVine: {
        searched: seriesResults.sources.comicVine.searched || issueResults.sources.comicVine.searched,
        available: seriesResults.sources.comicVine.available || issueResults.sources.comicVine.available,
        error: seriesResults.sources.comicVine.error || issueResults.sources.comicVine.error,
      },
      metron: {
        searched: seriesResults.sources.metron.searched || issueResults.sources.metron.searched,
        available: seriesResults.sources.metron.available || issueResults.sources.metron.available,
        error: seriesResults.sources.metron.error || issueResults.sources.metron.error,
      },
      anilist: {
        searched: seriesResults.sources.anilist.searched || issueResults.sources.anilist.searched,
        available: seriesResults.sources.anilist.available || issueResults.sources.anilist.available,
        error: seriesResults.sources.anilist.error || issueResults.sources.anilist.error,
      },
      mal: {
        searched: seriesResults.sources.mal.searched || issueResults.sources.mal.searched,
        available: seriesResults.sources.mal.available || issueResults.sources.mal.available,
        error: seriesResults.sources.mal.error || issueResults.sources.mal.error,
      },
    },
  };
}

// =============================================================================
// Fetch Full Metadata
// =============================================================================

/**
 * Get full series metadata from a source
 */
export async function getSeriesMetadata(
  source: MetadataSource,
  sourceId: string,
  sessionId?: string
): Promise<Record<string, unknown> | null> {
  const id = parseInt(sourceId, 10);

  // Log fetching step
  if (sessionId) {
    MetadataFetchLogger.logFetching(sessionId, source, sourceId, 'series');
  }

  if (source === 'comicvine') {
    const volume = await comicVine.getVolume(id, sessionId);
    if (!volume) return null;
    return comicVine.volumeToSeriesMetadata(volume);
  }

  if (source === 'metron') {
    // Check if Metron credentials are configured
    if (!isMetronAvailable()) {
      return null;
    }
    const series = await metron.getSeries(id, sessionId);
    if (!series) return null;
    return metron.seriesToSeriesMetadata(series);
  }

  if (source === 'anilist') {
    const manga = await anilist.getMangaById(id, sessionId);
    if (!manga) return null;

    // Extract tags with rank > 75, excluding spoiler tags
    const tags =
      manga.tags?.filter((tag) => tag.rank > 75 && !tag.isMediaSpoiler).map((tag) => tag.name) ||
      [];

    // Convert AniList manga to metadata format
    return {
      name: anilist.getPreferredTitle(manga),
      aliases: anilist.getAllTitles(manga),
      description: manga.description,
      startYear: manga.startDate?.year,
      endYear: manga.endDate?.year,
      issueCount: manga.chapters || manga.volumes,
      coverUrl: manga.coverImage?.large || manga.coverImage?.medium,
      genres: manga.genres,
      tags: tags.length > 0 ? tags : undefined,
      characters: manga.characters?.edges?.map((e) => e.node.name.full) || [],
      status: manga.status,
    };
  }

  if (source === 'mal') {
    const manga = await jikan.getMangaById(id, sessionId);
    if (!manga) return null;
    // Convert MAL manga to metadata format
    return {
      name: manga.title_english || manga.title,
      aliases: [manga.title, manga.title_english, manga.title_japanese].filter(Boolean),
      description: manga.synopsis,
      startYear: manga.published?.from ? new Date(manga.published.from).getFullYear() : undefined,
      endYear: manga.published?.to ? new Date(manga.published.to).getFullYear() : undefined,
      issueCount: manga.chapters || manga.volumes,
      coverUrl: manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url,
      genres: manga.genres?.map((g: { name: string }) => g.name) || [],
      characters: [], // Would require additional API call
      status: manga.status,
      publisher: manga.serializations?.[0]?.name,
    };
  }

  return null;
}

/**
 * Get full issue metadata from a source
 */
export async function getIssueMetadata(
  source: MetadataSource,
  sourceId: string,
  sessionId?: string
): Promise<Record<string, string | number | undefined> | null> {
  const id = parseInt(sourceId, 10);

  // Log fetching step
  if (sessionId) {
    MetadataFetchLogger.logFetching(sessionId, source, sourceId, 'issue');
  }

  if (source === 'comicvine') {
    const issue = await comicVine.getIssue(id, sessionId);
    if (!issue) return null;

    // Get volume for publisher info
    let volume: comicVine.ComicVineVolume | null = null;
    if (issue.volume?.id) {
      volume = await comicVine.getVolume(issue.volume.id, sessionId);
    }

    return comicVine.issueToComicInfo(issue, volume || undefined);
  }

  if (source === 'metron') {
    // Check if Metron credentials are configured
    if (!isMetronAvailable()) {
      return null;
    }
    const issue = await metron.getIssue(id, sessionId);
    if (!issue) return null;

    // Get series for additional info
    let series: metron.MetronSeries | null = null;
    if (issue.series?.id) {
      series = await metron.getSeries(issue.series.id, sessionId);
    }

    return metron.issueToComicInfo(issue, series || undefined);
  }

  return null;
}

/**
 * Get all issues for a series from a source
 */
export async function getSeriesIssues(
  source: MetadataSource,
  sourceId: string,
  options: { limit?: number; page?: number; sessionId?: string } = {}
): Promise<{
  issues: Array<{
    sourceId: string;
    number: string;
    title?: string;
    coverDate?: string;
    coverUrl?: string;
  }>;
  total: number;
  hasMore: boolean;
}> {
  const id = parseInt(sourceId, 10);
  const limit = options.limit || 100;
  const sessionId = options.sessionId;

  if (source === 'comicvine') {
    const result = await comicVine.getVolumeIssues(id, {
      limit,
      offset: ((options.page || 1) - 1) * limit,
      sessionId,
    });

    return {
      issues: result.results.map((issue) => ({
        sourceId: String(issue.id),
        number: issue.issue_number,
        title: issue.name,
        coverDate: issue.cover_date,
        coverUrl: issue.image?.medium_url || issue.image?.small_url,
      })),
      total: result.total,
      hasMore: result.offset + result.results.length < result.total,
    };
  }

  if (source === 'metron') {
    // Check if Metron credentials are configured
    if (!isMetronAvailable()) {
      return { issues: [], total: 0, hasMore: false };
    }
    const result = await metron.getSeriesIssues(id, { page: options.page, sessionId });

    return {
      issues: result.results.map((issue) => ({
        sourceId: String(issue.id),
        number: issue.number,
        title: issue.title,
        coverDate: issue.cover_date,
        coverUrl: issue.image,
      })),
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  return { issues: [], total: 0, hasMore: false };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check availability of all metadata sources
 */
export async function checkSourcesAvailability(): Promise<{
  comicVine: { available: boolean; configured: boolean; error?: string };
  metron: { available: boolean; error?: string };
}> {
  const [cvStatus, metronStatus] = await Promise.all([
    comicVine.checkApiAvailability(),
    metron.checkApiAvailability(),
  ]);

  return {
    comicVine: cvStatus,
    metron: metronStatus,
  };
}

/**
 * Get the best match from search results (highest confidence)
 */
export function getBestSeriesMatch(results: SearchResults): SeriesMatch | null {
  if (results.series.length === 0) return null;
  return results.series[0]!;
}

/**
 * Get the best match from search results (highest confidence)
 */
export function getBestIssueMatch(results: SearchResults): IssueMatch | null {
  if (results.issues.length === 0) return null;
  return results.issues[0]!;
}

/**
 * Parse a filename to extract search query components
 */
export function parseFilenameToQuery(filename: string): SearchQuery {
  const query: SearchQuery = {};

  // Remove file extension
  let name = filename.replace(/\.(cbz|cbr|cb7|cbt)$/i, '');

  // Extract year from parentheses at end
  const yearMatch = name.match(/\((\d{4})\)$/);
  if (yearMatch) {
    query.year = parseInt(yearMatch[1]!, 10);
    name = name.replace(/\(\d{4}\)$/, '').trim();
  }

  // Extract issue number
  const issuePatterns = [
    /#(\d+)/,
    /Issue\s*#?\s*(\d+)/i,
    /\s(\d{1,4})(?:\s|$|-)/,
  ];

  for (const pattern of issuePatterns) {
    const match = name.match(pattern);
    if (match) {
      query.issueNumber = match[1];
      name = name.replace(pattern, ' ').trim();
      break;
    }
  }

  // Extract volume number
  const volumeMatch = name.match(/(?:Vol\.?|Volume)\s*(\d+)/i);
  if (volumeMatch) {
    name = name.replace(/(?:Vol\.?|Volume)\s*\d+/i, '').trim();
  }

  // Clean up noise tokens
  const noisePatterns = [
    /\[.*?\]/g,
    /\(.*?scan.*?\)/gi,
    /\(digital\)/gi,
    /\(webrip\)/gi,
  ];

  for (const pattern of noisePatterns) {
    name = name.replace(pattern, '').trim();
  }

  // Clean up multiple spaces
  name = name.replace(/\s+/g, ' ').trim();

  // The remaining should be the series name
  if (name) {
    query.series = name;
  }

  return query;
}

// =============================================================================
// Full Data Mode Functions
// =============================================================================

import {
  ProviderRegistry,
  type SeriesMetadata as ProviderSeriesMetadata,
  type MergedSeriesMetadata,
} from './metadata-providers/index.js';
import { MetadataMergeService } from './metadata-merge.service.js';

export type { MergedSeriesMetadata };

export interface FullDataSearchOptions {
  query: SearchQuery;
  sources?: MetadataSource[];
  sessionId?: string;
  limit?: number;
}

export interface MultiSourceSearchResult {
  /** Results from each source, keyed by source name */
  sourceResults: Record<MetadataSource, SeriesMatch[]>;
  /** Best match merged across all sources (if any matches found) */
  merged: MergedSeriesMetadata | null;
  /** Search metadata */
  sources: {
    [key in MetadataSource]?: {
      searched: boolean;
      available: boolean;
      resultCount: number;
      error?: string;
    };
  };
}

/**
 * Search for series across all enabled sources (Full Data mode)
 *
 * Queries all enabled sources in parallel and merges results.
 */
export async function searchSeriesFullData(
  options: FullDataSearchOptions
): Promise<MultiSourceSearchResult> {
  const { query, sessionId, limit = 10 } = options;
  const settings = getMetadataSettings();

  // Determine which sources to search
  const sources = options.sources || settings.enabledSources || ['comicvine', 'metron'];

  const result: MultiSourceSearchResult = {
    sourceResults: {} as Record<MetadataSource, SeriesMatch[]>,
    merged: null,
    sources: {},
  };

  if (!query.series) {
    return result;
  }

  // Log searching step
  if (sessionId) {
    MetadataFetchLogger.log(sessionId, 'info', 'searching', `Full data search for series: "${query.series}"`, {
      sources,
      query,
    });
  }

  // Search all sources in parallel
  const searchPromises: Promise<void>[] = [];

  for (const source of sources) {
    const provider = ProviderRegistry.get(source);
    if (!provider) continue;

    searchPromises.push(
      (async () => {
        try {
          result.sources[source] = { searched: true, available: false, resultCount: 0 };

          const searchResult = await provider.searchSeries(query, { limit, sessionId });
          result.sources[source]!.available = true;
          result.sources[source]!.resultCount = searchResult.results.length;

          // Convert provider results to SeriesMatch format with confidence scores
          result.sourceResults[source] = searchResult.results.map((series) => ({
            source,
            sourceId: series.sourceId,
            name: series.name,
            startYear: series.startYear,
            endYear: series.endYear,
            publisher: series.publisher,
            issueCount: series.issueCount,
            description: series.description,
            coverUrl: series.coverUrl,
            confidence: calculateSeriesConfidence(query, series),
            url: series.url,
            aliases: series.aliases,
            shortDescription: series.shortDescription,
            seriesType: series.seriesType,
            volume: series.volume,
            firstIssueNumber: series.firstIssueNumber,
            lastIssueNumber: series.lastIssueNumber,
            imageUrls: series.imageUrls,
            characters: series.characters,
            creators: series.creators,
            locations: series.locations,
            objects: series.objects,
          }));
        } catch (err) {
          result.sources[source] = {
            searched: true,
            available: false,
            resultCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
          result.sourceResults[source] = [];
        }
      })()
    );
  }

  await Promise.all(searchPromises);

  // Find the best match from each source and merge them
  const bestMatches = new Map<MetadataSource, ProviderSeriesMetadata | null>();

  for (const source of sources) {
    const sourceMatches = result.sourceResults[source];
    if (sourceMatches && sourceMatches.length > 0) {
      // Take the highest confidence match
      const best = sourceMatches.reduce((a, b) => (a.confidence > b.confidence ? a : b));
      bestMatches.set(source, seriesMatchToProviderMetadata(best));
    } else {
      bestMatches.set(source, null);
    }
  }

  // Merge the best matches
  result.merged = MetadataMergeService.mergeSeries(bestMatches, {
    priorityOrder: settings.sourcePriority,
  });

  // Log results
  if (sessionId) {
    const totalResults = Object.values(result.sourceResults).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    MetadataFetchLogger.log(sessionId, 'info', 'searching', `Full data search complete`, {
      totalResults,
      sources: Object.keys(result.sourceResults),
      merged: !!result.merged,
    });
  }

  return result;
}

/**
 * Expand a single series result by fetching from additional sources
 *
 * Fetches the series from additional sources and merges with the current data.
 */
export async function expandSeriesResult(
  currentMatch: SeriesMatch,
  additionalSources?: MetadataSource[],
  sessionId?: string
): Promise<MergedSeriesMetadata | null> {
  const settings = getMetadataSettings();

  // Determine which additional sources to query
  const sources = additionalSources ||
    settings.enabledSources.filter((s) => s !== currentMatch.source);

  if (sources.length === 0) {
    // No additional sources, convert current match to merged format
    const singleResult = new Map<MetadataSource, ProviderSeriesMetadata | null>();
    singleResult.set(currentMatch.source, seriesMatchToProviderMetadata(currentMatch));
    return MetadataMergeService.mergeSeries(singleResult);
  }

  // Log expand operation
  if (sessionId) {
    MetadataFetchLogger.log(sessionId, 'info', 'fetching', `Expanding result from ${currentMatch.source}`, {
      currentSource: currentMatch.source,
      additionalSources: sources,
      seriesName: currentMatch.name,
    });
  }

  // Search for this series in additional sources
  const searchResults = new Map<MetadataSource, ProviderSeriesMetadata | null>();
  searchResults.set(currentMatch.source, seriesMatchToProviderMetadata(currentMatch));

  const searchPromises: Promise<void>[] = [];

  for (const source of sources) {
    const provider = ProviderRegistry.get(source);
    if (!provider) continue;

    searchPromises.push(
      (async () => {
        try {
          // Search for the series by name and year
          const query: SearchQuery = {
            series: currentMatch.name,
            year: currentMatch.startYear,
            publisher: currentMatch.publisher,
          };

          const searchResult = await provider.searchSeries(query, { limit: 5, sessionId });

          if (searchResult.results.length > 0) {
            // Find the best match
            const bestMatch = MetadataMergeService.findBestMatch(
              seriesMatchToProviderMetadata(currentMatch),
              searchResult.results
            );

            if (bestMatch) {
              // Fetch full details for the best match
              const fullDetails = await provider.getSeriesById(bestMatch.sourceId, sessionId);
              searchResults.set(source, fullDetails);
            } else {
              searchResults.set(source, null);
            }
          } else {
            searchResults.set(source, null);
          }
        } catch {
          searchResults.set(source, null);
        }
      })()
    );
  }

  await Promise.all(searchPromises);

  // Merge all results
  return MetadataMergeService.mergeSeries(searchResults, {
    priorityOrder: settings.sourcePriority,
  });
}

/** Result containing both merged data and per-source results */
export interface ExpandedSeriesResultWithSources {
  merged: MergedSeriesMetadata;
  sourceResults: Record<string, SeriesMatch | null>;
}

/**
 * Expand a single series result with full per-source data
 *
 * Similar to expandSeriesResult but returns both the merged result AND
 * the individual per-source SeriesMatch objects for UI display.
 */
export async function expandSeriesResultWithSources(
  currentMatch: SeriesMatch,
  additionalSources?: MetadataSource[],
  sessionId?: string
): Promise<ExpandedSeriesResultWithSources | null> {
  const settings = getMetadataSettings();

  // Initialize sourceResults with the current match
  const sourceResults: Record<string, SeriesMatch | null> = {
    comicvine: null,
    metron: null,
    gcd: null,
  };
  sourceResults[currentMatch.source] = currentMatch;

  // Determine which additional sources to query
  const sources = additionalSources ||
    settings.enabledSources.filter((s) => s !== currentMatch.source);

  if (sources.length === 0) {
    // No additional sources, convert current match to merged format
    const singleResult = new Map<MetadataSource, ProviderSeriesMetadata | null>();
    singleResult.set(currentMatch.source, seriesMatchToProviderMetadata(currentMatch));
    const merged = MetadataMergeService.mergeSeries(singleResult);
    return merged ? { merged, sourceResults } : null;
  }

  // Log expand operation
  if (sessionId) {
    MetadataFetchLogger.log(sessionId, 'info', 'fetching', `Expanding result from ${currentMatch.source}`, {
      currentSource: currentMatch.source,
      additionalSources: sources,
      seriesName: currentMatch.name,
    });
  }

  // Search for this series in additional sources
  const providerResults = new Map<MetadataSource, ProviderSeriesMetadata | null>();
  providerResults.set(currentMatch.source, seriesMatchToProviderMetadata(currentMatch));

  const searchPromises: Promise<void>[] = [];

  for (const source of sources) {
    const provider = ProviderRegistry.get(source);
    if (!provider) continue;

    searchPromises.push(
      (async () => {
        try {
          // Search for the series by name and year
          const query: SearchQuery = {
            series: currentMatch.name,
            year: currentMatch.startYear,
            publisher: currentMatch.publisher,
          };

          const searchResult = await provider.searchSeries(query, { limit: 5, sessionId });

          if (searchResult.results.length > 0) {
            // Find the best match
            const bestMatch = MetadataMergeService.findBestMatch(
              seriesMatchToProviderMetadata(currentMatch),
              searchResult.results
            );

            if (bestMatch) {
              // Fetch full details for the best match
              const fullDetails = await provider.getSeriesById(bestMatch.sourceId, sessionId);
              providerResults.set(source, fullDetails);

              // Convert to SeriesMatch for UI display
              if (fullDetails) {
                sourceResults[source] = providerMetadataToSeriesMatch(fullDetails, source);
              }
            } else {
              providerResults.set(source, null);
            }
          } else {
            providerResults.set(source, null);
          }
        } catch {
          providerResults.set(source, null);
        }
      })()
    );
  }

  await Promise.all(searchPromises);

  // Merge all results
  const merged = MetadataMergeService.mergeSeries(providerResults, {
    priorityOrder: settings.sourcePriority,
  });

  return merged ? { merged, sourceResults } : null;
}

/**
 * Convert ProviderSeriesMetadata back to SeriesMatch for UI display
 */
function providerMetadataToSeriesMatch(data: ProviderSeriesMetadata, source: MetadataSource): SeriesMatch {
  return {
    source,
    sourceId: data.sourceId,
    name: data.name,
    publisher: data.publisher || undefined,
    startYear: data.startYear || undefined,
    endYear: data.endYear || undefined,
    issueCount: data.issueCount || undefined,
    description: data.description || undefined,
    shortDescription: data.shortDescription || undefined,
    coverUrl: data.coverUrl || undefined,
    url: data.url || undefined,
    seriesType: data.seriesType || undefined,
    confidence: 1.0,
    characters: data.characters,
    creators: data.creators,
    locations: data.locations,
    aliases: data.aliases,
  };
}

/**
 * Get full series metadata from all sources and merge
 *
 * Fetches by source ID from the primary source, then searches other sources
 * to find matching series and merges the data.
 */
export async function getSeriesMetadataFullData(
  source: MetadataSource,
  sourceId: string,
  sessionId?: string
): Promise<MergedSeriesMetadata | null> {
  const settings = getMetadataSettings();
  const provider = ProviderRegistry.get(source);

  if (!provider) {
    return null;
  }

  // Get the primary series data
  const primaryData = await provider.getSeriesById(sourceId, sessionId);
  if (!primaryData) {
    return null;
  }

  // Get additional sources
  const additionalSources = settings.enabledSources.filter((s) => s !== source);

  if (additionalSources.length === 0) {
    // No additional sources, return as merged format
    const singleResult = new Map<MetadataSource, ProviderSeriesMetadata | null>();
    singleResult.set(source, primaryData);
    return MetadataMergeService.mergeSeries(singleResult);
  }

  // Search for matching series in other sources
  const searchResults = new Map<MetadataSource, ProviderSeriesMetadata | null>();
  searchResults.set(source, primaryData);

  const searchPromises: Promise<void>[] = [];

  for (const additionalSource of additionalSources) {
    const additionalProvider = ProviderRegistry.get(additionalSource);
    if (!additionalProvider) continue;

    searchPromises.push(
      (async () => {
        try {
          const query: SearchQuery = {
            series: primaryData.name,
            year: primaryData.startYear,
            publisher: primaryData.publisher,
          };

          const searchResult = await additionalProvider.searchSeries(query, { limit: 5, sessionId });

          if (searchResult.results.length > 0) {
            const bestMatch = MetadataMergeService.findBestMatch(primaryData, searchResult.results);
            if (bestMatch) {
              const fullDetails = await additionalProvider.getSeriesById(bestMatch.sourceId, sessionId);
              searchResults.set(additionalSource, fullDetails);
            } else {
              searchResults.set(additionalSource, null);
            }
          } else {
            searchResults.set(additionalSource, null);
          }
        } catch {
          searchResults.set(additionalSource, null);
        }
      })()
    );
  }

  await Promise.all(searchPromises);

  return MetadataMergeService.mergeSeries(searchResults, {
    priorityOrder: settings.sourcePriority,
  });
}

// =============================================================================
// Helper Functions for Full Data Mode
// =============================================================================

/**
 * Convert SeriesMatch to ProviderSeriesMetadata format
 */
function seriesMatchToProviderMetadata(match: SeriesMatch): ProviderSeriesMetadata {
  return {
    source: match.source,
    sourceId: match.sourceId,
    name: match.name,
    publisher: match.publisher,
    startYear: match.startYear,
    endYear: match.endYear,
    issueCount: match.issueCount,
    description: match.description,
    shortDescription: match.shortDescription,
    coverUrl: match.coverUrl,
    url: match.url,
    aliases: match.aliases,
    seriesType: match.seriesType,
    volume: match.volume,
    characters: match.characters,
    creators: match.creators,
    locations: match.locations,
    objects: match.objects,
    imageUrls: match.imageUrls,
    firstIssueNumber: match.firstIssueNumber,
    lastIssueNumber: match.lastIssueNumber,
  };
}
