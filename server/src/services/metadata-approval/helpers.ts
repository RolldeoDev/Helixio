/**
 * Metadata Approval Helpers
 *
 * Utility functions for the metadata approval workflow.
 */

import { parseFilenameToQuery, type SearchQuery } from '../metadata-search.service.js';
import type { CachedIssuesData } from '../series-cache.service.js';
import type { ParsedFileData } from './types.js';

// =============================================================================
// Normalization
// =============================================================================

/**
 * Normalize series name for grouping
 */
export function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// =============================================================================
// Issue Data Accessors
// =============================================================================

/**
 * Get issue number from either ComicVine or Metron issue format
 * ComicVine uses `issue_number`, Metron uses `number`
 */
export function getIssueNumber(issue: CachedIssuesData['issues'][0]): string {
  // ComicVine format has issue_number
  if ('issue_number' in issue && issue.issue_number) {
    return issue.issue_number;
  }
  // Metron format has number
  if ('number' in issue && issue.number) {
    return issue.number;
  }
  return '';
}

/**
 * Get issue title from either ComicVine or Metron issue format
 * ComicVine uses `name?: string`, Metron uses `title?: string` or `name?: string[]`
 */
export function getIssueTitle(issue: CachedIssuesData['issues'][0]): string | undefined {
  // Metron format may have title as string
  if ('title' in issue && typeof issue.title === 'string' && issue.title) {
    return issue.title;
  }
  // ComicVine format has name as string
  if ('name' in issue && typeof issue.name === 'string' && issue.name) {
    return issue.name;
  }
  // Metron format may have name as array
  if ('name' in issue && Array.isArray(issue.name) && issue.name.length > 0) {
    return issue.name[0];
  }
  return undefined;
}

// =============================================================================
// File Grouping
// =============================================================================

/**
 * Group files by detected series name
 */
export function groupFilesBySeries(
  files: Array<{ id: string; filename: string }>
): Map<string, { query: SearchQuery; fileIds: string[]; filenames: string[] }> {
  const groups = new Map<string, { query: SearchQuery; fileIds: string[]; filenames: string[] }>();

  for (const file of files) {
    const query = parseFilenameToQuery(file.filename);
    const seriesKey = normalizeSeriesName(query.series || file.filename);

    const existing = groups.get(seriesKey);
    if (existing) {
      existing.fileIds.push(file.id);
      existing.filenames.push(file.filename);
      // Update year if this file has one and existing doesn't
      if (query.year && !existing.query.year) {
        existing.query.year = query.year;
      }
    } else {
      groups.set(seriesKey, {
        query,
        fileIds: [file.id],
        filenames: [file.filename],
      });
    }
  }

  return groups;
}

// =============================================================================
// Issue Matching
// =============================================================================

/**
 * Match a file to an issue based on issue number.
 * Uses parsed data (from LLM or regex) if provided, otherwise falls back to regex parsing.
 */
export function matchFileToIssue(
  filename: string,
  issues: CachedIssuesData['issues'],
  parsedData?: ParsedFileData
): { issue: CachedIssuesData['issues'][0] | null; confidence: number } {
  // Use parsed data if available, otherwise fall back to regex parsing
  let issueNumber: string | undefined;

  if (parsedData?.number) {
    // Use LLM-parsed or pre-parsed issue number
    issueNumber = parsedData.number;
  } else {
    // Fall back to regex parsing
    const query = parseFilenameToQuery(filename);
    issueNumber = query.issueNumber;
  }

  if (!issueNumber) {
    return { issue: null, confidence: 0 };
  }

  // Parse the issue number
  const fileIssueNum = issueNumber.replace(/^#/, '').trim();
  const fileIssueNumInt = parseInt(fileIssueNum, 10);

  // Find matching issue
  for (const issue of issues) {
    const issueNum = getIssueNumber(issue).replace(/^#/, '').trim();
    const issueNumInt = parseInt(issueNum, 10);

    // Exact match - higher confidence if from LLM
    if (fileIssueNum === issueNum) {
      return { issue, confidence: parsedData?.number ? 0.98 : 0.95 };
    }

    // Numeric match (handles leading zeros)
    if (!isNaN(fileIssueNumInt) && !isNaN(issueNumInt) && fileIssueNumInt === issueNumInt) {
      return { issue, confidence: parsedData?.number ? 0.95 : 0.9 };
    }
  }

  // No exact match - try fuzzy matching on original filename as last resort
  const numericMatch = filename.match(/(?:#|Issue\s*|No\.?\s*)(\d+)/i);
  if (numericMatch) {
    const extractedNum = parseInt(numericMatch[1]!, 10);
    for (const issue of issues) {
      const issueNumInt = parseInt(getIssueNumber(issue), 10);
      if (!isNaN(issueNumInt) && extractedNum === issueNumInt) {
        return { issue, confidence: 0.7 };
      }
    }
  }

  return { issue: null, confidence: 0 };
}
