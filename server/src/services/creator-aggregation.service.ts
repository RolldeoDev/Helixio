/**
 * Creator Aggregation Service
 *
 * Aggregates creator credits from issue-level data to provide role-specific
 * creator information at the series level.
 *
 * ComicVine's volume (series) endpoint only returns creators without role info.
 * This service fetches issue data and aggregates person_credits by role.
 *
 * NOTE: The ComicVine /issues/ bulk endpoint does NOT return person_credits
 * even when requested - credits are only available via individual /issue/{id}/ calls.
 * This service fetches issues individually to get the credit information.
 */

import * as comicVine from './comicvine.service.js';
import { comicvineLogger as logger } from './logger.service.js';
import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface CreatorsByRole {
  writer: string[];
  penciller: string[];
  inker: string[];
  colorist: string[];
  letterer: string[];
  coverArtist: string[];
  editor: string[];
}

interface AggregationOptions {
  /** Maximum issues to fetch for aggregation (default: 100) */
  maxIssues?: number;
  /** Session ID for request tracking */
  sessionId?: string;
}

// =============================================================================
// Role Matching
// =============================================================================

/**
 * Role matching patterns - maps ComicVine role strings to our standard roles
 * ComicVine uses various spellings and formats (writer, Writer, penciler, penciller, etc.)
 */
const ROLE_MATCHERS: Array<{
  field: keyof CreatorsByRole;
  patterns: string[];
}> = [
  { field: 'writer', patterns: ['writer'] },
  { field: 'penciller', patterns: ['pencil', 'penciller', 'penciler'] },
  { field: 'inker', patterns: ['inker', 'ink'] },
  { field: 'colorist', patterns: ['colorist', 'color', 'colours', 'colourist'] },
  { field: 'letterer', patterns: ['letterer', 'letter'] },
  { field: 'coverArtist', patterns: ['cover'] },
  { field: 'editor', patterns: ['editor'] },
];

/**
 * Match a role string to our standardized role fields
 */
function matchRole(roleString: string): keyof CreatorsByRole | null {
  const lowerRole = roleString.toLowerCase();
  for (const { field, patterns } of ROLE_MATCHERS) {
    if (patterns.some((pattern) => lowerRole.includes(pattern))) {
      return field;
    }
  }
  return null;
}

// =============================================================================
// Aggregation
// =============================================================================

/**
 * Helper to delay execution (for rate limiting)
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch issues in parallel batches with rate limiting
 *
 * @param issueIds - Array of issue IDs to fetch
 * @param batchSize - Number of issues to fetch in parallel (default: 5)
 * @param delayBetweenBatches - Delay in ms between batches (default: 200)
 * @param sessionId - Optional session ID for request tracking
 */
