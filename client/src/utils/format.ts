/**
 * Format Utilities
 *
 * Shared formatting functions used across the application.
 */

/**
 * Format a file size in bytes to a human-readable string.
 *
 * @param bytes - The file size in bytes (number or string for BigInt values)
 * @returns Formatted string (e.g., "1.5 MB", "256 KB")
 *
 * @example
 * formatFileSize(1536) // "1.5 KB"
 * formatFileSize(1048576) // "1 MB"
 * formatFileSize("2147483648") // "2 GB" (BigInt as string)
 * formatFileSize(0) // "0 B"
 */
export function formatFileSize(bytes: number | string): string {
  const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (!numBytes || numBytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format a number with thousand separators.
 *
 * @param num - The number to format
 * @returns Formatted string with locale-appropriate separators (e.g., "15,420")
 *
 * @example
 * formatNumber(15420) // "15,420"
 * formatNumber(1000000) // "1,000,000"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format a page count with optional label.
 *
 * @param pages - Number of pages
 * @param label - Whether to include "pages" label (default: true)
 * @returns Formatted string (e.g., "15,420 pages")
 *
 * @example
 * formatPageCount(15420) // "15,420 pages"
 * formatPageCount(1) // "1 page"
 * formatPageCount(15420, false) // "15,420"
 */
export function formatPageCount(pages: number, label = true): string {
  const formatted = formatNumber(pages);
  if (!label) return formatted;
  return `${formatted} ${pages === 1 ? 'page' : 'pages'}`;
}

/**
 * Truncate a folder path for display, showing first and last segments.
 * Ensures the result never exceeds maxLength.
 *
 * @param path - The full folder path to truncate
 * @param maxLength - Maximum length of the result (default: 50)
 * @returns Truncated path string (e.g., "Comics/.../Issue 001")
 *
 * @example
 * truncatePath('/Comics/Marvel/Spider-Man/Issue 001', 30)
 * // "Comics/.../Issue 001"
 */
export function truncatePath(path: string, maxLength = 50): string {
  if (!path || path.length <= maxLength) return path;
  const parts = path.split('/').filter(Boolean);

  // For paths with 2 or fewer segments, use ellipsis truncation
  if (parts.length <= 2) {
    return path.substring(0, maxLength - 3) + '...';
  }

  const firstPart = parts[0] ?? '';
  const lastPart = parts[parts.length - 1] ?? '';

  // Build "first/.../last" format
  const truncated = `${firstPart}/.../${lastPart}`;

  // If still too long, truncate the last segment
  if (truncated.length > maxLength) {
    const maxLastPartLength = maxLength - firstPart.length - 7; // Account for "/.../..."
    if (maxLastPartLength > 3) {
      return `${firstPart}/.../${lastPart.substring(0, maxLastPartLength - 3)}...`;
    }
    return truncated.substring(0, maxLength - 3) + '...';
  }

  return truncated;
}
