/**
 * Cross-Source Matcher Service
 *
 * Provides intelligent matching of series across different metadata sources.
 * Uses weighted confidence scoring based on title, year, publisher, issue count,
 * and creator overlap to find the best matches.
 */

import { getDatabase } from './database.service.js';
import { ProviderRegistry } from './metadata-providers/registry.js';
import { logError } from './logger.service.js';
import type {
  MetadataSource,
  SeriesMetadata,
  IssueMetadata,
  CrossMatchFactors,
  CrossSourceMatch,
  CrossSourceResult,
  CrossMatchOptions,
  IssueMatchFactors,
  IssueCrossMatch,
  Credit,
} from './metadata-providers/types.js';
import { getMetadataSettings } from './config.service.js';

// =============================================================================
// Constants
// =============================================================================

/** Default auto-match threshold (95% confidence) */
const DEFAULT_AUTO_MATCH_THRESHOLD = 0.95;

/** Confidence scoring weights */
const WEIGHTS = {
  titleSimilarity: 0.35,
  publisherMatch: 0.20,
  yearMatch: 0.20,
  issueCountMatch: 0.10,
  creatorOverlap: 0.10,
  aliasMatch: 0.05,
};

/** Publisher normalization map for common variations */
const PUBLISHER_NORMALIZATIONS: Record<string, string> = {
  'dc': 'dc comics',
  'dc comics': 'dc comics',
  'dc comics, inc.': 'dc comics',
  'marvel': 'marvel comics',
  'marvel comics': 'marvel comics',
  'marvel comics group': 'marvel comics',
  'image': 'image comics',
  'image comics': 'image comics',
  'dark horse': 'dark horse comics',
  'dark horse comics': 'dark horse comics',
  'idw': 'idw publishing',
  'idw publishing': 'idw publishing',
  'boom': 'boom! studios',
  'boom!': 'boom! studios',
  'boom! studios': 'boom! studios',
  'boom studios': 'boom! studios',
  'dynamite': 'dynamite entertainment',
  'dynamite entertainment': 'dynamite entertainment',
  'valiant': 'valiant entertainment',
  'valiant entertainment': 'valiant entertainment',
  'oni': 'oni press',
  'oni press': 'oni press',
};

// =============================================================================
// String Similarity Functions
// =============================================================================

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

  return matrix[b.length]![a.length]!;
}

/**
 * Normalize a series name for comparison.
 * Removes common prefixes/suffixes, volumes, years, and special characters.
 */
function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(\d{4}\)/g, '') // Remove year in parentheses like (2019)
    .replace(/\s*vol\.?\s*\d+/gi, '') // Remove volume numbers
    .replace(/\s*volume\s*\d+/gi, '')
    .replace(/^the\s+/i, '') // Remove leading "The"
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two series names (0-1).
 */
function calculateTitleSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeSeriesName(name1);
  const norm2 = normalizeSeriesName(name2);

  if (norm1 === norm2) return 1.0;
  if (norm1.length === 0 || norm2.length === 0) return 0.0;

  // Check for containment (partial match)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const lengthRatio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);
    return 0.7 + 0.3 * lengthRatio;
  }

  // Token-based matching for multi-word titles
  const tokens1 = norm1.split(/\s+/);
  const tokens2 = norm2.split(/\s+/);
  const matchingTokens = tokens1.filter(t => tokens2.includes(t)).length;
  const tokenScore = matchingTokens / Math.max(tokens1.length, tokens2.length);

  // Levenshtein-based similarity
  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  const levenshteinScore = 1 - distance / maxLength;

  // Combine token and Levenshtein scores
  return Math.max(tokenScore, levenshteinScore);
}

/**
 * Normalize a publisher name for comparison.
 */
function normalizePublisher(publisher: string): string {
  const lower = publisher.toLowerCase().trim();
  return PUBLISHER_NORMALIZATIONS[lower] || lower;
}

/**
 * Check if two publishers match (with normalization).
 */
function publishersMatch(pub1: string | undefined, pub2: string | undefined): boolean {
  if (!pub1 || !pub2) return false;
  return normalizePublisher(pub1) === normalizePublisher(pub2);
}

/**
 * Calculate year match score.
 */
