/**
 * Title Display Utility
 *
 * Shared utility for computing display titles from metadata with fallbacks.
 * Used by CoverCard, FileList, and other components that display comic titles.
 */

import type { FileMetadata } from '../services/api.service';

export interface TitleDisplayResult {
  /** Main display text (issue title, "Issue #XX", "Chapter X", or cleaned filename) */
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
 * Manga content type labels for display
 */
const CONTENT_TYPE_LABELS: Record<string, (num: string) => string> = {
  chapter: (num) => `Chapter ${formatDisplayNumber(num)}`,
  volume: (num) => `Volume ${formatDisplayNumber(num)}`,
  extra: (num) => `Extra ${formatDisplayNumber(num)}`,
  omake: (num) => `Omake ${formatDisplayNumber(num)}`,
  bonus: (num) => `Bonus ${formatDisplayNumber(num)}`,
  oneshot: () => 'One-Shot',
};

/**
 * Format a number for display (removes leading zeros, keeps decimals)
 */
function formatDisplayNumber(num: string): string {
  if (num.includes('.')) {
    const parts = num.split('.');
    const whole = parts[0] ?? '0';
    const decimal = parts[1] ?? '0';
    return `${parseInt(whole, 10)}.${decimal}`;
  }
  return parseInt(num, 10).toString();
}

/**
 * Generate a display label for manga content type
 */
function getContentTypeLabel(contentType: string, number?: string): string {
  const labelFn = CONTENT_TYPE_LABELS[contentType];
  if (!labelFn) {
    // Fallback for unknown types
    return number ? `Chapter ${formatDisplayNumber(number)}` : 'Unknown';
  }
  return labelFn(number || '1');
}

/**
 * Computes the display title for a comic file based on metadata.
 *
 * Priority order:
 * 1. metadata.title (explicit title from ComicInfo.xml or API)
 * 2. contentType + number for manga (e.g., "Chapter 5", "Volume 2")
 * 3. "Issue #XX" for comics (when title is null but number exists)
 * 4. Filename stripped of extension (when no metadata at all)
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

  // Priority 2: Use manga contentType + number if available
  // This handles the new manga classification system
  if (metadata?.contentType && (metadata?.number || metadata?.parsedChapter || metadata?.parsedVolume)) {
    const displayNumber = metadata.parsedChapter || metadata.parsedVolume || metadata.number;
    return {
      primaryTitle: getContentTypeLabel(metadata.contentType, displayNumber || undefined),
      subtitle: metadata.series || null,
      tooltipTitle: file.filename,
    };
  }

  // Priority 3: Use "Issue #XX" / format-based label if number exists but no title
  if (metadata?.number) {
    // Check if format indicates manga-style content
    const format = metadata.format?.toLowerCase();
    if (format === 'chapter' || format === 'volume') {
      return {
        primaryTitle: getContentTypeLabel(format, metadata.number),
        subtitle: metadata.series || null,
        tooltipTitle: file.filename,
      };
    }

    // Default to Issue #XX for western comics
    return {
      primaryTitle: `Issue #${metadata.number}`,
      subtitle: metadata.series || null,
      tooltipTitle: file.filename,
    };
  }

  // Priority 4: Fall back to cleaned filename
  return {
    primaryTitle: cleanedFilename,
    subtitle: metadata?.series || null,
    tooltipTitle: file.filename,
  };
}
