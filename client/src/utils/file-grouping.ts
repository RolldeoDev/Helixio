/**
 * File Grouping Utilities
 *
 * Shared functions for grouping comic files by metadata fields.
 * Used by GridView and ListView components.
 *
 * Supports multi-value fields (genre, writer, penciller) where a single
 * file can appear in multiple groups based on comma-separated values.
 */

import type { ComicFile } from '../services/api.service';
import type { GroupField } from '../components/SortGroup/SortGroupPanel';

/** Fields that support multiple comma-separated values */
const MULTI_VALUE_FIELDS: GroupField[] = ['genre', 'writer', 'penciller'];

/** Fallback labels when field values are missing or empty */
const FALLBACK_LABELS: Record<GroupField, string> = {
  none: '',
  series: 'Unknown Series',
  publisher: 'Unknown Publisher',
  year: 'Unknown Year',
  genre: 'Unknown Genre',
  writer: 'Unknown Writer',
  penciller: 'Unknown Artist',
  firstLetter: '#',
};

/**
 * Parse a comma-separated string into an array of trimmed values.
 * Handles trailing commas, whitespace, and empty entries.
 *
 * @param value - The comma-separated string (or null/undefined)
 * @param fallback - The fallback value if the string is empty or contains no valid values
 * @returns Array of individual non-empty values, or [fallback] if none found
 */
function parseCommaSeparated(value: string | null | undefined, fallback: string): string[] {
  if (!value || !value.trim()) {
    return [fallback];
  }

  const values = value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  return values.length > 0 ? values : [fallback];
}

/**
 * Get the group key for a file based on the selected group field.
 * Returns a single key - for multi-value fields, returns the first value.
 *
 * @param file - The comic file to get the group key for
 * @param groupField - The field to group by
 * @returns The group key string
 */
export function getGroupKey(file: ComicFile, groupField: GroupField): string {
  const fallback = FALLBACK_LABELS[groupField];

  switch (groupField) {
    case 'series':
      return file.metadata?.series || fallback;
    case 'publisher':
      return file.metadata?.publisher || fallback;
    case 'year':
      return file.metadata?.year?.toString() || fallback;
    case 'genre':
      return file.metadata?.genre || fallback;
    case 'writer':
      return file.metadata?.writer || fallback;
    case 'penciller':
      return file.metadata?.penciller || fallback;
    case 'firstLetter': {
      const name = file.metadata?.series || file.filename;
      const firstChar = name.charAt(0).toUpperCase();
      return /[A-Z]/.test(firstChar) ? firstChar : fallback;
    }
    default:
      return '';
  }
}

/**
 * Get all group keys for a file based on the selected group field.
 * For multi-value fields (genre, writer, penciller), returns multiple keys
 * by splitting comma-separated values.
 *
 * @param file - The comic file to get group keys for
 * @param groupField - The field to group by
 * @returns Array of group key strings
 */
function getGroupKeys(file: ComicFile, groupField: GroupField): string[] {
  // Single-value fields use the existing getGroupKey function
  if (!MULTI_VALUE_FIELDS.includes(groupField)) {
    return [getGroupKey(file, groupField)];
  }

  // Multi-value fields: split comma-separated values
  const fallback = FALLBACK_LABELS[groupField];
  switch (groupField) {
    case 'genre':
      return parseCommaSeparated(file.metadata?.genre, fallback);
    case 'writer':
      return parseCommaSeparated(file.metadata?.writer, fallback);
    case 'penciller':
      return parseCommaSeparated(file.metadata?.penciller, fallback);
    default:
      return [getGroupKey(file, groupField)];
  }
}

/**
 * Group files by the selected field.
 *
 * For multi-value fields (genre, writer, penciller), files will appear
 * in multiple groups. For example, a comic with "Action, Comedy" genre
 * will appear in both "Action" and "Comedy" groups.
 *
 * @param files - Array of comic files to group
 * @param groupField - The field to group by
 * @returns Map of group keys to arrays of files, sorted appropriately
 */
export function groupFiles(files: ComicFile[], groupField: GroupField): Map<string, ComicFile[]> {
  if (groupField === 'none') {
    return new Map([['', files]]);
  }

  const groups = new Map<string, ComicFile[]>();
  for (const file of files) {
    // Get all group keys for this file (may be multiple for multi-value fields)
    const keys = getGroupKeys(file, groupField);

    // Add file to all matching groups
    for (const key of keys) {
      const group = groups.get(key);
      if (group) {
        group.push(file);
      } else {
        groups.set(key, [file]);
      }
    }
  }

  // Sort groups (with # and Unknown at the end)
  const sortedEntries = Array.from(groups.entries()).sort((a, b) => {
    // Special characters/unknown values go to the end
    if (a[0] === '#') return 1;
    if (b[0] === '#') return -1;

    // For year grouping, sort numerically (Unknown Year at end)
    if (groupField === 'year') {
      const yearA = parseInt(a[0], 10);
      const yearB = parseInt(b[0], 10);
      if (isNaN(yearA)) return 1; // Unknown Year at end
      if (isNaN(yearB)) return -1;
      return yearA - yearB;
    }

    // Default: alphabetical sorting
    return a[0].localeCompare(b[0]);
  });

  return new Map(sortedEntries);
}