function calculateYearMatch(year1: number | undefined, year2: number | undefined): 'exact' | 'close' | 'none' {
  if (!year1 || !year2) return 'none';
  if (year1 === year2) return 'exact';
  if (Math.abs(year1 - year2) <= 1) return 'close';
  return 'none';
}

/**
 * Check if issue counts are within tolerance (10%).
 */
function issueCountsMatch(count1: number | undefined, count2: number | undefined): boolean {
  if (!count1 || !count2) return false;
  const tolerance = Math.max(count1, count2) * 0.1;
  return Math.abs(count1 - count2) <= tolerance;
}

/**
 * Extract creator names from Credits array.
 */
function extractCreatorNames(credits: Credit[] | undefined): string[] {
  if (!credits || credits.length === 0) return [];
  return credits.map(c => c.name.toLowerCase().trim());
}

/**
 * Find overlapping creators between two series.
 */
function findCreatorOverlap(series1: SeriesMetadata, series2: SeriesMetadata): string[] {
  const creators1 = new Set(extractCreatorNames(series1.creators));
  const creators2 = extractCreatorNames(series2.creators);

  return creators2.filter(c => creators1.has(c));
}

/**
 * Check if any aliases match the target name.
 */
function aliasesMatch(aliases: string[] | undefined, targetName: string): boolean {
  if (!aliases || aliases.length === 0) return false;
  const normalizedTarget = normalizeSeriesName(targetName);
  return aliases.some(alias => normalizeSeriesName(alias) === normalizedTarget);
}

// =============================================================================
// Confidence Scoring
// =============================================================================

/**
 * Calculate cross-source match confidence and factors.
 */
function calculateMatchConfidence(
  primary: SeriesMetadata,
  candidate: SeriesMetadata
): { confidence: number; factors: CrossMatchFactors } {
  // Calculate individual factors
  const titleSimilarity = calculateTitleSimilarity(primary.name, candidate.name);
  const publisherMatch = publishersMatch(primary.publisher, candidate.publisher);
  const yearMatch = calculateYearMatch(primary.startYear, candidate.startYear);
  const issueCountMatch = issueCountsMatch(primary.issueCount, candidate.issueCount);
  const creatorOverlap = findCreatorOverlap(primary, candidate);
  const aliasMatch = aliasesMatch(candidate.aliases, primary.name) ||
                     aliasesMatch(primary.aliases, candidate.name);

  // Calculate weighted confidence
  let confidence = 0;

  // Title similarity (35%)
  confidence += titleSimilarity * WEIGHTS.titleSimilarity;

  // Publisher match (20%)
  if (publisherMatch) {
    confidence += WEIGHTS.publisherMatch;
  }

  // Year match (20%)
  if (yearMatch === 'exact') {
    confidence += WEIGHTS.yearMatch;
  } else if (yearMatch === 'close') {
    confidence += WEIGHTS.yearMatch * 0.5;
  }

  // Issue count match (10%)
  if (issueCountMatch) {
    confidence += WEIGHTS.issueCountMatch;
  }

  // Creator overlap (10%)
  if (creatorOverlap.length > 0) {
    const creatorScore = Math.min(creatorOverlap.length / 3, 1); // Max out at 3 matches
    confidence += creatorScore * WEIGHTS.creatorOverlap;
  }

  // Alias match (5%)
  if (aliasMatch) {
    confidence += WEIGHTS.aliasMatch;
  }

  const factors: CrossMatchFactors = {
    titleSimilarity,
    publisherMatch,
    yearMatch,
    issueCountMatch,
    creatorOverlap,
    aliasMatch,
  };

  return { confidence: Math.min(confidence, 1), factors };
}

// =============================================================================
// Cross-Source Matching
// =============================================================================

/**
 * Find matches for a series across secondary sources.
 */
