/**
 * AniList Metadata Provider
 *
 * Implements the MetadataProvider interface for AniList API.
 * Wraps the anilist.service.ts functions.
 *
 * NOTE: AniList provides series-level metadata only. For manga libraries,
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
import * as anilist from '../anilist.service.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert AniList manga to SeriesMetadata
 */
function mangaToSeriesMetadata(manga: anilist.AniListManga): SeriesMetadata {
  // Extract staff by role and convert to Credit format
  const getStaffByRoles = (rolePatterns: string[]): Credit[] => {
    const staff: Credit[] = [];
    for (const edge of manga.staff.edges) {
      const roleMatches = rolePatterns.some((pattern) =>
        edge.role.toLowerCase().includes(pattern.toLowerCase())
      );
      if (roleMatches) {
        staff.push({
          id: edge.node.id,
          name: edge.node.name.full,
          nativeName: edge.node.name.native || undefined,
          alternativeNames:
            edge.node.name.alternative?.length > 0
              ? edge.node.name.alternative
              : undefined,
          profileUrl: edge.node.siteUrl,
          imageUrl: edge.node.image?.large || edge.node.image?.medium || undefined,
        });
      }
    }
    return staff;
  };

  // Get story and art staff as creators
  const creators = getStaffByRoles(['story', 'art', 'original creator', 'author']);

  // Get main characters
  const characters: Credit[] = manga.characters.edges.slice(0, 20).map((edge) => ({
    id: edge.node.id,
    name: edge.node.name.full,
  }));

  // Build aliases from all title variants and synonyms
  const aliases: string[] = [];
  if (manga.title.romaji && manga.title.romaji !== anilist.getPreferredTitle(manga)) {
    aliases.push(manga.title.romaji);
  }
  if (manga.title.english && manga.title.english !== anilist.getPreferredTitle(manga)) {
    aliases.push(manga.title.english);
  }
  if (manga.title.native) {
    aliases.push(manga.title.native);
  }
  if (manga.synonyms) {
    aliases.push(...manga.synonyms);
  }

  return {
    source: 'anilist' as MetadataSource,
    sourceId: String(manga.id),
    name: anilist.getPreferredTitle(manga),
    publisher: undefined, // AniList doesn't have publisher field
    startYear: anilist.fuzzyDateToYear(manga.startDate) ?? undefined,
    endYear: anilist.fuzzyDateToYear(manga.endDate) ?? undefined,
    issueCount: manga.chapters || manga.volumes || undefined,
    description: manga.description?.replace(/<[^>]*>/g, ''), // Strip HTML
    shortDescription: manga.description?.replace(/<[^>]*>/g, '').substring(0, 200),
    coverUrl: manga.coverImage.large || manga.coverImage.medium,
    url: manga.siteUrl,
    aliases: aliases.length > 0 ? aliases : undefined,
    seriesType: anilist.formatToSeriesType(manga.format),
    volume: undefined,

    // Rich data
    characters: characters.length > 0 ? characters : undefined,
    creators: creators.length > 0 ? creators : undefined,
    locations: undefined, // Not available in AniList
    objects: undefined, // Not available in AniList

    // Image variants
    imageUrls: {
      thumb: manga.coverImage.medium,
      small: manga.coverImage.medium,
      medium: manga.coverImage.large,
    },

    // Issue range (not applicable for manga)
    firstIssueNumber: manga.chapters ? '1' : undefined,
    lastIssueNumber: manga.chapters ? String(manga.chapters) : undefined,
  };
}

// =============================================================================
// AniList Provider Implementation
// =============================================================================

export const AniListProvider: MetadataProvider = {
  name: 'anilist' as MetadataSource,
  displayName: 'AniList',

  async checkAvailability(): Promise<AvailabilityResult> {
    const result = await anilist.checkApiAvailability();
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

    const result = await anilist.searchManga(query.series, {
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
    const manga = await anilist.getMangaById(id, sessionId);
    if (!manga) return null;
    return mangaToSeriesMetadata(manga);
  },

  /**
   * AniList does not provide per-chapter metadata.
   * For manga libraries, chapters are parsed from filenames.
   * Returns empty result.
   */
  async getSeriesIssues(_sourceId: string, _options?: PaginationOptions): Promise<IssueListResult> {
    return { results: [], total: 0, hasMore: false };
  },

  /**
   * AniList does not provide per-chapter metadata.
   * Returns null.
   */
  async getIssueById(_sourceId: string, _sessionId?: string): Promise<IssueMetadata | null> {
    return null;
  },
};

export default AniListProvider;