async function fetchIssuesInBatches(
  issueIds: number[],
  batchSize: number = 5,
  delayBetweenBatches: number = 200,
  sessionId?: string
): Promise<Array<Awaited<ReturnType<typeof comicVine.getIssue>>>> {
  const results: Array<Awaited<ReturnType<typeof comicVine.getIssue>>> = [];

  for (let i = 0; i < issueIds.length; i += batchSize) {
    const batch = issueIds.slice(i, i + batchSize);

    // Fetch batch in parallel
    const batchResults = await Promise.all(
      batch.map((issueId) =>
        comicVine.getIssue(issueId, sessionId).catch((err) => {
          logger.warn({ issueId, error: err }, 'Failed to fetch issue, skipping');
          return null;
        })
      )
    );

    results.push(...batchResults);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < issueIds.length) {
      await delay(delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Aggregate creator roles from issue-level ComicVine data
 *
 * Fetches issues for a volume and extracts person_credits, grouping
 * creators by their roles (writer, penciller, inker, etc.)
 *
 * NOTE: This function must fetch each issue individually because the
 * ComicVine /issues/ bulk endpoint does NOT return person_credits.
 * Credits are only available via individual /issue/{id}/ calls.
 *
 * Uses parallel batch fetching for efficiency (5 issues at a time with
 * 200ms delay between batches to respect rate limits).
 *
 * @param volumeId - ComicVine volume ID
 * @param options - Aggregation options
 * @returns Object with arrays of unique creator names per role
 */
export async function aggregateCreatorRolesFromIssues(
  volumeId: number,
  options: AggregationOptions = {}
): Promise<CreatorsByRole> {
  const { maxIssues = 100, sessionId } = options;

  logger.debug({ volumeId, maxIssues }, 'Starting creator aggregation from issues');

  // Initialize result with empty arrays
  const result: CreatorsByRole = {
    writer: [],
    penciller: [],
    inker: [],
    colorist: [],
    letterer: [],
    coverArtist: [],
    editor: [],
  };

  // Track unique creators per role using Sets
  const uniqueCreators: Record<keyof CreatorsByRole, Set<string>> = {
    writer: new Set(),
    penciller: new Set(),
    inker: new Set(),
    colorist: new Set(),
    letterer: new Set(),
    coverArtist: new Set(),
    editor: new Set(),
  };

  try {
    // First, get the list of issue IDs from the volume
    // The bulk endpoint returns basic issue info but NOT person_credits
    const issuesResponse = await comicVine.getVolumeIssues(volumeId, {
      limit: maxIssues,
      sessionId,
    });

    const issueIds = issuesResponse.results.map((issue) => issue.id).slice(0, maxIssues);
    const totalIssues = issueIds.length;

    logger.info(
      { volumeId, issueCount: totalIssues, total: issuesResponse.total },
      'Fetching individual issues for creator credits (parallel batches)'
    );

    // Fetch issues in parallel batches (5 at a time, 200ms between batches)
    // For 50 issues: ~10 batches * 200ms = ~2 seconds (vs ~5 seconds sequential)
    const issues = await fetchIssuesInBatches(issueIds, 5, 200, sessionId);

    // Process credits from all fetched issues
    let fetchedCount = 0;
    for (const issue of issues) {
      if (issue?.person_credits) {
        fetchedCount++;
        for (const credit of issue.person_credits) {
          const role = matchRole(credit.role);
          if (role) {
            uniqueCreators[role].add(credit.name);
          }
        }
      }
    }

    // Convert Sets to arrays
    for (const role of Object.keys(uniqueCreators) as Array<keyof CreatorsByRole>) {
      result[role] = Array.from(uniqueCreators[role]).sort();
    }

    logger.info(
      {
        volumeId,
        issuesFetched: fetchedCount,
        writers: result.writer.length,
        pencillers: result.penciller.length,
        inkers: result.inker.length,
        colorists: result.colorist.length,
        letterers: result.letterer.length,
        coverArtists: result.coverArtist.length,
        editors: result.editor.length,
      },
      'Completed creator aggregation'
    );

    return result;
  } catch (error) {
    logger.error({ volumeId, error }, 'Failed to aggregate creator roles');
    throw error;
  }
}

/**
 * Check if a CreatorsByRole object has any creators
 */
export function hasAnyCreators(creators: CreatorsByRole): boolean {
  return (
    creators.writer.length > 0 ||
    creators.penciller.length > 0 ||
    creators.inker.length > 0 ||
    creators.colorist.length > 0 ||
    creators.letterer.length > 0 ||
    creators.coverArtist.length > 0 ||
    creators.editor.length > 0
  );
}

/**
 * Convert CreatorsByRole to JSON string for database storage
 */
export function creatorsToJson(creators: CreatorsByRole): string {
  return JSON.stringify(creators);
}

/**
 * Parse JSON string to CreatorsByRole (with validation)
 */
export function jsonToCreators(json: string | null): CreatorsByRole | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);

    // Validate structure
    const result: CreatorsByRole = {
      writer: Array.isArray(parsed.writer) ? parsed.writer : [],
      penciller: Array.isArray(parsed.penciller) ? parsed.penciller : [],
      inker: Array.isArray(parsed.inker) ? parsed.inker : [],
      colorist: Array.isArray(parsed.colorist) ? parsed.colorist : [],
      letterer: Array.isArray(parsed.letterer) ? parsed.letterer : [],
      coverArtist: Array.isArray(parsed.coverArtist) ? parsed.coverArtist : [],
      editor: Array.isArray(parsed.editor) ? parsed.editor : [],
    };

    return result;
  } catch {
    logger.warn({ json }, 'Failed to parse creatorsJson');
    return null;
  }
}

/**
 * Sync individual role fields from CreatorsByRole
 * Returns object with role fields as comma-separated strings
 */
