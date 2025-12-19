/**
 * GCD (Grand Comics Database) Metadata Provider
 *
 * Implements the MetadataProvider interface for the GCD REST API.
 * Wraps the gcd.service.ts functions.
 *
 * Note: This is a beta provider. Users must:
 * 1. Configure gcdEmail and gcdPassword in their config
 * 2. Manually add 'gcd' to enabledSources
 *
 * GCD does not provide cover images in API responses, so coverUrl
 * will always be undefined. Cover images should be obtained from
 * other providers through the merge service.
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
} from './types.js';
import * as gcd from '../gcd.service.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert GCD series to SeriesMetadata
 */
function seriesToSeriesMetadata(series: gcd.GCDSeries): SeriesMetadata {
  return {
    source: 'gcd',
    sourceId: String(series.id),
    name: series.name,
    publisher: series.publisher?.name,
    startYear: series.year_began,
    endYear: series.year_ended,
    issueCount: series.issue_count,
    description: series.notes || series.publication_notes,
    // GCD doesn't provide cover images via API - intentionally undefined
    coverUrl: undefined,
    url: `https://www.comics.org/series/${series.id}/`,
    seriesType: series.series_type?.name,

    // GCD doesn't provide these at the series level
    characters: undefined,
    creators: undefined,
    locations: undefined,

    // GCD doesn't provide image variants
    imageUrls: undefined,

    // Get first/last issue numbers if available
    firstIssueNumber: series.issues?.[0]?.number,
    lastIssueNumber: series.issues?.[series.issues.length - 1]?.number,
  };
}

/**
 * Convert GCD issue to IssueMetadata
 */
function issueToIssueMetadata(issue: gcd.GCDIssue, series?: gcd.GCDSeries): IssueMetadata {
  // Parse credits from stories
  const credits = issue.stories ? gcd.parseIssueCredits(issue.stories) : {};

  // Get main story for character extraction
  const mainStory = issue.stories?.find(
    (s) => s.type?.name?.toLowerCase().includes('story') || s.sequence_number > 0
  );

  // Parse characters
  const characters = mainStory ? gcd.parseCharacters(mainStory.characters) : [];

  return {
    source: 'gcd',
    sourceId: String(issue.id),
    seriesId: String(issue.series?.id || ''),
    seriesName: series?.name || issue.series?.name || '',
    number: issue.number,
    title: issue.title || mainStory?.title,
    coverDate: issue.key_date || issue.publication_date,
    storeDate: issue.on_sale_date,
    description: mainStory?.synopsis,
    // GCD doesn't provide cover images via API - intentionally undefined
    coverUrl: undefined,
    url: `https://www.comics.org/issue/${issue.id}/`,
    publisher: series?.publisher?.name || issue.indicia_publisher?.name,

    // Credits (parsed from story text fields)
    writer: credits.writer,
    penciller: credits.penciller,
    inker: credits.inker,
    colorist: credits.colorist,
    letterer: credits.letterer,
    coverArtist: credits.coverArtist,
    editor: credits.editor,

    // Content
    characters: characters.length > 0 ? characters : undefined,
    teams: undefined, // GCD doesn't have team data
    locations: undefined, // GCD doesn't have location data
    storyArc: undefined, // GCD doesn't have story arc data at issue level
  };
}

/**
 * Convert issue stub (from series response) to IssueMetadata
 * These are minimal records - full details require separate getIssue call
 */
function issueStubToIssueMetadata(
  stub: { id: number; number: string; key_date?: string },
  seriesId: string,
  seriesName: string,
  publisher?: string
): IssueMetadata {
  return {
    source: 'gcd',
    sourceId: String(stub.id),
    seriesId,
    seriesName,
    number: stub.number,
    coverDate: stub.key_date,
    coverUrl: undefined,
    url: `https://www.comics.org/issue/${stub.id}/`,
    publisher,
  };
}

// =============================================================================
// GCD Provider Implementation
// =============================================================================

export const GCDProvider: MetadataProvider = {
  name: 'gcd' as MetadataSource,
  displayName: 'Grand Comics Database',

  async checkAvailability(): Promise<AvailabilityResult> {
    const result = await gcd.checkApiAvailability();
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

    const result = await gcd.searchSeries(query.series, {
      year: query.year,
      sessionId: options?.sessionId,
    });

    return {
      results: result.results.map(seriesToSeriesMetadata),
      total: result.total,
      hasMore: result.hasMore,
    };
  },

  async getSeriesById(sourceId: string, sessionId?: string): Promise<SeriesMetadata | null> {
    const id = parseInt(sourceId, 10);
    if (isNaN(id)) return null;

    const series = await gcd.getSeries(id, sessionId);
    if (!series) return null;

    return seriesToSeriesMetadata(series);
  },

  async getSeriesIssues(sourceId: string, options?: PaginationOptions): Promise<IssueListResult> {
    const id = parseInt(sourceId, 10);
    if (isNaN(id)) {
      return { results: [], total: 0, hasMore: false };
    }

    // Get series info first for publisher
    const series = await gcd.getSeries(id, options?.sessionId);
    if (!series) {
      return { results: [], total: 0, hasMore: false };
    }

    const result = await gcd.getSeriesIssues(id, {
      page: options?.page,
      sessionId: options?.sessionId,
    });

    // Convert issue stubs to IssueMetadata
    const issues = result.results.map((issue) =>
      issue.stories
        ? // Full issue data
          issueToIssueMetadata(issue, series)
        : // Stub data from series response
          issueStubToIssueMetadata(
            { id: issue.id, number: issue.number, key_date: issue.key_date },
            sourceId,
            series.name,
            series.publisher?.name
          )
    );

    return {
      results: issues,
      total: result.total,
      hasMore: result.hasMore,
    };
  },

  async getIssueById(sourceId: string, sessionId?: string): Promise<IssueMetadata | null> {
    const id = parseInt(sourceId, 10);
    if (isNaN(id)) return null;

    const issue = await gcd.getIssue(id, sessionId);
    if (!issue) return null;

    // Get series for publisher info
    let series: gcd.GCDSeries | null = null;
    if (issue.series?.id) {
      series = await gcd.getSeries(issue.series.id, sessionId);
    }

    return issueToIssueMetadata(issue, series || undefined);
  },
};

export default GCDProvider;