export async function findCrossSourceMatches(
  primarySeries: SeriesMetadata,
  options: CrossMatchOptions = {}
): Promise<CrossSourceResult> {
  const settings = getMetadataSettings();
  const threshold = options.autoMatchThreshold ?? settings.autoMatchThreshold ?? DEFAULT_AUTO_MATCH_THRESHOLD;

  // Determine which sources to search
  const enabledSources = settings.enabledSources || [];
  const targetSources = options.targetSources ||
    enabledSources.filter(s => s !== primarySeries.source);

  const result: CrossSourceResult = {
    primarySource: primarySeries.source,
    primarySourceId: primarySeries.sourceId,
    matches: [],
    status: {} as Record<MetadataSource, 'matched' | 'no_match' | 'searching' | 'error' | 'skipped'>,
  };

  // Initialize status for all sources
  for (const source of enabledSources) {
    if (source === primarySeries.source) {
      result.status[source] = 'skipped';
    } else if (targetSources.includes(source)) {
      result.status[source] = 'searching';
    } else {
      result.status[source] = 'skipped';
    }
  }

  // Search each target source
  const searchPromises = targetSources.map(async (source) => {
    try {
      const provider = ProviderRegistry.get(source);
      if (!provider) {
        result.status[source] = 'error';
        return null;
      }

      // Check availability
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        result.status[source] = 'error';
        return null;
      }

      // Search for series with same name
      const searchResults = await provider.searchSeries(
        {
          series: primarySeries.name,
          year: primarySeries.startYear,
          publisher: primarySeries.publisher,
        },
        { limit: 10, sessionId: options.sessionId }
      );

      if (searchResults.results.length === 0) {
        result.status[source] = 'no_match';
        return null;
      }

      // Score each result
      let bestMatch: CrossSourceMatch | null = null;
      let bestConfidence = 0;

      for (const candidate of searchResults.results) {
        const { confidence, factors } = calculateMatchConfidence(primarySeries, candidate);

        // Apply year penalty for different series with same name
        // e.g., Batman (2011) should not match Batman (2016) with high confidence
        if (factors.yearMatch === 'none' && primarySeries.startYear && candidate.startYear) {
          const yearDiff = Math.abs(primarySeries.startYear - candidate.startYear);
          if (yearDiff > 2) {
            // Significant penalty for different years
            continue; // Skip this candidate entirely for large year differences
          }
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = {
            source,
            sourceId: candidate.sourceId,
            seriesData: candidate,
            confidence,
            matchFactors: factors,
            isAutoMatchCandidate: confidence >= threshold,
          };
        }
      }

      if (bestMatch) {
        result.status[source] = 'matched';
        return bestMatch;
      } else {
        result.status[source] = 'no_match';
        return null;
      }
    } catch (error) {
      logError('cross-source-matcher', error instanceof Error ? error : new Error(String(error)), { action: 'search-source', source });
      result.status[source] = 'error';
      return null;
    }
  });

  // Wait for all searches to complete
  const matches = await Promise.all(searchPromises);

  // Filter out nulls and add to result
  result.matches = matches.filter((m): m is CrossSourceMatch => m !== null);

  // Sort by confidence (highest first)
  result.matches.sort((a, b) => b.confidence - a.confidence);

  return result;
}

/**
 * Get cached cross-source mappings for a series.
 */
export async function getCachedMappings(
  source: MetadataSource,
  sourceId: string
): Promise<Array<{ matchedSource: MetadataSource; matchedSourceId: string; confidence: number }>> {
  const db = getDatabase();

  const mappings = await db.crossSourceMapping.findMany({
    where: {
      OR: [
        { primarySource: source, primarySourceId: sourceId },
        { matchedSource: source, matchedSourceId: sourceId },
      ],
    },
  });

  return mappings.map(m => {
    // Normalize to always return from the perspective of the queried source
    if (m.primarySource === source && m.primarySourceId === sourceId) {
      return {
        matchedSource: m.matchedSource as MetadataSource,
        matchedSourceId: m.matchedSourceId,
        confidence: m.confidence,
      };
    } else {
      return {
        matchedSource: m.primarySource as MetadataSource,
        matchedSourceId: m.primarySourceId,
        confidence: m.confidence,
      };
    }
  });
}

/**
 * Save a cross-source mapping to the cache.
 */
export async function saveCrossSourceMapping(
  primarySource: MetadataSource,
  primarySourceId: string,
  matchedSource: MetadataSource,
  matchedSourceId: string,
  confidence: number,
  matchMethod: 'auto' | 'user' | 'api_link',
  matchFactors?: CrossMatchFactors
): Promise<void> {
  const db = getDatabase();

  await db.crossSourceMapping.upsert({
    where: {
      primarySource_primarySourceId_matchedSource: {
        primarySource,
        primarySourceId,
        matchedSource,
      },
    },
    create: {
      primarySource,
      primarySourceId,
      matchedSource,
      matchedSourceId,
      confidence,
      matchMethod,
      matchFactors: matchFactors ? JSON.stringify(matchFactors) : null,
      verified: matchMethod === 'user',
    },
    update: {
      matchedSourceId,
      confidence,
      matchMethod,
      matchFactors: matchFactors ? JSON.stringify(matchFactors) : null,
      verified: matchMethod === 'user' ? true : undefined,
    },
  });
}

