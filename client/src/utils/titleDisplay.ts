/**
 * Title Display Utility
 *
 * Shared utility for computing display titles from metadata with fallbacks.
 * Used by CoverCard, FileList, and other components that display comic titles.
 */

import type { FileMetadata } from '../services/api.service';

export interface TitleDisplayResult {
  /** Main display text (issue title, "Issue #XX", or cleaned filename) */
  primaryTitle: string;
  /** Series name for subtitle display (null if not available) */
  subtitle: string | null;
  /** Full filename for tooltip/accessibility */
  tooltipTitle: string;
}

export interface TitleDisplayOptions {
  /** When true, always use filename instead of metadata */
  preferFilename?: boolean;
}

/**
 * Computes the display title for a comic file based on metadata.
 *
 * Priority order:
 * 1. metadata.title (issue title from ComicInfo.xml)
 * 2. "Issue #XX" (when title is null but number exists)
 * 3. Filename stripped of extension (when no metadata at all)
 *
 * @param file - Object containing filename and optional metadata
 * @param options - Configuration options
 * @returns Title display result with primary title, subtitle, and tooltip
 */
export function getTitleDisplay(
  file: { filename: string; metadata?: Partial<FileMetadata> | null },
  options: TitleDisplayOptions = {}
): TitleDisplayResult {
  const { preferFilename = false } = options;
  const metadata = file.metadata;

  // Clean filename for fallback/tooltip
  const cleanedFilename = file.filename.replace(/\.cb[rz7t]$/i, '');

  // If user prefers filename, use it directly
  if (preferFilename) {
    return {
      primaryTitle: cleanedFilename,
      subtitle: metadata?.series || null,
      tooltipTitle: file.filename,
    };
  }

  // Priority 1: Use metadata title if available
  if (metadata?.title) {
    return {
      primaryTitle: metadata.title,
      subtitle: metadata.series || null,
      tooltipTitle: file.filename,
    };
  }

  // Priority 2: Use "Issue #XX" if number exists but no title
  if (metadata?.number) {
    return {
      primaryTitle: `Issue #${metadata.number}`,
      subtitle: metadata.series || null,
      tooltipTitle: file.filename,
    };
  }

  // Priority 3: Fall back to cleaned filename
  return {
    primaryTitle: cleanedFilename,
    subtitle: metadata?.series || null,
    tooltipTitle: file.filename,
  };
}
