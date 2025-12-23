/**
 * Issue Metadata Fetch Service
 *
 * Handles fetching and applying metadata for individual issues from external APIs.
 * Uses existing ComicInfo.xml data and series context to search for matches.
 */

import { getDatabase } from './database.service.js';
import { readComicInfo, mergeComicInfo, type ComicInfo } from './comicinfo.service.js';
import { getCachedMetadata, cacheFileMetadata } from './metadata-cache.service.js';
import { getIssue, getVolumeIssues, issueToComicInfo, type ComicVineIssue } from './comicvine.service.js';
import { convertCbrToCbz } from './conversion.service.js';
import { getArchiveFormat } from './archive.service.js';
import { createServiceLogger } from './logger.service.js';
import { basename, extname } from 'path';

const logger = createServiceLogger('issue-metadata-fetch');

// =============================================================================
// Types
// =============================================================================

export type MetadataSource = 'comicvine' | 'metron';

export interface IssueMatch {
  id: string;
  source: MetadataSource;
  issueNumber: string;
  title?: string;
  coverDate?: string;
  coverUrl?: string;
  volumeName?: string;
  volumeId?: string;
  confidence: number;
}

export interface IssueMetadata {
  // Basic info
  series?: string;
  number?: string;
  title?: string;
  volume?: number;
  alternateSeries?: string;
  alternateNumber?: string;
  alternateCount?: number;
  summary?: string;

  // Date
  year?: number;
  month?: number;
  day?: number;

  // Credits
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;

  // Content
  characters?: string;
  teams?: string;
  locations?: string;
  storyArc?: string;

  // Publishing
  publisher?: string;
  count?: number;
  pageCount?: number;
  format?: string;
  languageISO?: string;
  ageRating?: string;

  // Cover
  coverUrl?: string;

  // Source info
  sourceId?: string;
  source?: MetadataSource;
}

export interface PreviewField {
  name: string;
  label: string;
  current: string | null;
  proposed: string | null;
  selected: boolean;
  isLocked: boolean;
  hasChanged: boolean;
}

export interface SearchResult {
  results: IssueMatch[];
  usedCache: boolean;
  source: MetadataSource;
}

export interface ApplyResult {
  success: boolean;
  converted?: boolean;
  newPath?: string;
  operationId?: string;
  error?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate confidence score for an issue match.
 */
function calculateIssueConfidence(
  searchNumber: string | undefined,
  matchNumber: string,
  searchTitle?: string,
  matchTitle?: string
): number {
  let confidence = 0.5; // Base confidence

  // Issue number match (most important)
  if (searchNumber) {
    const normalizedSearch = normalizeIssueNumber(searchNumber);
    const normalizedMatch = normalizeIssueNumber(matchNumber);

    if (normalizedSearch === normalizedMatch) {
      confidence += 0.4;
    } else if (
      Math.abs(parseFloat(normalizedSearch) - parseFloat(normalizedMatch)) < 0.1
    ) {
      confidence += 0.3;
    }
  }

  // Title match bonus
  if (searchTitle && matchTitle) {
    const similarity = calculateStringSimilarity(
      searchTitle.toLowerCase(),
      matchTitle.toLowerCase()
    );
    confidence += similarity * 0.1;
  }

  return Math.min(1, confidence);
}

/**
 * Normalize issue number for comparison.
 */
function normalizeIssueNumber(num: string): string {
  // Remove leading zeros, handle decimals
  const cleaned = num.replace(/^0+/, '') || '0';
  return cleaned;
}

/**
 * Calculate string similarity using Levenshtein distance.
 */
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance calculation.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1]!;
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]!) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length]!;
}

/**
 * Determine if a field should be auto-selected.
 * Smart defaults: empty fields auto-selected, populated fields require explicit selection.
 */
function getFieldDefaultSelection(
  current: string | null | undefined,
  proposed: string | null | undefined,
  isLocked: boolean
): boolean {
  if (isLocked) return false;
  if (!current && proposed) return true; // Empty → auto-select
  if (current && proposed && current !== proposed) return false; // Different → require explicit
  return false; // Same or no proposed → skip
}

/**
 * Extract external ID from Web URL.
 */
function extractComicVineIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  // URL format: https://comicvine.gamespot.com/issue/4000-{id}/
  const match = url.match(/\/issue\/4000-(\d+)/);
  return match ? match[1]! : null;
}

/**
 * Convert ComicVine issue to IssueMetadata format.
 */