/**
 * Invalidate cross-source mappings for a series (when source data is refreshed).
 */
export async function invalidateCrossSourceMappings(
  source: MetadataSource,
  sourceId: string
): Promise<number> {
  const db = getDatabase();

  const result = await db.crossSourceMapping.deleteMany({
    where: {
      OR: [
        { primarySource: source, primarySourceId: sourceId },
        { matchedSource: source, matchedSourceId: sourceId },
      ],
    },
  });

  return result.count;
}

/**
 * Check if we have cached mappings for a series from all enabled sources.
 */
export async function hasCachedMappingsForAllSources(
  source: MetadataSource,
  sourceId: string
): Promise<boolean> {
  const settings = getMetadataSettings();
  const enabledSources = settings.enabledSources || [];
  const otherSources = enabledSources.filter(s => s !== source);

  if (otherSources.length === 0) return true;

  const cachedMappings = await getCachedMappings(source, sourceId);
  const mappedSources = new Set(cachedMappings.map(m => m.matchedSource));

  return otherSources.every(s => mappedSources.has(s));
}

// =============================================================================
// Issue-Level Cross-Source Matching
// =============================================================================

/** Issue matching weights */
const ISSUE_WEIGHTS = {
  issueNumber: 0.50,
  coverDate: 0.25,
  titleMatch: 0.15,
  pageCount: 0.10,
};

/**
 * Normalize issue number for comparison.
 * Handles leading zeros, special issues (½, 0, -1), and suffixes.
 */
function normalizeIssueNumber(issueNumber: string | undefined): string | null {
  if (issueNumber === undefined || issueNumber === null || issueNumber === '') return null;

  const str = issueNumber.toLowerCase().trim();

  // Handle special issue numbers
  if (str === '½' || str === '1/2' || str === '0.5') return '0.5';

  // Extract numeric part
  const numMatch = str.match(/^(-?\d+(?:\.\d+)?)/);
  if (numMatch) {
    return numMatch[1]!;
  }

  return str;
}

/**
 * Parse cover date string to comparable format (YYYY-MM).
 */
function parseCoverDate(dateStr: string | undefined): { year: number; month: number } | null {
  if (!dateStr) return null;

  // Try various date formats
  const formats = [
    /^(\d{4})-(\d{2})/, // YYYY-MM
    /^(\d{4})-(\d{2})-\d{2}/, // YYYY-MM-DD
    /^(\w+)\s+(\d{4})/i, // Month YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const year = parseInt(match[1] || match[2] || '0', 10);
      let month = 0;

      if (match[2] && /^\d+$/.test(match[2])) {
        month = parseInt(match[2], 10);
      } else if (match[1] && !/^\d+$/.test(match[1])) {
        // Parse month name
        const monthNames: Record<string, number> = {
          'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
          'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
          'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'october': 10, 'oct': 10,
          'november': 11, 'nov': 11, 'december': 12, 'dec': 12,
        };
        month = monthNames[match[1].toLowerCase()] || 0;
      }

      if (year > 1900 && year < 2100) {
        return { year, month };
      }
    }
  }

  return null;
}

/**
 * Calculate issue match confidence and factors.
 */
