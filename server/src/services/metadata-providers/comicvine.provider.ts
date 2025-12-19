/**
 * ComicVine Metadata Provider
 *
 * Implements the MetadataProvider interface for ComicVine API.
 * Wraps the existing comicvine.service.ts functions.
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
import * as comicVine from '../comicvine.service.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert ComicVine credits to unified Credit format
 */
function convertCredits(credits: comicVine.ComicVineCredit[] | undefined): Credit[] | undefined {
  if (!credits || credits.length === 0) return undefined;
  return credits.map((c) => ({
    id: c.id,
    name: c.name,
    count: c.count,
  }));
}

/**
 * Convert ComicVine volume to SeriesMetadata
 */
function volumeToSeriesMetadata(volume: comicVine.ComicVineVolume): SeriesMetadata {
  return {
    source: 'comicvine',
    sourceId: String(volume.id),
    name: volume.name,
    publisher: volume.publisher?.name,
    startYear: volume.start_year ? parseInt(volume.start_year, 10) : undefined,
    issueCount: volume.count_of_issues,
    description: volume.description?.replace(/<[^>]*>/g, '').substring(0, 2000),
    shortDescription: volume.deck,
    coverUrl: volume.image?.medium_url || volume.image?.small_url,
    url: volume.site_detail_url,
    aliases: volume.aliases?.split('\n').filter(Boolean),

    // Rich data
    characters: convertCredits(volume.characters?.slice(0, 20)),
    creators: convertCredits(volume.creators?.slice(0, 20)),
    locations: convertCredits(volume.locations?.slice(0, 10)),
    objects: convertCredits(volume.objects?.slice(0, 10)),

    // Image variants
    imageUrls: volume.image
      ? {
          thumb: volume.image.thumb_url,
          small: volume.image.small_url,
          medium: volume.image.medium_url,
        }
      : undefined,

    // Issue range
    firstIssueNumber: volume.first_issue?.issue_number,
    lastIssueNumber: volume.last_issue?.issue_number,
  };
}

/**
 * Convert ComicVine issue to IssueMetadata
 */
function issueToIssueMetadata(
  issue: comicVine.ComicVineIssue,
  volume?: comicVine.ComicVineVolume
): IssueMetadata {
  // Extract creators by role
  const getCreatorsByRole = (role: string): string | undefined => {
    const creators = issue.person_credits?.filter((p) =>
      p.role.toLowerCase().includes(role.toLowerCase())
    );
    if (!creators || creators.length === 0) return undefined;
    return creators.map((c) => c.name).join(', ');
  };

  return {
    source: 'comicvine',
    sourceId: String(issue.id),
    seriesId: String(issue.volume?.id || ''),
    seriesName: volume?.name || issue.volume?.name || '',
    number: issue.issue_number,
    title: issue.name,
    coverDate: issue.cover_date,
    storeDate: issue.store_date,
    description: issue.deck || issue.description?.replace(/<[^>]*>/g, '').substring(0, 2000),
    coverUrl: issue.image?.medium_url || issue.image?.small_url,
    url: issue.site_detail_url,
    publisher: volume?.publisher?.name,

    // Credits
    writer: getCreatorsByRole('writer'),
    penciller: getCreatorsByRole('penciler') || getCreatorsByRole('penciller'),
    inker: getCreatorsByRole('inker'),
    colorist: getCreatorsByRole('colorist'),
    letterer: getCreatorsByRole('letterer'),
    coverArtist: getCreatorsByRole('cover'),
    editor: getCreatorsByRole('editor'),

    // Content
    characters: issue.character_credits?.map((c) => c.name),
    teams: issue.team_credits?.map((t) => t.name),
    locations: issue.location_credits?.map((l) => l.name),
    storyArc: issue.story_arc_credits?.map((s) => s.name).join(', '),
  };
}

// =============================================================================
// ComicVine Provider Implementation
// =============================================================================

export const ComicVineProvider: MetadataProvider = {
  name: 'comicvine' as MetadataSource,
  displayName: 'ComicVine',

  async checkAvailability(): Promise<AvailabilityResult> {
    const result = await comicVine.checkApiAvailability();
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

    const result = await comicVine.searchVolumes(query.series, {
      limit: options?.limit || 10,
      offset: options?.offset || 0,
      sessionId: options?.sessionId,
    });

    return {
      results: result.results.map(volumeToSeriesMetadata),
      total: result.total,
      hasMore: result.offset + result.results.length < result.total,
    };
  },

  async getSeriesById(sourceId: string, sessionId?: string): Promise<SeriesMetadata | null> {
    const id = parseInt(sourceId, 10);
    const volume = await comicVine.getVolume(id, sessionId);
    if (!volume) return null;
    return volumeToSeriesMetadata(volume);
  },

  async getSeriesIssues(sourceId: string, options?: PaginationOptions): Promise<IssueListResult> {
    const id = parseInt(sourceId, 10);
    const limit = options?.limit || 100;
    const page = options?.page || 1;
    const offset = (page - 1) * limit;

    const result = await comicVine.getVolumeIssues(id, {
      limit,
      offset,
      sessionId: options?.sessionId,
    });

    // Get volume info for publisher
    const volume = await comicVine.getVolume(id, options?.sessionId);

    return {
      results: result.results.map((issue) => issueToIssueMetadata(issue, volume || undefined)),
      total: result.total,
      hasMore: result.offset + result.results.length < result.total,
    };
  },

  async getIssueById(sourceId: string, sessionId?: string): Promise<IssueMetadata | null> {
    const id = parseInt(sourceId, 10);
    const issue = await comicVine.getIssue(id, sessionId);
    if (!issue) return null;

    // Get volume for publisher info
    let volume: comicVine.ComicVineVolume | null = null;
    if (issue.volume?.id) {
      volume = await comicVine.getVolume(issue.volume.id, sessionId);
    }

    return issueToIssueMetadata(issue, volume || undefined);
  },
};

export default ComicVineProvider;