function comicVineIssueToMetadata(issue: ComicVineIssue): IssueMetadata {
  const comicInfo = issueToComicInfo(issue);

  return {
    series: comicInfo.Series as string | undefined,
    number: comicInfo.Number as string | undefined,
    title: comicInfo.Title as string | undefined,
    summary: comicInfo.Summary as string | undefined,
    year: comicInfo.Year as number | undefined,
    month: comicInfo.Month as number | undefined,
    day: comicInfo.Day as number | undefined,
    writer: comicInfo.Writer as string | undefined,
    penciller: comicInfo.Penciller as string | undefined,
    inker: comicInfo.Inker as string | undefined,
    colorist: comicInfo.Colorist as string | undefined,
    letterer: comicInfo.Letterer as string | undefined,
    coverArtist: comicInfo.CoverArtist as string | undefined,
    editor: comicInfo.Editor as string | undefined,
    characters: comicInfo.Characters as string | undefined,
    teams: comicInfo.Teams as string | undefined,
    locations: comicInfo.Locations as string | undefined,
    storyArc: comicInfo.StoryArc as string | undefined,
    publisher: comicInfo.Publisher as string | undefined,
    count: comicInfo.Count as number | undefined,
    coverUrl: issue.image?.medium_url || issue.image?.small_url,
    sourceId: String(issue.id),
    source: 'comicvine',
  };
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Search for issue metadata using existing file data and series context.
 */
export async function searchIssueMetadata(
  fileId: string,
  options: { query?: string; source?: MetadataSource } = {}
): Promise<SearchResult> {
  const prisma = getDatabase();

  // Get file with series context
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: true,
      metadata: true,
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  // Read existing ComicInfo.xml
  const comicInfoResult = await readComicInfo(file.path);
  const comicInfo = comicInfoResult.comicInfo;

  // Determine search parameters
  const seriesName = options.query || comicInfo?.Series || file.series?.name;
  const issueNumber = comicInfo?.Number || file.metadata?.number;
  const year = comicInfo?.Year || file.metadata?.year;

  if (!seriesName) {
    return {
      results: [],
      usedCache: false,
      source: options.source || 'comicvine',
    };
  }

  // Determine source based on series links or user preference
  let source: MetadataSource = options.source || 'comicvine';
  if (!options.source && file.series) {
    if (file.series.comicVineId) {
      source = 'comicvine';
    } else if (file.series.metronId) {
      source = 'metron';
    }
  }

  // Check for existing issue ID in Web field
  const existingIssueId = extractComicVineIdFromUrl(comicInfo?.Web);
  const existingMetadataId = file.metadata?.comicVineId;

  const results: IssueMatch[] = [];

  if (source === 'comicvine') {
    // If we have a series with ComicVine ID, search within that volume
    if (file.series?.comicVineId) {
      const volumeId = parseInt(file.series.comicVineId, 10);
      const issuesResult = await getVolumeIssues(volumeId, { limit: 100 });

      for (const issue of issuesResult.results) {
        const confidence = calculateIssueConfidence(
          issueNumber?.toString(),
          issue.issue_number,
          comicInfo?.Title,
          issue.name
        );

        results.push({
          id: String(issue.id),
          source: 'comicvine',
          issueNumber: issue.issue_number,
          title: issue.name,
          coverDate: issue.cover_date,
          coverUrl: issue.image?.medium_url || issue.image?.small_url,
          volumeName: issue.volume?.name,
          volumeId: issue.volume ? String(issue.volume.id) : undefined,
          confidence,
        });
      }

      // Sort by confidence, prioritizing exact issue number matches
      results.sort((a, b) => {
        // Exact match gets priority
        if (issueNumber) {
          const aExact = normalizeIssueNumber(a.issueNumber) === normalizeIssueNumber(issueNumber.toString());
          const bExact = normalizeIssueNumber(b.issueNumber) === normalizeIssueNumber(issueNumber.toString());
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
        }
        return b.confidence - a.confidence;
      });
    } else {
      // No series context - would need to search volumes first
      // For now, return empty and let user refine search
      logger.debug('No series context for ComicVine search');
    }
  }

  // If we have an existing issue ID, ensure it's in the results
  if (existingIssueId || existingMetadataId) {
    const knownId = existingIssueId || existingMetadataId;
    const hasKnownId = results.some((r) => r.id === knownId);
    if (!hasKnownId && knownId) {
      // Fetch the known issue and add it to results
      const knownIssue = await getIssue(parseInt(knownId, 10));
      if (knownIssue) {
        results.unshift({
          id: String(knownIssue.id),
          source: 'comicvine',
          issueNumber: knownIssue.issue_number,
          title: knownIssue.name,
          coverDate: knownIssue.cover_date,
          coverUrl: knownIssue.image?.medium_url || knownIssue.image?.small_url,
          volumeName: knownIssue.volume?.name,
          volumeId: knownIssue.volume ? String(knownIssue.volume.id) : undefined,
          confidence: 1.0, // Known match
        });
      }
    }
  }

  return {
    results: results.slice(0, 20), // Limit to 20 results
    usedCache: false, // TODO: integrate with API cache
    source,
  };
}

/**
 * Fetch full metadata for a specific issue by ID.
 */
export async function fetchIssueById(
  source: MetadataSource,
  issueId: string
): Promise<IssueMetadata | null> {
  if (source === 'comicvine') {
    const issue = await getIssue(parseInt(issueId, 10));
    if (!issue) return null;
    return comicVineIssueToMetadata(issue);
  }

  // TODO: Add Metron support
  return null;
}

/**
 * Generate preview of changes for an issue.
 */
export async function previewIssueChanges(
  fileId: string,
  proposedMetadata: IssueMetadata,
  source: MetadataSource,
  issueId: string
): Promise<{ fields: PreviewField[]; lockedFields: string[] }> {
  const prisma = getDatabase();

  // Get file with metadata
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: true,
      series: {
        select: {
          lockedFields: true,
        },
      },
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  // Read current ComicInfo.xml
  const comicInfoResult = await readComicInfo(file.path);
  const current = comicInfoResult.comicInfo || {};

  // Get locked fields from series
  const lockedFieldsRaw = file.series?.lockedFields;
  const lockedFields: string[] = lockedFieldsRaw
    ? (JSON.parse(lockedFieldsRaw) as string[])
    : [];

  // Define field mappings
  const fieldMappings: Array<{
    name: string;
    label: string;
    currentKey: keyof ComicInfo;
    proposedKey: keyof IssueMetadata;
  }> = [
    { name: 'series', label: 'Series', currentKey: 'Series', proposedKey: 'series' },
    { name: 'number', label: 'Issue Number', currentKey: 'Number', proposedKey: 'number' },
    { name: 'title', label: 'Title', currentKey: 'Title', proposedKey: 'title' },
    { name: 'summary', label: 'Summary', currentKey: 'Summary', proposedKey: 'summary' },
    { name: 'year', label: 'Year', currentKey: 'Year', proposedKey: 'year' },
    { name: 'month', label: 'Month', currentKey: 'Month', proposedKey: 'month' },
    { name: 'day', label: 'Day', currentKey: 'Day', proposedKey: 'day' },
    { name: 'writer', label: 'Writer', currentKey: 'Writer', proposedKey: 'writer' },
    { name: 'penciller', label: 'Penciller', currentKey: 'Penciller', proposedKey: 'penciller' },
    { name: 'inker', label: 'Inker', currentKey: 'Inker', proposedKey: 'inker' },
    { name: 'colorist', label: 'Colorist', currentKey: 'Colorist', proposedKey: 'colorist' },
    { name: 'letterer', label: 'Letterer', currentKey: 'Letterer', proposedKey: 'letterer' },
    { name: 'coverArtist', label: 'Cover Artist', currentKey: 'CoverArtist', proposedKey: 'coverArtist' },
    { name: 'editor', label: 'Editor', currentKey: 'Editor', proposedKey: 'editor' },
    { name: 'characters', label: 'Characters', currentKey: 'Characters', proposedKey: 'characters' },
    { name: 'teams', label: 'Teams', currentKey: 'Teams', proposedKey: 'teams' },
    { name: 'locations', label: 'Locations', currentKey: 'Locations', proposedKey: 'locations' },
    { name: 'storyArc', label: 'Story Arc', currentKey: 'StoryArc', proposedKey: 'storyArc' },
    { name: 'publisher', label: 'Publisher', currentKey: 'Publisher', proposedKey: 'publisher' },
  ];

  const fields: PreviewField[] = [];

  for (const mapping of fieldMappings) {
    const currentValue = current[mapping.currentKey];
    const proposedValue = proposedMetadata[mapping.proposedKey];

    const currentStr = currentValue != null ? String(currentValue) : null;
    const proposedStr = proposedValue != null ? String(proposedValue) : null;

    const isLocked = lockedFields.includes(mapping.name);
    const hasChanged = currentStr !== proposedStr && proposedStr !== null;

    fields.push({
      name: mapping.name,
      label: mapping.label,
      current: currentStr,
      proposed: proposedStr,
      selected: getFieldDefaultSelection(currentStr, proposedStr, isLocked),
      isLocked,
      hasChanged,
    });
  }

  return { fields, lockedFields };
}

/**
 * Apply metadata changes to a file.
 */
export async function applyIssueMetadata(
  fileId: string,
  proposedMetadata: IssueMetadata,
  selectedFields: string[],
  options: {
    source: MetadataSource;
    issueId: string;
    coverAction?: 'keep' | 'download' | 'replace';
  }
): Promise<ApplyResult> {
  const prisma = getDatabase();

  // Get file
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: {
        select: { lockedFields: true },
      },
    },
  });

  if (!file) {
    return { success: false, error: 'File not found' };
  }

  let filePath = file.path;
  let converted = false;

  try {
    // Check if CBR needs conversion
    const format = getArchiveFormat(filePath);
    if (format === 'rar') {
      logger.info({ fileId, path: filePath }, 'Converting CBR to CBZ before applying metadata');
      const conversionResult = await convertCbrToCbz(filePath, {
        deleteOriginal: true,
      });

      if (!conversionResult.success) {
        return { success: false, error: `Conversion failed: ${conversionResult.error}` };
      }

      filePath = conversionResult.destination!;
      converted = true;
    }

    // Build ComicInfo update object with only selected fields
    const lockedFieldsRaw = file.series?.lockedFields;
    const lockedFields: string[] = lockedFieldsRaw
      ? (JSON.parse(lockedFieldsRaw) as string[])
      : [];

    const update: Partial<ComicInfo> = {};

    // Map selected fields to ComicInfo
    const fieldToComicInfo: Record<string, keyof ComicInfo> = {
      series: 'Series',
      number: 'Number',
      title: 'Title',
      summary: 'Summary',
      year: 'Year',
      month: 'Month',
      day: 'Day',
      writer: 'Writer',
      penciller: 'Penciller',
      inker: 'Inker',
      colorist: 'Colorist',
      letterer: 'Letterer',
      coverArtist: 'CoverArtist',
      editor: 'Editor',
      characters: 'Characters',
      teams: 'Teams',
      locations: 'Locations',
      storyArc: 'StoryArc',
      publisher: 'Publisher',
    };

    for (const fieldName of selectedFields) {
      // Skip locked fields
      if (lockedFields.includes(fieldName)) {
        logger.debug({ fieldName }, 'Skipping locked field');
        continue;
      }

      const comicInfoKey = fieldToComicInfo[fieldName];
      if (comicInfoKey) {
        const value = proposedMetadata[fieldName as keyof IssueMetadata];
        if (value !== undefined && value !== null) {
          (update as Record<string, unknown>)[comicInfoKey] = value;
        }
      }
    }

    // Always add the Web URL with issue ID for future lookups
    if (options.source === 'comicvine' && options.issueId) {
      update.Web = `https://comicvine.gamespot.com/issue/4000-${options.issueId}/`;
    }

    // Write to ComicInfo.xml
    const writeResult = await mergeComicInfo(filePath, update);
    if (!writeResult.success) {
      return { success: false, error: `Failed to write metadata: ${writeResult.error}` };
    }

    // Update database
    // Update file path if converted
    if (converted) {
      await prisma.comicFile.update({
        where: { id: fileId },
        data: {
          path: filePath,
          filename: basename(filePath),
          relativePath: file.relativePath.replace(/\.cbr$/i, '.cbz'),
        },
      });
    }

    // Update FileMetadata cache with the issue ID
    const metadataUpdate: Record<string, unknown> = {};
    if (options.source === 'comicvine' && options.issueId) {
      metadataUpdate.comicVineId = options.issueId;
    } else if (options.source === 'metron' && options.issueId) {
      metadataUpdate.metronId = options.issueId;
    }

    // Add selected fields to metadata update
    for (const fieldName of selectedFields) {
      if (!lockedFields.includes(fieldName)) {
        const value = proposedMetadata[fieldName as keyof IssueMetadata];
        if (value !== undefined && value !== null) {
          metadataUpdate[fieldName] = value;
        }
      }
    }

    // Update the cache
    await prisma.fileMetadata.upsert({
      where: { comicId: fileId },
      update: {
        ...metadataUpdate,
        lastScanned: new Date(),
      },
      create: {
        comicId: fileId,
        ...metadataUpdate,
        lastScanned: new Date(),
      },
    });

    // Log the operation
    const operationLog = await prisma.operationLog.create({
      data: {
        operation: 'metadata_update',
        source: file.path,
        destination: filePath,
        status: 'success',
        reversible: true,
        metadata: JSON.stringify({
          type: 'issue_grab',
          source: options.source,
          issueId: options.issueId,
          fieldsUpdated: selectedFields,
          converted,
        }),
      },
    });

    logger.info(
      { fileId, issueId: options.issueId, fieldsUpdated: selectedFields.length },
      'Applied issue metadata successfully'
    );

    return {
      success: true,
      converted,
      newPath: converted ? filePath : undefined,
      operationId: operationLog.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ fileId, error: errorMessage }, 'Failed to apply issue metadata');

    // Log failed operation
    await prisma.operationLog.create({
      data: {
        operation: 'metadata_update',
        source: file.path,
        destination: filePath,
        status: 'failed',
        reversible: false,
        error: errorMessage,
        metadata: JSON.stringify({
          type: 'issue_grab',
          source: options.source,
          issueId: options.issueId,
        }),
      },
    });

    return { success: false, error: errorMessage };
  }
}
