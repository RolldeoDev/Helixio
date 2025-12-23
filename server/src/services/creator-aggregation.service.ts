/**
 * Creator Aggregation Service
 *
 * Aggregates creator credits from issue-level data to provide role-specific
 * creator information at the series level.
 *
 * ComicVine's volume (series) endpoint only returns creators without role info.
 * This service fetches issue data and aggregates person_credits by role.
 */

import * as comicVine from './comicvine.service.js';
import { comicvineLogger as logger } from './logger.service.js';

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
 * Aggregate creator roles from issue-level ComicVine data
 *
 * Fetches issues for a volume and extracts person_credits, grouping
 * creators by their roles (writer, penciller, inker, etc.)
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
    // Fetch issues for the volume (already includes person_credits)
    const issuesResponse = await comicVine.getVolumeIssues(volumeId, {
      limit: maxIssues,
      sessionId,
    });

    logger.debug(
      { volumeId, issueCount: issuesResponse.results.length, total: issuesResponse.total },
      'Fetched issues for aggregation'
    );

    // Process each issue's person_credits
    for (const issue of issuesResponse.results) {
      const credits = issue.person_credits || [];

      for (const credit of credits) {
        const role = matchRole(credit.role);
        if (role) {
          uniqueCreators[role].add(credit.name);
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
