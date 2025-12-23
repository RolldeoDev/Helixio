/**
 * MyAnimeList Metadata Provider
 *
 * Implements the MetadataProvider interface using the Jikan API (unofficial MAL API).
 * Wraps the jikan.service.ts functions.
 *
 * NOTE: MAL provides series-level metadata only. For manga libraries,
 * issue/chapter data comes from filename parsing, not from the API.
 * The getSeriesIssues() and getIssueById() methods return empty/null.
 */

import type {
  MetadataProvider,
  MetadataSource,
  AvailabilityResult,
  SearchQuery,
  SearchOptions,
  PaginationOptions,
  SeriesMetadata,
  SeriesSearchResult,
  IssueMetadata,
  IssueListResult,
  Credit,
} from './types.js';
import * as jikan from '../jikan.service.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Jikan manga to SeriesMetadata
 */
function mangaToSeriesMetadata(manga: jikan.JikanManga): SeriesMetadata {
  // Convert authors to Credit format
  const creators: Credit[] = manga.authors.map((author) => ({
    id: author.mal_id,
    name: author.name,
  }));

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

  // Combine genres, themes, demographics for description
  const allGenres = jikan.getAllGenres(manga);

  return {
    source: 'mal' as MetadataSource,
    sourceId: String(manga.mal_id),
    name: preferredTitle,
    publisher: manga.serializations?.[0]?.name, // Use first serialization as "publisher"
    startYear: jikan.getStartYear(manga) ?? undefined,
    endYear: jikan.getEndYear(manga) ?? undefined,
    issueCount: manga.chapters || manga.volumes || undefined,
    description: manga.synopsis || undefined,
    shortDescription: manga.synopsis?.substring(0, 200),
    coverUrl: manga.images.jpg.large_image_url || manga.images.jpg.image_url,
    url: manga.url,
    aliases: aliases.length > 0 ? aliases : undefined,
    seriesType: jikan.typeToSeriesType(manga.type),
    volume: undefined,

    // Rich data
    characters: undefined, // Not available in basic Jikan response
    creators: creators.length > 0 ? creators : undefined,
    locations: undefined,
    objects: undefined,

    // Image variants
    imageUrls: {
      thumb: manga.images.jpg.small_image_url,
      small: manga.images.jpg.image_url,
      medium: manga.images.jpg.large_image_url,
    },

    // Issue range (not applicable for manga)
    firstIssueNumber: manga.chapters ? '1' : undefined,
    lastIssueNumber: manga.chapters ? String(manga.chapters) : undefined,
  };
}

// =============================================================================
// MAL Provider Implementation
// =============================================================================

export const MALProvider: MetadataProvider = {
  name: 'mal' as MetadataSource,
  displayName: 'MyAnimeList',

  async checkAvailability(): Promise<AvailabilityResult> {
    const result = await jikan.checkApiAvailability();
    return {
      available: result.available,
      configured: result.configured,
      error: result.error,
    };
  },

  async searchSeries(query: SearchQuery, options?: SearchOptions): Promise<SeriesSearchResult> {
    if (!query.series) {
      return { results: [], total: 0, hasMore: false };
    }

    const result = await jikan.searchManga(query.series, {
      limit: options?.limit || 10,
      page: options?.offset ? Math.floor(options.offset / (options.limit || 10)) + 1 : 1,
      sessionId: options?.sessionId,
    });

    return {
      results: result.results.map(mangaToSeriesMetadata),
      total: result.total,
      hasMore: result.hasMore,
    };
  },

  async getSeriesById(sourceId: string, sessionId?: string): Promise<SeriesMetadata | null> {
    const id = parseInt(sourceId, 10);
    const manga = await jikan.getMangaById(id, sessionId);
    if (!manga) return null;
    return mangaToSeriesMetadata(manga);
  },

  /**
   * MAL does not provide per-chapter metadata.
   * For manga libraries, chapters are parsed from filenames.
   * Returns empty result.
   */
  async getSeriesIssues(_sourceId: string, _options?: PaginationOptions): Promise<IssueListResult> {
    return { results: [], total: 0, hasMore: false };
  },

  /**
   * MAL does not provide per-chapter metadata.
   * Returns null.
   */
  async getIssueById(_sourceId: string, _sessionId?: string): Promise<IssueMetadata | null> {
    return null;
  },
};

export default MALProvider;
