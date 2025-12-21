/**
 * Theme Import/Export Utilities
 * Handles zip creation and parsing for theme packages
 */

import JSZip from 'jszip';
import type { ThemeDefinition, ColorScheme } from './types';
import { generateThemeCSS } from './index';

export interface ThemePackageMetadata {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  scheme: ColorScheme;
}

export interface ThemePackage {
  metadata: ThemePackageMetadata;
  css: string;
}

/**
 * Export a theme as a zip file
 */
export async function exportThemeAsZip(
  theme: ThemeDefinition,
  userOverrides: Record<string, string> = {}
): Promise<Blob> {
  const zip = new JSZip();

  // Create metadata
  const metadata: ThemePackageMetadata = {
    id: `${theme.id}-custom`,
    name: `${theme.meta.name} (Custom)`,
    description: theme.meta.description,
    author: theme.meta.author || 'User Export',
    version: '1.0.0',
    scheme: theme.scheme,
  };

  // Generate CSS with overrides
  const css = generateThemeCSS(theme, userOverrides);

  // Add files to zip
  zip.file('theme.json', JSON.stringify(metadata, null, 2));
  zip.file('theme.css', css);

  // Generate zip blob
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Parse a theme package from a zip file
 */
export async function parseThemeZip(file: File): Promise<ThemePackage> {
  const zip = await JSZip.loadAsync(file);

  // Look for theme.json and theme.css
  const metadataFile = zip.file('theme.json');
  const cssFile = zip.file('theme.css');

  if (!metadataFile) {
    throw new Error('Invalid theme package: missing theme.json');
  }

  if (!cssFile) {
    throw new Error('Invalid theme package: missing theme.css');
  }

  // Parse metadata
  const metadataContent = await metadataFile.async('string');
  let metadata: ThemePackageMetadata;

  try {
    metadata = JSON.parse(metadataContent);
  } catch (e) {
    throw new Error('Invalid theme package: malformed theme.json');
  }

  // Validate required fields
  if (!metadata.id || !metadata.name) {
    throw new Error('Invalid theme package: missing required metadata fields');
  }

  // Parse CSS
  const css = await cssFile.async('string');

  // Validate CSS has some content
  if (!css.trim()) {
    throw new Error('Invalid theme package: empty theme.css');
  }

  return { metadata, css };
}

/**
 * Create a downloadable theme file from a blob
 */
export function downloadThemeBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a theme filename from theme info
 */
export function generateThemeFilename(
  themeId: string,
  scheme: ColorScheme,
  suffix?: string
): string {
  const parts = ['helixio-theme', themeId, scheme];
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join('-') + '.zip';
}
