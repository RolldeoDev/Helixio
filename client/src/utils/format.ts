/**
 * Format Utilities
 *
 * Shared formatting functions used across the application.
 */

/**
 * Format a file size in bytes to a human-readable string.
 *
 * @param bytes - The file size in bytes
 * @returns Formatted string (e.g., "1.5 MB", "256 KB")
 *
 * @example
 * formatFileSize(1536) // "1.5 KB"
 * formatFileSize(1048576) // "1 MB"
 * formatFileSize(0) // "0 B"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
