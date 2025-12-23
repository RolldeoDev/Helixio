/**
 * File Grouping Utilities
 *
 * Shared functions for grouping comic files by metadata fields.
 * Used by GridView and ListView components.
 */

import type { ComicFile } from '../services/api.service';
import type { GroupField } from '../components/SortGroup/SortGroupPanel';

/**
 * Get the group key for a file based on the selected group field.
 *
 * @param file - The comic file to get the group key for
 * @param groupField - The field to group by
 * @returns The group key string
 */
export function getGroupKey(file: ComicFile, groupField: GroupField): string {
  switch (groupField) {
    case 'series':
      return file.metadata?.series || 'Unknown Series';
    case 'publisher':
      return file.metadata?.publisher || 'Unknown Publisher';
    case 'year':
      return file.metadata?.year?.toString() || 'Unknown Year';
    case 'genre':
      return file.metadata?.genre || 'Unknown Genre';
    case 'writer':
      return file.metadata?.writer || 'Unknown Writer';
    case 'penciller':
      return file.metadata?.penciller || 'Unknown Artist';
    case 'firstLetter': {
      const name = file.metadata?.series || file.filename;
      const firstChar = name.charAt(0).toUpperCase();
      return /[A-Z]/.test(firstChar) ? firstChar : '#';
    }
    default:
      return '';
  }
}

/**
 * Group files by the selected field.
 *
 * @param files - Array of comic files to group
 * @param groupField - The field to group by
 * @returns Map of group keys to arrays of files, sorted alphabetically
 */
export function groupFiles(files: ComicFile[], groupField: GroupField): Map<string, ComicFile[]> {
  if (groupField === 'none') {
    return new Map([['', files]]);
  }

  const groups = new Map<string, ComicFile[]>();
  for (const file of files) {
    const key = getGroupKey(file, groupField);
    const group = groups.get(key);
    if (group) {
      group.push(file);
    } else {
      groups.set(key, [file]);
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