function calculateIssueMatchConfidence(
  primaryIssue: IssueMetadata,
  candidateIssue: IssueMetadata
): { confidence: number; factors: IssueMatchFactors } {
  let confidence = 0;

  // Issue number match (50%)
  const primaryNum = normalizeIssueNumber(primaryIssue.number);
  const candidateNum = normalizeIssueNumber(candidateIssue.number);
  const numberMatch = primaryNum !== null &&
                      candidateNum !== null &&
                      primaryNum === candidateNum;

  if (numberMatch) {
    confidence += ISSUE_WEIGHTS.issueNumber;
  }

  // Cover date match (25%)
  const primaryDate = parseCoverDate(primaryIssue.coverDate);
  const candidateDate = parseCoverDate(candidateIssue.coverDate);
  let coverDateMatch: 'exact' | 'close' | 'none' = 'none';

  if (primaryDate && candidateDate) {
    if (primaryDate.year === candidateDate.year && primaryDate.month === candidateDate.month) {
      coverDateMatch = 'exact';
      confidence += ISSUE_WEIGHTS.coverDate;
    } else if (primaryDate.year === candidateDate.year &&
               Math.abs(primaryDate.month - candidateDate.month) <= 1) {
      coverDateMatch = 'close';
      confidence += ISSUE_WEIGHTS.coverDate * 0.5;
    }
  }

  // Title match (15%)
  let titleSimilarity = 0;
  if (primaryIssue.title && candidateIssue.title) {
    titleSimilarity = calculateTitleSimilarity(primaryIssue.title, candidateIssue.title);
    confidence += titleSimilarity * ISSUE_WEIGHTS.titleMatch;
  } else if (!primaryIssue.title && !candidateIssue.title) {
    // Both have no title - neutral, give partial credit
    titleSimilarity = 0.5;
    confidence += ISSUE_WEIGHTS.titleMatch * 0.5;
  }

  // Page count match (10%) - skip if not available (IssueMetadata doesn't have pageCount)
  // This would require fetching full issue details to compare
  const pageCountMatch = false;

  const factors: IssueMatchFactors = {
    numberMatch,
    coverDateMatch,
    titleSimilarity,
    pageCountMatch,
  };

  return { confidence: Math.min(confidence, 1), factors };
}

/**
 * Find matching issue in a list of candidate issues.
 */
export function findMatchingIssue(
  primaryIssue: IssueMetadata,
  candidateIssues: IssueMetadata[],
  threshold: number = 0.7
): IssueCrossMatch | null {
  let bestMatch: IssueCrossMatch | null = null;
  let bestConfidence = 0;

  for (const candidate of candidateIssues) {
    const { confidence, factors } = calculateIssueMatchConfidence(primaryIssue, candidate);

    // Issue number must match for a valid match
    if (!factors.numberMatch) continue;

    if (confidence > bestConfidence && confidence >= threshold) {
      bestConfidence = confidence;
      bestMatch = {
        source: candidate.source,
        issue: candidate,
        confidence,
        matchFactors: factors,
      };
    }
  }

  return bestMatch;
}

/**
 * Find cross-source matches for an issue given series mappings.
 */
export async function findIssueCrossMatches(
  primaryIssue: IssueMetadata,
  seriesSourceMappings: Array<{ source: MetadataSource; sourceId: string }>,
  options: { sessionId?: string; threshold?: number } = {}
): Promise<IssueCrossMatch[]> {
  const threshold = options.threshold ?? 0.7;
  const matches: IssueCrossMatch[] = [];

  for (const mapping of seriesSourceMappings) {
    // Skip the primary source
    if (mapping.source === primaryIssue.source) continue;

    try {
      const provider = ProviderRegistry.get(mapping.source);
      if (!provider) continue;

      // Get issues from the mapped series
      const issuesResult = await provider.getSeriesIssues(mapping.sourceId, {
        sessionId: options.sessionId,
        limit: 200, // Get all issues
      });

      if (issuesResult.results.length === 0) continue;

      // Find matching issue
      const match = findMatchingIssue(primaryIssue, issuesResult.results, threshold);
      if (match) {
        matches.push(match);
      }
    } catch (error) {
      logError('cross-source-matcher', error instanceof Error ? error : new Error(String(error)), { action: 'find-issue-match', source: mapping.source });
    }
  }

  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

// =============================================================================
// Export Service Object
// =============================================================================

export const CrossSourceMatcherService = {
  findCrossSourceMatches,
  getCachedMappings,
  saveCrossSourceMapping,
  invalidateCrossSourceMappings,
  hasCachedMappingsForAllSources,
  // Issue-level matching
  findMatchingIssue,
  findIssueCrossMatches,
  // Utility functions for testing
  calculateTitleSimilarity,
  normalizePublisher,
  publishersMatch,
  normalizeIssueNumber,
};

export default CrossSourceMatcherService;