export function creatorsToRoleFields(creators: CreatorsByRole): Record<string, string | null> {
  return {
    writer: creators.writer.length > 0 ? creators.writer.join(', ') : null,
    penciller: creators.penciller.length > 0 ? creators.penciller.join(', ') : null,
    inker: creators.inker.length > 0 ? creators.inker.join(', ') : null,
    colorist: creators.colorist.length > 0 ? creators.colorist.join(', ') : null,
    letterer: creators.letterer.length > 0 ? creators.letterer.join(', ') : null,
    coverArtist: creators.coverArtist.length > 0 ? creators.coverArtist.join(', ') : null,
    editor: creators.editor.length > 0 ? creators.editor.join(', ') : null,
  };
}

/**
 * Build CreatorsByRole from individual role fields
 */
export function roleFieldsToCreators(fields: {
  writer?: string | null;
  penciller?: string | null;
  inker?: string | null;
  colorist?: string | null;
  letterer?: string | null;
  coverArtist?: string | null;
  editor?: string | null;
}): CreatorsByRole {
  const parseField = (value: string | null | undefined): string[] => {
    if (!value) return [];
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return {
    writer: parseField(fields.writer),
    penciller: parseField(fields.penciller),
    inker: parseField(fields.inker),
    colorist: parseField(fields.colorist),
    letterer: parseField(fields.letterer),
    coverArtist: parseField(fields.coverArtist),
    editor: parseField(fields.editor),
  };
}

// =============================================================================
// Local Issue Aggregation (From FileMetadata)
// =============================================================================

export interface LocalAggregationResult {
  success: boolean;
  creatorsWithRoles?: CreatorsByRole;
  coverage?: {
    issuesWithCreators: number;
    totalIssues: number;
  };
  error?: string;
}

/**
 * Aggregate creators from local FileMetadata records
 *
 * Unlike aggregateCreatorRolesFromIssues (which fetches from ComicVine),
 * this function uses data already stored in the database from ComicInfo.xml
 * or previously fetched metadata.
 *
 * @param seriesId - Internal series ID
 * @returns Object with aggregated creators and coverage statistics
 */
export async function aggregateCreatorsFromLocalIssues(
  seriesId: string
): Promise<LocalAggregationResult> {
  const db = getDatabase();

  try {
    // Get series with all its issues and their metadata
    const series = await db.series.findUnique({
      where: { id: seriesId },
      include: {
        issues: {
          include: { metadata: true },
        },
      },
    });

    if (!series) {
      return { success: false, error: 'Series not found' };
    }

    // Track unique creators per role using Sets
    const uniqueCreators: Record<keyof CreatorsByRole, Set<string>> = {
      writer: new Set(),
      penciller: new Set(),
      inker: new Set(),
      colorist: new Set(),
      letterer: new Set(),
      coverArtist: new Set(),
      editor: new Set(),
    };

    let issuesWithCreators = 0;

    // Process each issue's metadata
    for (const issue of series.issues) {
      const meta = issue.metadata;
      if (!meta) continue;

      let hasAnyCreator = false;

      // Parse comma-separated creator fields using roleFieldsToCreators helper
      const issueCreators = roleFieldsToCreators({
        writer: meta.writer,
        penciller: meta.penciller,
        inker: meta.inker,
        colorist: meta.colorist,
        letterer: meta.letterer,
        coverArtist: meta.coverArtist,
        editor: meta.editor,
      });

      // Merge into unique sets
      for (const role of Object.keys(uniqueCreators) as Array<keyof CreatorsByRole>) {
        for (const name of issueCreators[role]) {
          uniqueCreators[role].add(name);
          hasAnyCreator = true;
        }
      }

      if (hasAnyCreator) issuesWithCreators++;
    }

    // Convert Sets to sorted arrays
    const result: CreatorsByRole = {
      writer: Array.from(uniqueCreators.writer).sort(),
      penciller: Array.from(uniqueCreators.penciller).sort(),
      inker: Array.from(uniqueCreators.inker).sort(),
      colorist: Array.from(uniqueCreators.colorist).sort(),
      letterer: Array.from(uniqueCreators.letterer).sort(),
      coverArtist: Array.from(uniqueCreators.coverArtist).sort(),
      editor: Array.from(uniqueCreators.editor).sort(),
    };

    logger.info(
      {
        seriesId,
        issuesWithCreators,
        totalIssues: series.issues.length,
        writers: result.writer.length,
        pencillers: result.penciller.length,
      },
      'Completed local creator aggregation'
    );

    return {
      success: true,
      creatorsWithRoles: result,
      coverage: {
        issuesWithCreators,
        totalIssues: series.issues.length,
      },
    };
  } catch (error) {
    logger.error({ seriesId, error }, 'Failed to aggregate local creators');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
