/**
 * Metron Metadata Provider
 *
 * Implements the MetadataProvider interface for Metron API.
 * Wraps the existing metron.service.ts functions.
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
import * as metron from '../metron.service.js';
import { isMetronAvailable } from '../metron.service.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Metron series to SeriesMetadata
 */
function seriesToSeriesMetadata(series: metron.MetronSeries): SeriesMetadata {
  return {
    source: 'metron',
    sourceId: String(series.id),
    name: metron.getSeriesName(series),
    publisher: series.publisher?.name,
    startYear: series.year_began,
    endYear: series.year_end,
    issueCount: series.issue_count,
    description: series.desc,
    coverUrl: series.image,
    url: series.resource_url,
    seriesType: series.series_type?.name,
    volume: series.volume,

    // Metron doesn't provide these at the series level
    // They would need to be aggregated from issues
    characters: undefined,
    creators: undefined,
    locations: undefined,

    // Image variants (Metron only provides one image)
    imageUrls: series.image
      ? {
          thumb: series.image,
          small: series.image,
          medium: series.image,
        }
      : undefined,
  };
}

/**
 * Convert Metron issue to IssueMetadata
 */
function issueToIssueMetadata(
  issue: metron.MetronIssue,
  series?: metron.MetronSeries
): IssueMetadata {
  // Extract creators by role
  const getCreatorsByRole = (roleName: string): string | undefined => {
    if (!issue.credits) return undefined;
    const creators = issue.credits.filter((c) =>
      c.role.some((r) => r.name.toLowerCase().includes(roleName.toLowerCase()))
    );
    if (creators.length === 0) return undefined;
    return creators.map((c) => c.creator).join(', ');
  };

  return {
    source: 'metron',
    sourceId: String(issue.id),
    seriesId: String(issue.series?.id || ''),
    seriesName: series?.name || issue.series?.name || '',
    number: issue.number,
    title: issue.title || (issue.name && issue.name.length > 0 ? issue.name[0] : undefined),
    coverDate: issue.cover_date,
    storeDate: issue.store_date,
    description: issue.desc,
    coverUrl: issue.image,
    url: issue.resource_url,
    publisher: series?.publisher?.name || issue.publisher?.name,

    // Credits
    writer: getCreatorsByRole('writer'),
    penciller: getCreatorsByRole('penciller') || getCreatorsByRole('artist'),
    inker: getCreatorsByRole('inker'),
    colorist: getCreatorsByRole('colorist'),
    letterer: getCreatorsByRole('letterer'),
    coverArtist: getCreatorsByRole('cover'),
    editor: getCreatorsByRole('editor'),

    // Content
    characters: issue.characters?.map((c) => c.name),
    teams: issue.teams?.map((t) => t.name),
    storyArc: issue.arcs?.map((a) => a.name).join(', '),
    // Metron doesn't have locations at issue level
    locations: undefined,
  };
}

// =============================================================================
// Metron Provider Implementation
// =============================================================================

export const MetronProvider: MetadataProvider = {
  name: 'metron' as MetadataSource,
  displayName: 'Metron',

  async checkAvailability(): Promise<AvailabilityResult> {
    // First check if credentials are configured
    if (!isMetronAvailable()) {
      return {
        available: false,
        configured: false,
        error: 'Metron credentials not configured. Add metronUsername and metronPassword in settings.',
      };
    }

    // Then check if the API is reachable
    const result = await metron.checkApiAvailability();
    return {
      available: result.available,
      configured: true,
      error: result.error,
    };
  },

  async searchSeries(query: SearchQuery, options?: SearchOptions): Promise<SeriesSearchResult> {
    if (!query.series || !isMetronAvailable()) {
      return { results: [], total: 0, hasMore: false };
    }

    // Metron uses page-based pagination
    const page = options?.offset ? Math.floor(options.offset / (options.limit || 10)) + 1 : 1;

    const result = await metron.searchSeries(query.series, {
      page,
      publisher: query.publisher,
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
    if (!isMetronAvailable()) return null;

    const id = parseInt(sourceId, 10);
    const series = await metron.getSeries(id, sessionId);
    if (!series) return null;
    return seriesToSeriesMetadata(series);
  },

  async getSeriesIssues(sourceId: string, options?: PaginationOptions): Promise<IssueListResult> {
    if (!isMetronAvailable()) {
      return { results: [], total: 0, hasMore: false };
    }

    const id = parseInt(sourceId, 10);

    const result = await metron.getSeriesIssues(id, {
      page: options?.page || 1,
      sessionId: options?.sessionId,
    });

    // Get series info for publisher
    const series = await metron.getSeries(id, options?.sessionId);

    return {
      results: result.results.map((issue) => issueToIssueMetadata(issue, series || undefined)),
      total: result.total,
      hasMore: result.hasMore,
    };
  },

  async getIssueById(sourceId: string, sessionId?: string): Promise<IssueMetadata | null> {
    if (!isMetronAvailable()) return null;

    const id = parseInt(sourceId, 10);
    const issue = await metron.getIssue(id, sessionId);
    if (!issue) return null;

    // Get series for publisher info
    let series: metron.MetronSeries | null = null;
    if (issue.series?.id) {
      series = await metron.getSeries(issue.series.id, sessionId);
    }

    return issueToIssueMetadata(issue, series || undefined);
  },
};

export default MetronProvider;
