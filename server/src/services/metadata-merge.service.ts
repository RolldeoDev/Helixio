/**
 * Metadata Merge Service
 *
 * Merges metadata from multiple sources using a priority-based strategy.
 * Implements the "non-empty wins" merge rule with provenance tracking.
 */

import type {
  MetadataSource,
  SeriesMetadata,
  IssueMetadata,
  MergedSeriesMetadata,
  MergedIssueMetadata,
  AllValuesSeriesMetadata,
  AllValuesIssueMetadata,
  Credit,
} from './metadata-providers/types.js';
import { getMetadataSettings } from './config.service.js';

// =============================================================================
// Types
// =============================================================================

export interface MergeOptions {
  /** Source priority order (first = highest priority) */
  priorityOrder?: MetadataSource[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a value is considered "empty" (null, undefined, empty string, empty array)
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Get the default priority order from settings
 */
function getDefaultPriorityOrder(): MetadataSource[] {
  const settings = getMetadataSettings();
  return settings.sourcePriority || [settings.primarySource];
}

// =============================================================================
// Series Merge Functions
// =============================================================================

/** Fields that are arrays and should be taken entirely from one source */
const SERIES_ARRAY_FIELDS: (keyof SeriesMetadata)[] = [
  'characters',
  'creators',
  'locations',
  'objects',
  'aliases',
  'genres',
  'tags',
];

/** Fields that are scalar and should use non-empty wins */
const SERIES_SCALAR_FIELDS: (keyof SeriesMetadata)[] = [
  'name',
  'publisher',
  'startYear',
  'endYear',
  'issueCount',
  'description',
  'shortDescription',
  'coverUrl',
  'url',
  'seriesType',
  'volume',
  'firstIssueNumber',
  'lastIssueNumber',
];

/**
 * Merge series metadata from multiple sources
 *
 * Strategy:
 * - Scalar fields: First non-empty value from priority-ordered sources
 * - Array fields: Entire array from first source that has non-empty array
 * - Tracks which source provided each field for provenance display
 */
export function mergeSeries(
  results: Map<MetadataSource, SeriesMetadata | null>,
  options: MergeOptions = {}
): MergedSeriesMetadata | null {
  const priorityOrder = options.priorityOrder || getDefaultPriorityOrder();

  // Find sources that have data, in priority order
  const sourcesWithData: MetadataSource[] = [];
  for (const source of priorityOrder) {
    if (results.has(source) && results.get(source) !== null) {
      sourcesWithData.push(source);
    }
  }

  // Also add any sources not in priority order
  for (const [source, data] of results) {
    if (data !== null && !sourcesWithData.includes(source)) {
      sourcesWithData.push(source);
    }
  }

  if (sourcesWithData.length === 0) {
    return null;
  }

  // Start with the highest priority source as base
  const primarySource = sourcesWithData[0]!;
  const primaryData = results.get(primarySource)!;

  const merged: MergedSeriesMetadata = {
    ...primaryData,
    fieldSources: {},
    contributingSources: [],
  };

  // Track which sources contributed
  const contributingSources = new Set<MetadataSource>();

  // Merge scalar fields (non-empty wins)
  for (const field of SERIES_SCALAR_FIELDS) {
    for (const source of sourcesWithData) {
      const data = results.get(source);
      if (data && !isEmpty(data[field])) {
        // Use double-cast to work around strict type checking for dynamic field assignment
        (merged as unknown as Record<string, unknown>)[field] = data[field];
        merged.fieldSources[field] = source;
        contributingSources.add(source);
        break;
      }
    }
  }

  // Merge array fields (take entire array from best source)
  for (const field of SERIES_ARRAY_FIELDS) {
    for (const source of sourcesWithData) {
      const data = results.get(source);
      if (data && !isEmpty(data[field])) {
        // Use double-cast to work around strict type checking for dynamic field assignment
        (merged as unknown as Record<string, unknown>)[field] = data[field];
        merged.fieldSources[field] = source;
        contributingSources.add(source);
        break;
      }
    }
  }

  // Handle imageUrls specially - merge sub-fields
  for (const source of sourcesWithData) {
    const data = results.get(source);
    if (data?.imageUrls) {
      if (!merged.imageUrls) {
        merged.imageUrls = { ...data.imageUrls };
        merged.fieldSources['imageUrls'] = source;
        contributingSources.add(source);
      } else {
        // Fill in any missing image sizes
        if (!merged.imageUrls.thumb && data.imageUrls.thumb) {
          merged.imageUrls.thumb = data.imageUrls.thumb;
        }
        if (!merged.imageUrls.small && data.imageUrls.small) {
          merged.imageUrls.small = data.imageUrls.small;
        }
        if (!merged.imageUrls.medium && data.imageUrls.medium) {
          merged.imageUrls.medium = data.imageUrls.medium;
        }
      }
    }
  }

  // Source and sourceId come from the primary source
  merged.source = primarySource;
  merged.sourceId = primaryData.sourceId;
  merged.fieldSources['source'] = primarySource;
  merged.fieldSources['sourceId'] = primarySource;

  merged.contributingSources = Array.from(contributingSources);

  return merged;
}

// =============================================================================
// Issue Merge Functions
// =============================================================================

/** Fields that are arrays for issues */
const ISSUE_ARRAY_FIELDS: (keyof IssueMetadata)[] = [
  'characters',
  'teams',
  'locations',
];

/** Fields that are scalar for issues */
const ISSUE_SCALAR_FIELDS: (keyof IssueMetadata)[] = [
  'seriesName',
  'number',
  'title',
  'coverDate',
  'storeDate',
  'description',
  'coverUrl',
  'url',
  'publisher',
  'writer',
  'penciller',
  'inker',
  'colorist',
  'letterer',
  'coverArtist',
  'editor',
  'storyArc',
];

/**
 * Merge issue metadata from multiple sources
 */
export function mergeIssue(
  results: Map<MetadataSource, IssueMetadata | null>,
  options: MergeOptions = {}
): MergedIssueMetadata | null {
  const priorityOrder = options.priorityOrder || getDefaultPriorityOrder();

  // Find sources that have data, in priority order
  const sourcesWithData: MetadataSource[] = [];
  for (const source of priorityOrder) {
    if (results.has(source) && results.get(source) !== null) {
      sourcesWithData.push(source);
    }
  }

  // Also add any sources not in priority order
  for (const [source, data] of results) {
    if (data !== null && !sourcesWithData.includes(source)) {
      sourcesWithData.push(source);
    }
  }

  if (sourcesWithData.length === 0) {
    return null;
  }

  // Start with the highest priority source as base
  const primarySource = sourcesWithData[0]!;
  const primaryData = results.get(primarySource)!;

  const merged: MergedIssueMetadata = {
    ...primaryData,
    fieldSources: {},
    contributingSources: [],
  };

  // Track which sources contributed
  const contributingSources = new Set<MetadataSource>();

  // Merge scalar fields (non-empty wins)
  for (const field of ISSUE_SCALAR_FIELDS) {
    for (const source of sourcesWithData) {
      const data = results.get(source);
      if (data && !isEmpty(data[field])) {
        // Use double-cast to work around strict type checking for dynamic field assignment
        (merged as unknown as Record<string, unknown>)[field] = data[field];
        merged.fieldSources[field] = source;
        contributingSources.add(source);
        break;
      }
    }
  }

  // Merge array fields (take entire array from best source)
  for (const field of ISSUE_ARRAY_FIELDS) {
    for (const source of sourcesWithData) {
      const data = results.get(source);
      if (data && !isEmpty(data[field])) {
        // Use double-cast to work around strict type checking for dynamic field assignment
        (merged as unknown as Record<string, unknown>)[field] = data[field];
        merged.fieldSources[field] = source;
        contributingSources.add(source);
        break;
      }
    }
  }

  // Source and sourceId come from the primary source
  merged.source = primarySource;
  merged.sourceId = primaryData.sourceId;
  merged.seriesId = primaryData.seriesId;
  merged.fieldSources['source'] = primarySource;
  merged.fieldSources['sourceId'] = primarySource;
  merged.fieldSources['seriesId'] = primarySource;

  merged.contributingSources = Array.from(contributingSources);

  return merged;
}

// =============================================================================
// All-Values Merge Functions (for per-field source selection UI)
// =============================================================================

export interface AllValuesMergeOptions extends MergeOptions {
  /** Per-field source overrides (e.g., { "writer": "metron" }) */
  fieldOverrides?: Record<string, MetadataSource>;
}

/**
 * Collect all values for a field from all sources.
 */
function collectAllFieldValues(
  results: Map<MetadataSource, SeriesMetadata | IssueMetadata | null>,
  field: string
): Record<MetadataSource, unknown> {
  const values: Record<MetadataSource, unknown> = {} as Record<MetadataSource, unknown>;

  for (const [source, data] of results) {
    if (data !== null) {
      const value = (data as unknown as Record<string, unknown>)[field];
      values[source] = value ?? null;
    }
  }

  return values;
}

/**
 * Merge series metadata with all-values tracking for per-field selection.
 *
 * This extended merge function:
 * 1. Performs the standard priority-based merge
 * 2. Tracks ALL values from ALL sources for each field
 * 3. Supports per-field source overrides
 */
export function mergeSeriesWithAllValues(
  results: Map<MetadataSource, SeriesMetadata | null>,
  options: AllValuesMergeOptions = {}
): AllValuesSeriesMetadata | null {
  // First, do the standard merge
  const baseMerged = mergeSeries(results, options);
  if (!baseMerged) return null;

  const priorityOrder = options.priorityOrder || getDefaultPriorityOrder();

  // Find sources that have data
  const sourcesWithData: MetadataSource[] = [];
  for (const source of priorityOrder) {
    if (results.has(source) && results.get(source) !== null) {
      sourcesWithData.push(source);
    }
  }
  for (const [source, data] of results) {
    if (data !== null && !sourcesWithData.includes(source)) {
      sourcesWithData.push(source);
    }
  }

  // Collect all field values
  const allFieldValues: Record<string, Record<MetadataSource, unknown>> = {};

  // Scalar fields
  for (const field of SERIES_SCALAR_FIELDS) {
    allFieldValues[field] = collectAllFieldValues(results, field);
  }

  // Array fields
  for (const field of SERIES_ARRAY_FIELDS) {
    allFieldValues[field] = collectAllFieldValues(results, field);
  }

  // Create the extended merged result
  const merged: AllValuesSeriesMetadata = {
    ...baseMerged,
    allFieldValues,
    fieldSourceOverrides: options.fieldOverrides,
  };

  // Apply field overrides if provided
  if (options.fieldOverrides) {
    for (const [field, preferredSource] of Object.entries(options.fieldOverrides)) {
      const sourceData = results.get(preferredSource);
      if (sourceData) {
        const value = (sourceData as unknown as Record<string, unknown>)[field];
        if (!isEmpty(value)) {
          (merged as unknown as Record<string, unknown>)[field] = value;
          merged.fieldSources[field] = preferredSource;
        }
      }
    }
  }

  return merged;
}

/**
 * Merge issue metadata with all-values tracking for per-field selection.
 */
export function mergeIssueWithAllValues(
  results: Map<MetadataSource, IssueMetadata | null>,
  options: AllValuesMergeOptions = {}
): AllValuesIssueMetadata | null {
  // First, do the standard merge
  const baseMerged = mergeIssue(results, options);
  if (!baseMerged) return null;

  const priorityOrder = options.priorityOrder || getDefaultPriorityOrder();

  // Find sources that have data
  const sourcesWithData: MetadataSource[] = [];
  for (const source of priorityOrder) {
    if (results.has(source) && results.get(source) !== null) {
      sourcesWithData.push(source);
    }
  }
  for (const [source, data] of results) {
    if (data !== null && !sourcesWithData.includes(source)) {
      sourcesWithData.push(source);
    }
  }

  // Collect all field values
  const allFieldValues: Record<string, Record<MetadataSource, unknown>> = {};

  // Scalar fields
  for (const field of ISSUE_SCALAR_FIELDS) {
    allFieldValues[field] = collectAllFieldValues(results, field);
  }

  // Array fields
  for (const field of ISSUE_ARRAY_FIELDS) {
    allFieldValues[field] = collectAllFieldValues(results, field);
  }

  // Create the extended merged result
  const merged: AllValuesIssueMetadata = {
    ...baseMerged,
    allFieldValues,
    fieldSourceOverrides: options.fieldOverrides,
  };

  // Apply field overrides if provided
  if (options.fieldOverrides) {
    for (const [field, preferredSource] of Object.entries(options.fieldOverrides)) {
      const sourceData = results.get(preferredSource);
      if (sourceData) {
        const value = (sourceData as unknown as Record<string, unknown>)[field];
        if (!isEmpty(value)) {
          (merged as unknown as Record<string, unknown>)[field] = value;
          merged.fieldSources[field] = preferredSource;
        }
      }
    }
  }

  return merged;
}

/**
 * Apply field source overrides to an existing merged result.
 * Useful when user changes field selections in the UI.
 */
export function applyFieldOverrides<T extends MergedSeriesMetadata | MergedIssueMetadata>(
  merged: T,
  allFieldValues: Record<string, Record<MetadataSource, unknown>>,
  overrides: Record<string, MetadataSource>
): T {
  const updated = { ...merged };

  for (const [field, preferredSource] of Object.entries(overrides)) {
    const sourceValues = allFieldValues[field];
    if (sourceValues && sourceValues[preferredSource] !== undefined) {
      const value = sourceValues[preferredSource];
      if (!isEmpty(value)) {
        (updated as unknown as Record<string, unknown>)[field] = value;
        updated.fieldSources[field] = preferredSource;
      }
    }
  }

  return updated;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Find the best matching series across multiple source results
 * Matches by name similarity and year
 */
export function findBestMatch(
  target: SeriesMetadata,
  candidates: SeriesMetadata[]
): SeriesMetadata | null {
  if (candidates.length === 0) return null;

  // Normalize name for comparison
  const normalizeName = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const targetName = normalizeName(target.name);

  // Score each candidate
  let bestMatch: SeriesMetadata | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;

    // Name similarity
    const candidateName = normalizeName(candidate.name);
    if (candidateName === targetName) {
      score += 100;
    } else if (candidateName.includes(targetName) || targetName.includes(candidateName)) {
      score += 50;
    }

    // Year match
    if (target.startYear && candidate.startYear) {
      if (target.startYear === candidate.startYear) {
        score += 30;
      } else if (Math.abs(target.startYear - candidate.startYear) <= 1) {
        score += 15;
      }
    }

    // Publisher match
    if (target.publisher && candidate.publisher) {
      const targetPub = normalizeName(target.publisher);
      const candPub = normalizeName(candidate.publisher);
      if (targetPub === candPub) {
        score += 20;
      } else if (targetPub.includes(candPub) || candPub.includes(targetPub)) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Only return if we have a reasonable match
  return bestScore >= 50 ? bestMatch : null;
}

// =============================================================================
// Export Service Object
// =============================================================================

export const MetadataMergeService = {
  mergeSeries,
  mergeIssue,
  mergeSeriesWithAllValues,
  mergeIssueWithAllValues,
  applyFieldOverrides,
  findBestMatch,
};

export default MetadataMergeService;
